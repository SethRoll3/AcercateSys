import { TwilioSmsProvider, DryRunSmsProvider } from './providers/sms'
import type { SmsProvider } from './providers/sms'
import { MetaWhatsAppProvider, DryRunWhatsAppProvider } from './providers/whatsapp'
import type { WhatsAppProvider } from './providers/whatsapp'
import { toE164 } from './phone'

export type Channel = 'sms' | 'whatsapp'

export interface SendResult {
  ok: boolean
  provider: string
  errorCode?: string
  raw?: any
  messageId?: string
}

export function getSmsProvider(): SmsProvider {
  console.log('VERIFYING SMS ENV VARS:', { sid: process.env.TWILIO_ACCOUNT_SID ? 'OK' : 'MISSING', token: process.env.TWILIO_AUTH_TOKEN ? 'OK' : 'MISSING', from: process.env.TWILIO_FROM ? 'OK' : 'MISSING' });
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    return new TwilioSmsProvider()
  }
  return new DryRunSmsProvider()
}

export function getWhatsAppProvider(): WhatsAppProvider {
  console.log('VERIFYING WHATSAPP ENV VARS:', { token: process.env.WHATSAPP_TOKEN ? 'OK' : 'MISSING', phoneId: process.env.WHATSAPP_PHONE_ID ? 'OK' : 'MISSING' });
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
    return new MetaWhatsAppProvider()
  }
  return new DryRunWhatsAppProvider()
}

export async function sendMessage(channels: Channel[], to: string, text: string, defaultCountryCode?: string) {
  const e164 = toE164(to, defaultCountryCode)
  const results: Record<Channel, SendResult> = {} as any
  try { console.log('MESSAGE_DISPATCH', { channels, to: e164, length: text?.length || 0 }) } catch {}
  const summarize = (r: any) => ({
    ok: !!(r?.ok),
    provider: String(r?.provider ?? ''),
    errorCode: r && typeof r === 'object' && 'errorCode' in r ? (r as any).errorCode : undefined,
    messageId: r && typeof r === 'object' && 'messageId' in r ? (r as any).messageId : undefined,
  })
  for (const ch of channels) {
    if (ch === 'sms') {
      const r = await getSmsProvider().sendSms(e164, text)
      results.sms = r
      try { console.log('MESSAGE_RESULT', { channel: 'sms', ...summarize(r) }) } catch {}
    } else if (ch === 'whatsapp') {
      const r = await getWhatsAppProvider().sendText(e164, text)
      results.whatsapp = r
      try { console.log('MESSAGE_RESULT', { channel: 'whatsapp', ...summarize(r) }) } catch {}
    }
  }
  return results
}

export async function sendWhatsAppTemplate(to: string, name: string, language: string, components: any[] = [], countryCode = 'GT') {
  const e164 = toE164(to, countryCode)
  try { console.log('WHATSAPP_TEMPLATE_DISPATCH', { to: e164, name, language, componentsCount: (components || []).length }) } catch {}
  const res = await getWhatsAppProvider().sendTemplate(e164, name, language, components || [])
  try {
    const summarize = (r: any) => ({
      ok: !!(r?.ok),
      provider: String(r?.provider ?? ''),
      errorCode: r && typeof r === 'object' && 'errorCode' in r ? (r as any).errorCode : undefined,
      messageId: r && typeof r === 'object' && 'messageId' in r ? (r as any).messageId : undefined,
    })
    console.log('WHATSAPP_TEMPLATE_RESULT', summarize(res))
  } catch {}
  return res
}
