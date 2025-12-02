import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSystemSettings } from '@/lib/messaging/settings'
import { parseYMDToUTC } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get('x-cron-secret')
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const admin = await createAdminClient()

    const settings = await getSystemSettings()
    const enabled = !!settings.dynamic_mora_enabled
    const moraAmount = Number(settings.dynamic_mora_amount || 0)
    if (!enabled || moraAmount <= 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'disabled_or_zero_amount' })
    }

    const todayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone || 'America/Guatemala' }).format(new Date())
    const today = parseYMDToUTC(todayYMD)

    const { data: loans } = await admin
      .from('loans')
      .select('id, status')
      .eq('status', 'active')

    const results: any[] = []
    for (const loan of loans || []) {
      const { data: schedule } = await admin
        .from('payment_schedule')
        .select('id, payment_number, status, due_date, mora')
        .eq('loan_id', loan.id)
        .order('payment_number', { ascending: true })

      const rows = Array.isArray(schedule) ? schedule : []
      if (!rows.length) continue

      const isPaidStatus = (s: string) => ['paid', 'confirmed', 'pending_confirmation', 'pending-confirmation'].includes(s)
      let lastPaidIdx = -1
      for (let i = rows.length - 1; i >= 0; i--) {
        const st = String(rows[i].status || '')
        if (isPaidStatus(st)) { lastPaidIdx = i; break }
      }
      const nextIdx = lastPaidIdx + 1
      if (nextIdx < 0 || nextIdx >= rows.length) continue
      const next = rows[nextIdx]

      const due = parseYMDToUTC(String(next.due_date))
      const overdue = due.getTime() < today.getTime()
      const alreadyHasMora = Number(next.mora || 0) > 0
      if (overdue && !alreadyHasMora) {
        const { error } = await admin
          .from('payment_schedule')
          .update({ mora: moraAmount })
          .eq('id', next.id)
        if (error) {
          results.push({ loanId: loan.id, scheduleId: next.id, status: 'error', message: error.message })
        } else {
          results.push({ loanId: loan.id, scheduleId: next.id, status: 'mora_applied', mora: moraAmount })
          try {
            const { data: loanRow } = await admin
              .from('loans')
              .select('id, client:clients(id, first_name, last_name, email, advisor:users!advisor_id(email))')
              .eq('id', loan.id)
              .limit(1)
              .single()
            const clientRaw: any = loanRow?.client as any
            const clientObj: any = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
            const advisorRaw: any = clientObj?.advisor as any
            const advisorObj: any = Array.isArray(advisorRaw) ? advisorRaw[0] : advisorRaw
            const clientEmail: string | null = clientObj?.email ?? null
            const advisorEmail: string | null = advisorObj?.email ?? null
            const actionUrl = `/dashboard/loans/${loan.id}`

            const rows: any[] = []
            if (clientEmail) {
              rows.push({
                recipient_email: clientEmail,
                recipient_role: 'cliente',
                title: 'Tu pago está en mora',
                body: `Tu cuota ${next.payment_number} está en mora. Se aplicó mora de Q${moraAmount}.`,
                type: 'overdue_alert',
                status: 'unread',
                related_entity_type: 'schedule',
                related_entity_id: next.id,
                action_url: actionUrl,
                meta_json: { loan_id: loan.id, schedule_id: next.id },
              })
            }
            if (advisorEmail) {
              rows.push({
                recipient_email: advisorEmail,
                recipient_role: 'asesor',
                title: 'Cliente con mora',
                body: `El cliente ${clientObj?.first_name || ''} ${clientObj?.last_name || ''} tiene mora en la cuota ${next.payment_number}.`,
                type: 'advisor_overdue_alert',
                status: 'unread',
                related_entity_type: 'schedule',
                related_entity_id: next.id,
                action_url: actionUrl,
                meta_json: { loan_id: loan.id, schedule_id: next.id },
              })
            }
            rows.push({
              recipient_role: 'admin',
              recipient_email: null,
              title: 'Mora aplicada a cuota',
              body: `Se aplicó mora a la cuota ${next.payment_number} del préstamo ${loan.id}.`,
              type: 'admin_overdue_alert',
              status: 'unread',
              related_entity_type: 'schedule',
              related_entity_id: next.id,
              action_url: actionUrl,
              meta_json: { loan_id: loan.id, schedule_id: next.id },
            })

            // Simple de-dup: avoid duplicate unread for same schedule/type/recipient
            for (const row of rows) {
              const orFilter = row.recipient_email ? `recipient_email.eq.${row.recipient_email},recipient_role.eq.${row.recipient_role}` : `recipient_role.eq.${row.recipient_role}`
              const { data: existing } = await admin
                .from('notifications')
                .select('id')
                .eq('type', row.type)
                .eq('related_entity_id', row.related_entity_id)
                .eq('status', 'unread')
                .or(orFilter)
                .limit(1)
              if (!Array.isArray(existing) || existing.length === 0) {
                await admin.from('notifications').insert(row)
              }
            }
          } catch (e) {
            try { console.error('[IN-APP NOTIFS] mora run insert failed', e) } catch {}
          }
        }
      } else {
        results.push({ loanId: loan.id, scheduleId: next.id, status: 'skipped', reason: alreadyHasMora ? 'already_has_mora' : 'not_overdue' })
      }
    }

    return NextResponse.json({ ok: true, count: results.length, results })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
