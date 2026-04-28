import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Calcula la tasa de comisión sobre el interés basada en la puntualidad del pago.
 * 
 *   - Pago puntual (en fecha o antes): 40%
 *   - 1–30 días de atraso:              20%
 *   - Más de 30 días de atraso:          5%
 *
 * Las comisiones se acreditan el 15 de cada mes (sobre el mes anterior).
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

interface AdvisorCommission {
  total: number
  onTime: number
  late1to30: number
  lateOver30: number
  paymentCount: number
  breakdown: { label: string; amount: number; pct: string; color: string }[]
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: me } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (!me || !['admin', 'contador'].includes(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = await createAdminClient()

    // ─── 1. Obtener TODAS las cuotas PAGADAS del payment_schedule ───
    // Esta es la fuente de verdad (la misma que usa el dashboard para "cuotas confirmadas")
    const { data: paidSchedules, error: schedError } = await admin
      .from('payment_schedule')
      .select('id, loan_id, due_date, interest, status, paid_amount')
      .eq('status', 'paid')
      .is('commission_paid_at', null)

    if (schedError) {
      console.error('[commissions] Error fetching payment_schedule:', schedError)
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    console.log(`[commissions] Paid schedules (cuotas pagadas): ${(paidSchedules || []).length}`)

    // ─── 2. Obtener TODOS los pagos para buscar la fecha real de pago ───
    const { data: allPayments } = await admin
      .from('payments')
      .select('id, payment_date, schedule_id, loan_id')

    // Mapa: schedule_id → payment_date (más reciente)
    const schedulePaymentDateMap: Record<string, string> = {}
    // Mapa alternativo: loan_id → payment_dates[] (para cuotas sin schedule_id directo)
    const loanPaymentDatesMap: Record<string, string[]> = {}

    for (const p of (allPayments || [])) {
      if (p.schedule_id && p.payment_date) {
        const existing = schedulePaymentDateMap[String(p.schedule_id)]
        // Si ya existe, tomar la más reciente
        if (!existing || String(p.payment_date) > existing) {
          schedulePaymentDateMap[String(p.schedule_id)] = String(p.payment_date)
        }
      }
      if (p.loan_id && p.payment_date) {
        const lid = String(p.loan_id)
        if (!loanPaymentDatesMap[lid]) loanPaymentDatesMap[lid] = []
        loanPaymentDatesMap[lid].push(String(p.payment_date))
      }
    }

    // ─── 3. Obtener loans → client_id ───
    const loanIds = Array.from(new Set((paidSchedules || []).map(s => String(s.loan_id)).filter(Boolean)))
    const loanClientMap: Record<string, string> = {}

    if (loanIds.length > 0) {
      for (let i = 0; i < loanIds.length; i += 500) {
        const chunk = loanIds.slice(i, i + 500)
        const { data: loans } = await admin
          .from('loans')
          .select('id, client_id')
          .in('id', chunk)
        for (const l of (loans || [])) {
          loanClientMap[String(l.id)] = String(l.client_id || '')
        }
      }
    }

    // ─── 4. Obtener clients → advisor_id ───
    const clientIds = Array.from(new Set(Object.values(loanClientMap).filter(Boolean)))
    const clientAdvisorMap: Record<string, string> = {}

    if (clientIds.length > 0) {
      for (let i = 0; i < clientIds.length; i += 500) {
        const chunk = clientIds.slice(i, i + 500)
        const { data: clients } = await admin
          .from('clients')
          .select('id, advisor_id')
          .in('id', chunk)
        for (const c of (clients || [])) {
          if (c.advisor_id) {
            clientAdvisorMap[String(c.id)] = String(c.advisor_id)
          }
        }
      }
    }

    // ─── 5. Calcular comisiones por asesor ───
    const commissions: Record<string, { total: number; onTime: number; late1to30: number; lateOver30: number; paymentCount: number }> = {}

    let processed = 0
    let usedFallbackDate = 0

    for (const sched of (paidSchedules || [])) {
      const schedId = String(sched.id)
      const loanId = String(sched.loan_id || '')
      const dueDate = String(sched.due_date || '')
      const interest = Number(sched.interest || 0)

      if (!dueDate || !loanId) continue

      // Encontrar advisor
      const clientId = loanClientMap[loanId]
      if (!clientId) continue
      const advisorId = clientAdvisorMap[clientId]
      if (!advisorId) continue

      // Buscar fecha de pago:
      // 1ro: desde pagos vinculados a este schedule
      // 2do: desde cualquier pago del mismo loan (tomar el más cercano a due_date)
      // 3ro: fallback = due_date (asumir puntual)
      let paymentDate = schedulePaymentDateMap[schedId]

      if (!paymentDate) {
        // Buscar en pagos del mismo loan, tomar la fecha más cercana al due_date
        const loanDates = loanPaymentDatesMap[loanId] || []
        if (loanDates.length > 0) {
          // Ordenar por cercanía al due_date
          const dueDateMs = parseYMD(dueDate).getTime()
          loanDates.sort((a, b) => {
            return Math.abs(parseYMD(a).getTime() - dueDateMs) - Math.abs(parseYMD(b).getTime() - dueDateMs)
          })
          paymentDate = loanDates[0]
        }
      }

      if (!paymentDate) {
        // Fallback: usar la misma due_date (se cuenta como puntual)
        paymentDate = dueDate
        usedFallbackDate++
      }

      const { rate, bucket } = getCommissionRate(paymentDate, dueDate)
      const commissionAmount = Math.round(interest * rate * 100) / 100

      if (!commissions[advisorId]) {
        commissions[advisorId] = { total: 0, onTime: 0, late1to30: 0, lateOver30: 0, paymentCount: 0 }
      }

      commissions[advisorId].total += commissionAmount
      commissions[advisorId][bucket] += commissionAmount
      commissions[advisorId].paymentCount++
      processed++
    }

    console.log(`[commissions] Processed: ${processed}, Fallback dates used: ${usedFallbackDate}`)

    // ─── 6. Construir resultado ───
    const result: Record<string, AdvisorCommission> = {}

    // Incluir todos los advisor IDs conocidos
    const allAdvisorIds = new Set([
      ...Object.values(clientAdvisorMap),
      ...Object.keys(commissions),
    ])

    for (const advisorId of allAdvisorIds) {
      const data = commissions[advisorId]
      if (data) {
        const round = (n: number) => Math.round(n * 100) / 100
        const total = round(data.total)
        const onTime = round(data.onTime)
        const late1to30 = round(data.late1to30)
        const lateOver30 = round(data.lateOver30)

        result[advisorId] = {
          total,
          onTime,
          late1to30,
          lateOver30,
          paymentCount: data.paymentCount,
          breakdown: [
            { label: 'Puntual (40%)', amount: onTime, pct: total > 0 ? `${Math.round((onTime / total) * 100)}%` : '0%', color: '#22c55e' },
            { label: '1-30 días (20%)', amount: late1to30, pct: total > 0 ? `${Math.round((late1to30 / total) * 100)}%` : '0%', color: '#facc15' },
            { label: '+30 días (5%)', amount: lateOver30, pct: total > 0 ? `${Math.round((lateOver30 / total) * 100)}%` : '0%', color: '#f97316' },
          ],
        }
      } else {
        result[advisorId] = buildEmptyCommission()
      }
    }

    console.log(`[commissions] Result for ${Object.keys(result).length} advisors:`,
      Object.entries(result).map(([id, c]) => `${id}: Q${c.total} (${c.paymentCount} pagos)`).join(', ')
    )

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('[commissions] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildEmptyCommission(): AdvisorCommission {
  return {
    total: 0, onTime: 0, late1to30: 0, lateOver30: 0, paymentCount: 0,
    breakdown: [
      { label: 'Puntual (40%)', amount: 0, pct: '0%', color: '#22c55e' },
      { label: '1-30 días (20%)', amount: 0, pct: '0%', color: '#facc15' },
      { label: '+30 días (5%)', amount: 0, pct: '0%', color: '#f97316' },
    ],
  }
}
