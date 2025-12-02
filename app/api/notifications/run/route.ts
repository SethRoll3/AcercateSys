import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
//import { sendMessage, sendWhatsAppTemplate } from '@/lib/messaging'
import { getSystemSettings } from '@/lib/messaging/settings'
//import { getTemplate, renderTemplate, getTemplateRow } from '@/lib/messaging/templates'
import { parseYMDToUTC } from '@/lib/utils'

type StageKey = 'D-15' | 'D-2' | 'D-1' | 'D0' | 'D+1' | 'D+3' | `WEEKLY_${number}`

function daysBetween(a: Date, b: Date) {
  const ms = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round(ms / 86400000)
}

function computeStage(today: Date, dueDate: Date, status: string): StageKey | null {
  const diff = daysBetween(dueDate, today) // positive when today > dueDate
  if (diff < 0) {
    const before = -diff
    if (before === 15) return 'D-15'
    if (before === 2) return 'D-2'
    if (before === 1) return 'D-1'
    return null
  }
  if (diff === 0) return 'D0'
  if (diff === 1) return 'D+1'
  if (diff === 3) return 'D+3'
  if (diff >= 7 && (status === 'overdue' || status === 'pending')) {
    const week = Math.floor(diff / 7)
    return `WEEKLY_${week}`
  }
  return null
}

function templateKeyForStage(stage: StageKey): 'reminder_D15'|'reminder_D2'|'reminder_D1'|'due_D0'|'overdue_D1'|'overdue_D3'|'overdue_WEEKLY' {
  if (stage === 'D-15') return 'reminder_D15'
  if (stage === 'D-2') return 'reminder_D2'
  if (stage === 'D-1') return 'reminder_D1'
  if (stage === 'D0') return 'due_D0'
  if (stage === 'D+1') return 'overdue_D1'
  if (stage === 'D+3') return 'overdue_D3'
  return 'overdue_WEEKLY'
}

function hourInTZ(now: Date, tz: string) {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(now)
  return parseInt(h, 10)
}
function isWithinQuietHours(now: Date, tz: string, start?: string | null, end?: string | null) {
  const s = start ? start : null
  const e = end ? end : null
  const h = hourInTZ(now, tz)
  const toHour = (t: string) => parseInt(t.split(':')[0] || '0', 10)
  if (!s && !e) {
    return h >= 8 && h <= 18
  }
  const sh = s ? toHour(s) : 8
  const eh = e ? toHour(e) : 18
  return h >= sh && h <= eh
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get('x-cron-secret')
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const admin = await createAdminClient()



    const sysSettings = await getSystemSettings()
    const tz = sysSettings.timezone || 'America/Guatemala'
    const todayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    const today = parseYMDToUTC(todayYMD)

    const { data: schedules } = await admin
      .from('payment_schedule')
      .select(`*, loan:loans(*, client:clients(*, advisor:users!advisor_id(email)))`)
      .in('status', ['pending','overdue'])

    const results: any[] = []
    for (const s of schedules || []) {
      const dueDate = new Date(s.due_date || s.dueDate)
      const stage = computeStage(today, dueDate, s.status)
      if (!stage) continue

      const loan = s.loan
      const clientRaw: any = loan?.client as any
      const clientObj: any = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
      const advisorRaw: any = clientObj?.advisor as any
      const advisorObj: any = Array.isArray(advisorRaw) ? advisorRaw[0] : advisorRaw
      const clientId = clientObj?.id
      const phone = clientObj?.phone || ''

      // Settings
      const { data: settingsRows } = await admin
        .from('notifications_settings')
        .select('*')
        .eq('client_id', clientId)
        .limit(1)
      const clientSettings = Array.isArray(settingsRows) ? settingsRows[0] : null

      // In-app notifications (centro de notificaciones)
      try {
        const actionUrl = `/dashboard/loans/${loan?.id}`
        const scheduledAmountIn = Number(s.amount || 0) + Number(s.admin_fees || 0) + Number(s.mora || 0)
        const paidAmountIn = Number(s.paid_amount || 0)
        const pendingIn = Math.max(0, scheduledAmountIn - paidAmountIn)
        const typeIn = templateKeyForStage(stage)

        if (clientObj?.email) {
          const orFilterClient = `recipient_email.eq.${clientObj.email},recipient_role.eq.cliente`
          const { data: existingClient } = await admin
            .from('notifications')
            .select('id')
            .eq('type', typeIn)
            .eq('related_entity_id', s.id)
            .eq('status', 'unread')
            .or(orFilterClient)
            .limit(1)
          if (!Array.isArray(existingClient) || existingClient.length === 0) {
            await admin.from('notifications').insert({
              recipient_email: clientObj.email,
              recipient_role: 'cliente',
              title: stage === 'D0' ? 'Hoy es día de tu pago' : 'Recordatorio de pago',
              body: stage === 'D0'
                ? `Tu pago vence hoy. Monto pendiente ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(pendingIn)}.`
                : `Tu pago vence el ${new Date(dueDate).toLocaleDateString('es-GT')}. Monto pendiente ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(pendingIn)}.`,
              type: typeIn,
              status: 'unread',
              related_entity_type: 'schedule',
              related_entity_id: s.id,
              action_url: actionUrl,
              meta_json: { loan_id: loan?.id, schedule_id: s.id, due_date: s.due_date, pending: pendingIn },
            })
          }
        }

        const diasMoraIn = Math.max(0, daysBetween(today, dueDate))
        if (diasMoraIn > 0 && advisorObj?.email) {
          const orFilterAdvisor = `recipient_email.eq.${advisorObj.email},recipient_role.eq.asesor`
          const { data: existingAdvisor } = await admin
            .from('notifications')
            .select('id')
            .eq('type', 'advisor_overdue_alert')
            .eq('related_entity_id', s.id)
            .eq('status', 'unread')
            .or(orFilterAdvisor)
            .limit(1)
          if (!Array.isArray(existingAdvisor) || existingAdvisor.length === 0) {
            await admin.from('notifications').insert({
              recipient_email: advisorObj.email,
              recipient_role: 'asesor',
              title: diasMoraIn === 1 ? 'Cliente en mora' : 'Cliente continúa en mora',
              body: `El cliente ${clientObj?.first_name || ''} ${clientObj?.last_name || ''} tiene ${diasMoraIn} día(s) de mora en la cuota ${s.payment_number}.`,
              type: 'advisor_overdue_alert',
              status: 'unread',
              related_entity_type: 'schedule',
              related_entity_id: s.id,
              action_url: actionUrl,
              meta_json: { loan_id: loan?.id, schedule_id: s.id, dias_mora: diasMoraIn },
            })
          }
        }
      } catch (e) {
        try { console.error('[IN-APP NOTIFS] run insert failed', e) } catch {}
      }

      /*
      if (!isWithinQuietHours(today, clientSettings?.timezone || tz, clientSettings?.quiet_hours_start ?? sysSettings.default_quiet_hours_start, clientSettings?.quiet_hours_end ?? sysSettings.default_quiet_hours_end)) {
        results.push({ scheduleId: s.id, stage, status: 'ignored_quiet_hours' })
        continue
      }

      // Rate limiting: máximo 2 mensajes "sent" por cliente en últimas 24h
      const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { count: recentCount } = await admin
        .from('notifications_log')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .gte('sent_at', sinceISO)
        .eq('status', 'sent')
      if ((recentCount || 0) >= 2) {
        results.push({ scheduleId: s.id, stage, status: 'ignored_rate_limit' })
        continue
      }

      // Dedup
      const channels: ('sms'|'whatsapp')[] = []
      const pref = clientSettings?.preferred_channel || 'both'
      const smsOk = clientSettings?.sms_opt_in !== false
      const waOk = clientSettings?.whatsapp_opt_in !== false
      if ((pref === 'both' || pref === 'sms') && smsOk) channels.push('sms')
      if ((pref === 'both' || pref === 'whatsapp') && waOk) channels.push('whatsapp')
      if (!channels.length || !phone) {
        results.push({ scheduleId: s.id, stage, status: 'ignored_no_channel_or_phone' })
        continue
      }

      // Check prior sent
      const { data: prior } = await admin
        .from('notifications_log')
        .select('id')
        .eq('schedule_id', s.id)
        .eq('stage', stage)
        .eq('status', 'sent')
        .limit(1)
      if (Array.isArray(prior) && prior[0]) {
        results.push({ scheduleId: s.id, stage, status: 'ignored_duplicate' })
        continue
      }

      const scheduledAmount = Number(s.amount || 0) + Number(s.admin_fees || 0) + Number(s.mora || 0)
      const paidAmount = Number(s.paid_amount || 0)
      const pending = Math.max(0, scheduledAmount - paidAmount)
      const diasMora = Math.max(0, daysBetween(today, dueDate))

      const tkey = templateKeyForStage(stage)
      const smsTpl = await getTemplate(tkey, 'sms')
      const waTpl = await getTemplate(tkey, 'whatsapp')
      const waRow: any = await getTemplateRow(tkey, 'whatsapp')
      const vars = {
        cliente_nombre: `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
        monto_pendiente: new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(pending),
        fecha_limite: new Date(dueDate).toLocaleDateString('es-GT'),
        instrucciones_pago: sysSettings.payment_instructions,
        soporte_contacto: sysSettings.support_contact,
        dias_mora: String(diasMora),
        total_pendiente: new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(pending),
      }

      const smsText = renderTemplate(smsTpl, vars)
      const waText = renderTemplate(waTpl, vars)
      const textByChannel: Record<'sms'|'whatsapp', string> = { sms: smsText, whatsapp: waText }

      const countryCode = (clientObj?.phone_country_code as string) || sysSettings.default_country_code
      let sendRes = await sendMessage(channels, phone, channels.length === 1 ? textByChannel[channels[0]] : smsText, countryCode)
      const envTemplateNameKey = `WHATSAPP_TEMPLATE_${tkey}`
      const autoTemplateName = (process.env as any)[envTemplateNameKey]
      if (channels.includes('whatsapp') && autoTemplateName) {
        const tname = String(autoTemplateName || process.env.WHATSAPP_DEFAULT_TEMPLATE || 'hello_world')
        const tlang = String(process.env.WHATSAPP_DEFAULT_TEMPLATE_LANG || 'es')
        let tcomponents: any[] = []
        const varNames: string[] = Array.isArray(waRow?.variables) ? waRow.variables : []
        const headerEndIndex = varNames.indexOf('HEADER_END')
        if (headerEndIndex !== -1) {
          const headerVarNames = varNames.slice(0, headerEndIndex)
          const bodyVarNames = varNames.slice(headerEndIndex + 1)
          if (headerVarNames.length) {
            tcomponents.push({ type: 'header', parameters: headerVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) })
          }
          if (bodyVarNames.length) {
            tcomponents.push({ type: 'body', parameters: bodyVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) })
          }
        } else if (tkey === 'reminder_D15') {
          tcomponents = [
            { type: 'header', parameters: [{ type: 'text', text: String((vars as any).cliente_nombre || '') }] },
            { type: 'body', parameters: [
              { type: 'text', text: String((vars as any).monto_pendiente || '') },
              { type: 'text', text: String((vars as any).fecha_limite || '') },
              { type: 'text', text: String((vars as any).instrucciones_pago || '') },
              { type: 'text', text: String((vars as any).soporte_contacto || '') },
            ]},
          ]
        } else if (varNames.length) {
          tcomponents = [{ type: 'body', parameters: varNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) }]
        }
        try { console.log('RUN_WA_COMPONENTS', { tkey, components: tcomponents }) } catch {}
        const waRes = await sendWhatsAppTemplate(phone, tname, tlang, tcomponents, countryCode)
        sendRes = { ...sendRes, whatsapp: waRes }
      }
      const payload = { phone, channels, vars, textByChannel, results: sendRes }

      for (const ch of channels) {
        const r = (sendRes as any)[ch]
        const isDryRun = !!r?.provider && r.provider.includes('dry-run')
        await admin.from('notifications_log').insert({
          client_id: clientId,
          loan_id: loan?.id,
          schedule_id: s.id,
          channel: ch,
          stage,
          message_template: tkey,
          payload_json: payload as any,
          status: isDryRun ? 'ignored' : (r?.ok ? 'sent' : 'failed'),
          error_code: r?.errorCode || null,
          attempts: 1,
          sent_at: !isDryRun && r?.ok ? new Date().toISOString() : null,
        })
      }

      results.push({ scheduleId: s.id, stage, status: 'processed', channels })
      */

      results.push({ scheduleId: s.id, stage, status: 'in_app_only' })
      continue
    }

    return NextResponse.json({ ok: true, count: results.length, results })
  } catch (error) {
    try { console.error('NOTIFICATIONS_RUN_ERROR', error) } catch {}
    const e: any = error as any
    const payload = typeof e === 'string'
      ? { ok: false, message: e }
      : e && typeof e === 'object'
        ? { ok: false, name: e.name, message: String(e.message || ''), code: e.code, stack: e.stack }
        : { ok: false, message: String(error) }
    return NextResponse.json(payload, { status: 500 })
  }
}
