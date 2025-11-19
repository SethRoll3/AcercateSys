import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendMessage, sendWhatsAppTemplate } from '@/lib/messaging'
import { getTemplate, renderTemplate, getTemplateRow } from '@/lib/messaging/templates'
import { getSystemSettings } from '@/lib/messaging/settings'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || (me.role !== 'admin' && me.role !== 'asesor')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const clientId = body.client_id
    const stage = (body.stage || 'reminder_D2') as any
    const channels: ('sms'|'whatsapp')[] = body.channels || ['sms']
    if (!clientId) return NextResponse.json({ error: 'Missing client_id' }, { status: 400 })

    const { data: client } = await admin.from('clients').select('*').eq('id', clientId).single()
    if (!client || !client.phone) return NextResponse.json({ error: 'Client/phone not found' }, { status: 404 })

    const settings = await getSystemSettings()
    const tkey = stage as any
    const smsTpl = await getTemplate(tkey, 'sms')
    const waTpl = await getTemplate(tkey, 'whatsapp')
    const waRow: any = await getTemplateRow(tkey, 'whatsapp')
    const vars = {
      cliente_nombre: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      monto_pendiente: 'Q 0',
      fecha_limite: new Date().toLocaleDateString('es-GT'),
      instrucciones_pago: settings.payment_instructions,
      soporte_contacto: settings.support_contact,
      dias_mora: '0',
      total_pendiente: 'Q 0',
    }
    const smsText = renderTemplate(smsTpl, vars)
    const waText = renderTemplate(waTpl, vars)
    const textByChannel: Record<'sms'|'whatsapp', string> = { sms: smsText, whatsapp: waText }
    let sendRes = await sendMessage(channels, client.phone, channels.length === 1 ? textByChannel[channels[0]] : smsText, client.phone_country_code || settings.default_country_code)
    const envTemplateNameKey = `WHATSAPP_TEMPLATE_${tkey}`
    const autoTemplateName = (process.env as any)[envTemplateNameKey]
    if (channels.includes('whatsapp') && (body.whatsapp_template || autoTemplateName)) {
      const tname = String((body.whatsapp_template?.name) || autoTemplateName || process.env.WHATSAPP_DEFAULT_TEMPLATE || 'hello_world')
      const tlang = String((body.whatsapp_template?.language) || process.env.WHATSAPP_DEFAULT_TEMPLATE_LANG || 'es')
      let components: any[] = []
      if (stage === 'reminder_D15') {
        components = [
          { type: 'header', parameters: [{ type: 'text', text: String((vars as any).cliente_nombre || '') }] },
          { type: 'body', parameters: [
            { type: 'text', text: String((vars as any).monto_pendiente || '') },
            { type: 'text', text: String((vars as any).fecha_limite || '') },
            { type: 'text', text: String((vars as any).instrucciones_pago || '') },
            { type: 'text', text: String((vars as any).soporte_contacto || '') },
          ]},
        ]
      } else {
        const varNames: string[] = Array.isArray(waRow?.variables) ? waRow.variables : []
        const headerEndIndex = varNames.indexOf('HEADER_END')
        if (headerEndIndex !== -1) {
          const headerVarNames = varNames.slice(0, headerEndIndex)
          const bodyVarNames = varNames.slice(headerEndIndex + 1)
          if (headerVarNames.length > 0) {
            components.push({
              type: 'header',
              parameters: headerVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })),
            })
          }
          if (bodyVarNames.length > 0) {
            components.push({
              type: 'body',
              parameters: bodyVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })),
            })
          }
        } else if (varNames.length > 0) {
          components.push({
            type: 'body',
            parameters: varNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })),
          })
        }
      }
      try { console.log('WA_TEST_COMPONENTS', components) } catch {}
      const waRes = await sendWhatsAppTemplate(client.phone, tname, tlang, components, client.phone_country_code || settings.default_country_code)
      sendRes = { ...sendRes, whatsapp: waRes }
    }
    const envStatus = {
      hasWhatsAppCreds: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
      hasSmsCreds: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
    }
    const payload = { phone: client.phone, channels, vars, textByChannel, results: sendRes, envStatus }
    const insertErrors: any[] = []

    for (const ch of channels) {
      const r = (sendRes as any)[ch]
      const isDryRun = !!r?.provider && r.provider.includes('dry-run')
      const { error } = await admin.from('notifications_log').insert({
        client_id: clientId,
        loan_id: null,
        schedule_id: null,
        channel: ch,
        stage,
        message_template: tkey,
        payload_json: payload as any,
        status: isDryRun ? 'ignored' : (r?.ok ? 'sent' : 'failed'),
        error_code: r?.errorCode || null,
        attempts: 1,
        sent_at: !isDryRun && r?.ok ? new Date().toISOString() : null,
      })
      if (error) insertErrors.push({ channel: ch, message: error.message, details: error.details })
    }

    return NextResponse.json({ ok: true, results: sendRes, logErrors: insertErrors, envStatus })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
