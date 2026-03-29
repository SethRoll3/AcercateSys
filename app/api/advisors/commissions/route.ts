import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Calcula la tasa de comisión sobre el interés basada en la puntualidad del pago.
 * 
 *   - Puntual o antes de la fecha:  50%
 *   - 1–3 días después:             20%
 *   - 3–5 días después (día 4 y 5): 5%
 *   - Más de 5 días:                 0%
 */
function getCommissionRate(paymentDateStr: string, dueDateStr: string): { rate: number; bucket: 'onTime' | 'late1to3' | 'late3to5' | 'lateOver5' } {
  const pay = parseYMD(paymentDateStr)
  const due = parseYMD(dueDateStr)
  const diffMs = pay.getTime() - due.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return { rate: 0.50, bucket: 'onTime' }
  if (diffDays <= 3) return { rate: 0.20, bucket: 'late1to3' }
  if (diffDays <= 5) return { rate: 0.05, bucket: 'late3to5' }
  return { rate: 0.00, bucket: 'lateOver5' }
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
  late1to3: number
  late3to5: number
  lateOver5: number
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

    // Solo admin puede ver las comisiones de todos los asesores
    const { data: me } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = await createAdminClient()

    // 1. Obtener todos los pagos CONFIRMADOS con sus datos de schedule y loan
    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select(`
        id,
        payment_date,
        confirmation_status,
        loan_id,
        schedule_id,
        amount
      `)
      .in('confirmation_status', ['confirmado', 'aprobado'])

    if (paymentsError) {
      console.error('Error fetching payments for commissions:', paymentsError)
      return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
    }

    if (!payments || payments.length === 0) {
      return NextResponse.json({})
    }

    // 2. Obtener los schedules correspondientes (para due_date e interest)
    const scheduleIds = Array.from(new Set((payments || []).map(p => p.schedule_id).filter(Boolean)))
    let schedulesMap: Record<string, { due_date: string; interest: number }> = {}

    if (scheduleIds.length > 0) {
      // Supabase tiene un límite en los IN queries, hacemos chunks de 500
      const chunks: string[][] = []
      for (let i = 0; i < scheduleIds.length; i += 500) {
        chunks.push(scheduleIds.slice(i, i + 500) as string[])
      }
      for (const chunk of chunks) {
        const { data: schedules } = await admin
          .from('payment_schedule')
          .select('id, due_date, interest')
          .in('id', chunk)

        for (const s of (schedules || [])) {
          schedulesMap[String(s.id)] = {
            due_date: String(s.due_date || ''),
            interest: Number(s.interest || 0),
          }
        }
      }
    }

    // 3. Obtener loans → client_id mapping
    const loanIds = Array.from(new Set((payments || []).map(p => String(p.loan_id)).filter(Boolean)))
    let loanClientMap: Record<string, string> = {} // loan_id → client_id

    if (loanIds.length > 0) {
      const chunks: string[][] = []
      for (let i = 0; i < loanIds.length; i += 500) {
        chunks.push(loanIds.slice(i, i + 500))
      }
      for (const chunk of chunks) {
        const { data: loans } = await admin
          .from('loans')
          .select('id, client_id')
          .in('id', chunk)

        for (const l of (loans || [])) {
          loanClientMap[String(l.id)] = String(l.client_id || '')
        }
      }
    }

    // 4. Obtener clients → advisor_id mapping
    const clientIds = Array.from(new Set(Object.values(loanClientMap).filter(Boolean)))
    let clientAdvisorMap: Record<string, string> = {} // client_id → advisor_id

    if (clientIds.length > 0) {
      const chunks: string[][] = []
      for (let i = 0; i < clientIds.length; i += 500) {
        chunks.push(clientIds.slice(i, i + 500))
      }
      for (const chunk of chunks) {
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

    // 5. Calcular comisiones por asesor
    const commissions: Record<string, { total: number; onTime: number; late1to3: number; late3to5: number; lateOver5: number; paymentCount: number }> = {}

    for (const payment of (payments || [])) {
      const scheduleId = String(payment.schedule_id || '')
      const loanId = String(payment.loan_id || '')
      const schedule = schedulesMap[scheduleId]

      if (!schedule || !schedule.due_date || !payment.payment_date) continue

      const clientId = loanClientMap[loanId]
      if (!clientId) continue

      const advisorId = clientAdvisorMap[clientId]
      if (!advisorId) continue

      const { rate, bucket } = getCommissionRate(
        String(payment.payment_date),
        schedule.due_date
      )

      const commissionAmount = Math.round(schedule.interest * rate * 100) / 100

      if (!commissions[advisorId]) {
        commissions[advisorId] = { total: 0, onTime: 0, late1to3: 0, late3to5: 0, lateOver5: 0, paymentCount: 0 }
      }

      commissions[advisorId].total += commissionAmount
      commissions[advisorId][bucket] += commissionAmount
      commissions[advisorId].paymentCount++
    }

    // 6. Redondear y construir breakdown para cada asesor
    const result: Record<string, AdvisorCommission> = {}

    for (const [advisorId, data] of Object.entries(commissions)) {
      const round = (n: number) => Math.round(n * 100) / 100
      const total = round(data.total)
      const onTime = round(data.onTime)
      const late1to3 = round(data.late1to3)
      const late3to5 = round(data.late3to5)
      const lateOver5 = round(data.lateOver5)

      result[advisorId] = {
        total,
        onTime,
        late1to3,
        late3to5,
        lateOver5,
        paymentCount: data.paymentCount,
        breakdown: [
          { label: 'Puntual (50%)', amount: onTime, pct: total > 0 ? `${Math.round((onTime / total) * 100)}%` : '0%', color: '#22c55e' },
          { label: '1-3 días (20%)', amount: late1to3, pct: total > 0 ? `${Math.round((late1to3 / total) * 100)}%` : '0%', color: '#facc15' },
          { label: '3-5 días (5%)', amount: late3to5, pct: total > 0 ? `${Math.round((late3to5 / total) * 100)}%` : '0%', color: '#f97316' },
          { label: '+5 días (0%)', amount: lateOver5, pct: '0%', color: '#ef4444' },
        ],
      }
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('Error computing advisor commissions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
