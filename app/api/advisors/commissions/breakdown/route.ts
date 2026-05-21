import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse, NextRequest } from 'next/server'

/**
 * Calcula la tasa de comisión sobre el interés basada en la puntualidad del pago.
 *   - Pago puntual (en fecha o antes): 40%
 *   - 1–30 días de atraso:              20%
 *   - Más de 30 días de atraso:          5%
 */
function getCommissionRate(paymentDateStr: string, dueDateStr: string): { rate: number; bucket: 'onTime' | 'late1to30' | 'lateOver30' } {
  const pay = parseYMD(paymentDateStr)
  const due = parseYMD(dueDateStr)
  const diffMs = pay.getTime() - due.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return { rate: 0.40, bucket: 'onTime' }
  if (diffDays <= 30) return { rate: 0.20, bucket: 'late1to30' }
  return { rate: 0.05, bucket: 'lateOver30' }
}

function parseYMD(ymd: string): Date {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(String(ymd))
  if (!m) return new Date(ymd)
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo, d, 12, 0, 0))
}

/**
 * GET /api/advisors/commissions/breakdown?advisor_id=xxx
 *
 * Retorna el desglose de comisión por préstamo para un asesor específico.
 * Cada préstamo incluye sus cuotas pagadas con el cálculo de comisión individual.
 * La suma de todas las comisiones por préstamo = el total de comisión del periodo.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const advisorId = searchParams.get('advisor_id')

    if (!advisorId) {
      return NextResponse.json({ error: 'advisor_id is required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: me } = await supabase.from('users').select('role, id').eq('auth_id', user.id).single()
    if (!me) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Solo admin, contador, o el propio asesor pueden ver el desglose
    if (!['admin', 'contador'].includes(me.role) && me.id !== advisorId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = await createAdminClient()

    // ─── 1. Obtener los clientes de este asesor ───
    const { data: advisorClients, error: clientsError } = await admin
      .from('clients')
      .select('id, first_name, last_name, email')
      .eq('advisor_id', advisorId)

    if (clientsError) {
      console.error('[breakdown] Error fetching clients:', clientsError)
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
    }

    if (!advisorClients || advisorClients.length === 0) {
      return NextResponse.json({ loans: [], totalCommission: 0, totalPayments: 0 })
    }

    const clientIds = advisorClients.map(c => String(c.id))
    const clientMap: Record<string, { name: string; email: string }> = {}
    for (const c of advisorClients) {
      clientMap[String(c.id)] = {
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        email: c.email || ''
      }
    }

    // ─── 2. Obtener préstamos de esos clientes ───
    const allLoans: any[] = []
    for (let i = 0; i < clientIds.length; i += 500) {
      const chunk = clientIds.slice(i, i + 500)
      const { data: loans } = await admin
        .from('loans')
        .select('id, client_id, amount, term_months, payment_frequency, loan_number, status')
        .in('client_id', chunk)
      if (loans) allLoans.push(...loans)
    }

    if (allLoans.length === 0) {
      return NextResponse.json({ loans: [], totalCommission: 0, totalPayments: 0 })
    }

    const loanIds = allLoans.map(l => String(l.id))
    const loanMap: Record<string, any> = {}
    for (const l of allLoans) {
      loanMap[String(l.id)] = l
    }

    // ─── 3. Obtener cuotas PAGADAS (sin comisión cortada) de esos préstamos ───
    const allPaidSchedules: any[] = []
    for (let i = 0; i < loanIds.length; i += 500) {
      const chunk = loanIds.slice(i, i + 500)
      const { data: schedules } = await admin
        .from('payment_schedule')
        .select('id, loan_id, due_date, interest, status, payment_number, principal, paid_amount')
        .eq('status', 'paid')
        .is('commission_paid_at', null)
        .in('loan_id', chunk)
      if (schedules) allPaidSchedules.push(...schedules)
    }

    // ─── 4. Obtener pagos para mapear fechas y IDs ───
    const { data: allPayments } = await admin
      .from('payments')
      .select('id, payment_date, schedule_id, loan_id')

    // Mapa: schedule_id → { payment_date, payment_id }
    const schedulePaymentMap: Record<string, { payment_date: string; payment_id: string }> = {}
    const loanPaymentDatesMap: Record<string, { payment_date: string; payment_id: string }[]> = {}

    for (const p of (allPayments || [])) {
      if (p.schedule_id && p.payment_date) {
        const existing = schedulePaymentMap[String(p.schedule_id)]
        if (!existing || String(p.payment_date) > existing.payment_date) {
          schedulePaymentMap[String(p.schedule_id)] = {
            payment_date: String(p.payment_date),
            payment_id: String(p.id)
          }
        }
      }
      if (p.loan_id && p.payment_date) {
        const lid = String(p.loan_id)
        if (!loanPaymentDatesMap[lid]) loanPaymentDatesMap[lid] = []
        loanPaymentDatesMap[lid].push({
          payment_date: String(p.payment_date),
          payment_id: String(p.id)
        })
      }
    }

    // ─── 5. Obtener total de cuotas por préstamo (para mostrar X/Y) ───
    const totalSchedulesByLoan: Record<string, number> = {}
    for (let i = 0; i < loanIds.length; i += 500) {
      const chunk = loanIds.slice(i, i + 500)
      const { data: allSchedules } = await admin
        .from('payment_schedule')
        .select('loan_id')
        .in('loan_id', chunk)
      if (allSchedules) {
        for (const s of allSchedules) {
          const lid = String(s.loan_id)
          totalSchedulesByLoan[lid] = (totalSchedulesByLoan[lid] || 0) + 1
        }
      }
    }

    // ─── 6. Agrupar cuotas pagadas por préstamo y calcular comisiones ───
    const loanBreakdowns: Record<string, {
      loan_id: string
      loan_number: string
      client_name: string
      client_email: string
      amount: number
      status: string
      paid_installments: number
      total_installments: number
      commission: number
      installments: {
        schedule_id: string
        payment_number: number
        due_date: string
        payment_date: string
        interest: number
        rate: number
        rate_label: string
        bucket: string
        commission_amount: number
        payment_id: string | null
      }[]
    }> = {}

    const bucketLabels: Record<string, string> = {
      onTime: 'Puntual (40%)',
      late1to30: '1-30 días (20%)',
      lateOver30: '+30 días (5%)'
    }

    for (const sched of allPaidSchedules) {
      const schedId = String(sched.id)
      const loanId = String(sched.loan_id || '')
      const dueDate = String(sched.due_date || '')
      const interest = Number(sched.interest || 0)

      if (!dueDate || !loanId) continue

      const loan = loanMap[loanId]
      if (!loan) continue

      const clientId = String(loan.client_id || '')
      const client = clientMap[clientId]
      if (!client) continue

      // Buscar fecha de pago
      let paymentDate = ''
      let paymentId: string | null = null

      const directPayment = schedulePaymentMap[schedId]
      if (directPayment) {
        paymentDate = directPayment.payment_date
        paymentId = directPayment.payment_id
      }

      if (!paymentDate) {
        const loanPayments = loanPaymentDatesMap[loanId] || []
        if (loanPayments.length > 0) {
          const dueDateMs = parseYMD(dueDate).getTime()
          loanPayments.sort((a, b) =>
            Math.abs(parseYMD(a.payment_date).getTime() - dueDateMs) -
            Math.abs(parseYMD(b.payment_date).getTime() - dueDateMs)
          )
          paymentDate = loanPayments[0].payment_date
          paymentId = loanPayments[0].payment_id
        }
      }

      if (!paymentDate) {
        paymentDate = dueDate // fallback: asumir puntual
      }

      const { rate, bucket } = getCommissionRate(paymentDate, dueDate)
      const commissionAmount = Math.round(interest * rate * 100) / 100

      if (!loanBreakdowns[loanId]) {
        loanBreakdowns[loanId] = {
          loan_id: loanId,
          loan_number: String(loan.loan_number || ''),
          client_name: client.name,
          client_email: client.email,
          amount: Number(loan.amount || 0),
          status: String(loan.status || ''),
          paid_installments: 0,
          total_installments: totalSchedulesByLoan[loanId] || 0,
          commission: 0,
          installments: []
        }
      }

      loanBreakdowns[loanId].paid_installments++
      loanBreakdowns[loanId].commission = Math.round((loanBreakdowns[loanId].commission + commissionAmount) * 100) / 100
      loanBreakdowns[loanId].installments.push({
        schedule_id: schedId,
        payment_number: Number(sched.payment_number || 0),
        due_date: dueDate,
        payment_date: paymentDate,
        interest,
        rate,
        rate_label: bucketLabels[bucket] || bucket,
        bucket,
        commission_amount: commissionAmount,
        payment_id: paymentId
      })
    }

    // Ordenar cuotas dentro de cada préstamo por payment_number
    for (const lb of Object.values(loanBreakdowns)) {
      lb.installments.sort((a, b) => a.payment_number - b.payment_number)
    }

    // Convertir a array y ordenar por comisión (mayor primero)
    const loansArray = Object.values(loanBreakdowns).sort((a, b) => b.commission - a.commission)

    const totalCommission = Math.round(loansArray.reduce((s, l) => s + l.commission, 0) * 100) / 100
    const totalPayments = loansArray.reduce((s, l) => s + l.paid_installments, 0)

    return NextResponse.json({
      loans: loansArray,
      totalCommission,
      totalPayments
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })

  } catch (error) {
    console.error('[commission-breakdown] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
