import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Mismo helper que el route normal para calcular la tasa de comisión
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

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Check authentication or Cron Secret
    const authHeader = req.headers.get('authorization')
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

    let actorId = null

    if (!isCron) {
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { data: me } = await supabase.from('users').select('id, role').eq('auth_id', user.id).single()
      if (!me || me.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      actorId = me.id
    }

    const admin = await createAdminClient()

    // 1. Obtener TODAS las cuotas PAGADAS del payment_schedule que aún no se han cortado
    const { data: paidSchedules, error: schedError } = await admin
      .from('payment_schedule')
      .select('id, loan_id, due_date, interest, status')
      .eq('status', 'paid')
      .is('commission_paid_at', null)

    if (schedError) throw schedError
    if (!paidSchedules || paidSchedules.length === 0) {
      return NextResponse.json({ message: 'No pending commissions to cut off' }, { status: 200 })
    }

    // 2. Obtener TODOS los pagos para buscar la fecha real de pago
    const { data: allPayments } = await admin.from('payments').select('id, payment_date, schedule_id, loan_id')
    const schedulePaymentDateMap: Record<string, string> = {}
    const loanPaymentDatesMap: Record<string, string[]> = {}

    for (const p of (allPayments || [])) {
      if (p.schedule_id && p.payment_date) {
        const existing = schedulePaymentDateMap[String(p.schedule_id)]
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

    // 3. Obtener loans -> client_id
    const loanIds = Array.from(new Set(paidSchedules.map(s => String(s.loan_id)).filter(Boolean)))
    const loanClientMap: Record<string, string> = {}
    if (loanIds.length > 0) {
      for (let i = 0; i < loanIds.length; i += 500) {
        const chunk = loanIds.slice(i, i + 500)
        const { data: loans } = await admin.from('loans').select('id, client_id').in('id', chunk)
        for (const l of (loans || [])) loanClientMap[String(l.id)] = String(l.client_id || '')
      }
    }

    // 4. Obtener clients -> advisor_id
    const clientIds = Array.from(new Set(Object.values(loanClientMap).filter(Boolean)))
    const clientAdvisorMap: Record<string, string> = {}
    if (clientIds.length > 0) {
      for (let i = 0; i < clientIds.length; i += 500) {
        const chunk = clientIds.slice(i, i + 500)
        const { data: clients } = await admin.from('clients').select('id, advisor_id').in('id', chunk)
        for (const c of (clients || [])) {
          if (c.advisor_id) clientAdvisorMap[String(c.id)] = String(c.advisor_id)
        }
      }
    }

    // 5. Calcular comisiones por asesor y trackear los IDs de las cuotas procesadas por asesor
    const commissions: Record<string, { total: number; schedules: string[]; minDate: string; maxDate: string }> = {}

    for (const sched of paidSchedules) {
      const schedId = String(sched.id)
      const loanId = String(sched.loan_id || '')
      const dueDate = String(sched.due_date || '')
      const interest = Number(sched.interest || 0)

      if (!dueDate || !loanId) continue

      const clientId = loanClientMap[loanId]
      if (!clientId) continue
      const advisorId = clientAdvisorMap[clientId]
      if (!advisorId) continue

      let paymentDate = schedulePaymentDateMap[schedId]
      if (!paymentDate) {
        const loanDates = loanPaymentDatesMap[loanId] || []
        if (loanDates.length > 0) {
          const dueDateMs = parseYMD(dueDate).getTime()
          loanDates.sort((a, b) => Math.abs(parseYMD(a).getTime() - dueDateMs) - Math.abs(parseYMD(b).getTime() - dueDateMs))
          paymentDate = loanDates[0]
        }
      }
      if (!paymentDate) paymentDate = dueDate

      const { rate } = getCommissionRate(paymentDate, dueDate)
      const commissionAmount = Math.round(interest * rate * 100) / 100

      if (!commissions[advisorId]) {
        commissions[advisorId] = { total: 0, schedules: [], minDate: paymentDate, maxDate: paymentDate }
      }

      commissions[advisorId].total += commissionAmount
      commissions[advisorId].schedules.push(schedId)
      
      if (paymentDate < commissions[advisorId].minDate) commissions[advisorId].minDate = paymentDate
      if (paymentDate > commissions[advisorId].maxDate) commissions[advisorId].maxDate = paymentDate
    }

    // 6. Insertar registros en commission_payments y actualizar payment_schedule
    let insertedCount = 0
    let updatedSchedulesCount = 0

    const nowIso = new Date().toISOString()
    
    for (const advisorId of Object.keys(commissions)) {
      const data = commissions[advisorId]
      if (data.total <= 0 || data.schedules.length === 0) continue

      // Get Start and End dates for this period
      // For a formal cutoff, we might just use the min and max payment dates of the processed schedules
      const startDate = data.minDate
      const endDate = new Date().toISOString().split('T')[0] // today's date is the end of the cutoff

      const { error: insertError } = await admin.from('commission_payments').insert({
        advisor_id: advisorId,
        amount: data.total,
        start_date: startDate,
        end_date: endDate,
        created_by: actorId
      })

      if (insertError) {
        console.error(`Error inserting commission payment for ${advisorId}:`, insertError)
        continue
      }

      // Actualizar cuotas
      for (let i = 0; i < data.schedules.length; i += 500) {
        const chunk = data.schedules.slice(i, i + 500)
        const { error: updateError } = await admin
          .from('payment_schedule')
          .update({ commission_paid_at: nowIso })
          .in('id', chunk)
        
        if (updateError) {
          console.error(`Error updating schedules for ${advisorId}:`, updateError)
        } else {
          updatedSchedulesCount += chunk.length
        }
      }
      
      insertedCount++
    }

    return NextResponse.json({ 
      message: 'Cutoff processed successfully', 
      cutoffsCreated: insertedCount,
      schedulesUpdated: updatedSchedulesCount
    }, { status: 200 })

  } catch (error) {
    console.error('[commissions-cutoff] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
