import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendMessage, sendWhatsAppTemplate } from '@/lib/messaging'
import { getSystemSettings } from '@/lib/messaging/settings'
import { getTemplate, renderTemplate, getTemplateRow } from '@/lib/messaging/templates'

function daysBetween(a: Date, b: Date) {
  const ms = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round(ms / 86400000)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || (me.role !== 'admin' && me.role !== 'asesor')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = new URL(req.url).searchParams
    const settings = await getSystemSettings()
    const thresholdHours = Number(params.get('thresholdHours') || '48')
    const now = new Date()

    // Find schedules in pending_confirmation older than threshold
    const { data: schedules } = await admin
      .from('payment_schedule')
      .select(`*, loan:loans(*, client:clients(*))`)
      .eq('status', 'pending_confirmation')

    const results: any[] = []

    for (const s of schedules || []) {
      // Find latest payment for this schedule
      const { data: lastPayRows } = await admin
        .from('payments')
        .select('*')
        .eq('schedule_id', s.id)
        .order('created_at', { ascending: false })
        .limit(1)
      const lastPay = Array.isArray(lastPayRows) ? lastPayRows[0] : null
      const createdAt = lastPay?.created_at ? new Date(lastPay.created_at) : null
      if (!createdAt) continue
      const hours = Math.round((now.getTime() - createdAt.getTime()) / 3600000)
      if (hours < thresholdHours) {
        results.push({ scheduleId: s.id, status: 'ignored_threshold' })
        continue
      }

      // Reactivate overdue weekly
      const due = new Date(s.due_date || s.dueDate)
      const diasMora = Math.max(0, daysBetween(now, due))
      const week = Math.max(1, Math.floor(diasMora / 7))
      const stage = `WEEKLY_${week}`

      // Check duplicate
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

      // Channels & settings
      const client = s.loan?.client
      const clientId = client?.id
      const phone = client?.phone || ''
      const { data: settingsRows } = await admin
        .from('notifications_settings')
        .select('*')
        .eq('client_id', clientId)
        .limit(1)
      const settings = Array.isArray(settingsRows) ? settingsRows[0] : null
      const channels: ('sms'|'whatsapp')[] = []
      const pref = settings?.preferred_channel || 'both'
      const smsOk = settings?.sms_opt_in !== false
      const waOk = settings?.whatsapp_opt_in !== false
      if ((pref === 'both' || pref === 'sms') && smsOk) channels.push('sms')
      if ((pref === 'both' || pref === 'whatsapp') && waOk) channels.push('whatsapp')
      if (!channels.length || !phone) {
        results.push({ scheduleId: s.id, stage, status: 'ignored_no_channel_or_phone' })
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

      const scheduledAmount = Number(s.amount || 0) + Number(s.admin_fees || 0) + Number(s.mora || 0)
      const paidAmount = Number(s.paid_amount || 0)
      const pending = Math.max(0, scheduledAmount - paidAmount)
      const tkey = 'overdue_WEEKLY'
      const smsTpl = await getTemplate(tkey, 'sms')
      const waTpl = await getTemplate(tkey, 'whatsapp')
      const vars = {
        cliente_nombre: `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
        total_pendiente: new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(pending),
        instrucciones_pago: settings.payment_instructions,
        soporte_contacto: settings.support_contact,
        dias_mora: String(diasMora),
      }
      const smsText = renderTemplate(smsTpl, vars)
      const waText = renderTemplate(waTpl, vars)
      const textByChannel: Record<'sms'|'whatsapp', string> = { sms: smsText, whatsapp: waText }

      const countryCode = (client?.phone_country_code as string) || settings.default_country_code
      let sendRes = await sendMessage(channels, phone, channels.length === 1 ? textByChannel[channels[0]] : smsText, countryCode)
      const envTemplateNameKey = `WHATSAPP_TEMPLATE_${tkey}`
      const autoTemplateName = (process.env as any)[envTemplateNameKey]
      if (channels.includes('whatsapp') && autoTemplateName) {
        const waRow: any = await getTemplateRow(tkey as any, 'whatsapp')
        const tname = String(autoTemplateName || process.env.WHATSAPP_DEFAULT_TEMPLATE || 'hello_world')
        const tlang = String(process.env.WHATSAPP_DEFAULT_TEMPLATE_LANG || 'es')
        const varNames: string[] = Array.isArray(waRow?.variables) ? waRow.variables : []
        const headerEndIndex = varNames.indexOf('HEADER_END')
        let components: any[] = []
        if (headerEndIndex !== -1) {
          const headerVarNames = varNames.slice(0, headerEndIndex)
          const bodyVarNames = varNames.slice(headerEndIndex + 1)
          if (headerVarNames.length) components.push({ type: 'header', parameters: headerVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) })
          if (bodyVarNames.length) components.push({ type: 'body', parameters: bodyVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) })
        } else if (varNames.length) {
          components = [{ type: 'body', parameters: varNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) }]
        }
        try { console.log('REACTIVATE_WA_COMPONENTS', components) } catch {}
        const waRes = await sendWhatsAppTemplate(phone, tname, tlang, components, countryCode)
        sendRes = { ...sendRes, whatsapp: waRes }
      }
      const payload = { phone, channels, vars, textByChannel, results: sendRes }
      for (const ch of channels) {
        const r = (sendRes as any)[ch]
        await admin.from('notifications_log').insert({
          client_id: clientId,
          loan_id: s.loan?.id,
          schedule_id: s.id,
          channel: ch,
          stage,
          message_template: tkey,
          payload_json: payload as any,
          status: r?.ok ? 'sent' : (r?.provider?.includes('dry-run') ? 'ignored' : 'failed'),
          error_code: r?.errorCode || null,
          attempts: 1,
          sent_at: r?.ok ? new Date().toISOString() : null,
        })
      }
      results.push({ scheduleId: s.id, stage, status: 'processed', channels })
    }

    return NextResponse.json({ ok: true, count: results.length, results })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
