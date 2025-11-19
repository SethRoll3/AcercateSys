import { TwilioSmsProvider, DryRunSmsProvider } from './providers/sms'
import { MetaWhatsAppProvider, DryRunWhatsAppProvider } from './providers/whatsapp'
import { toE164 } from './phone'

export type Channel = 'sms' | 'whatsapp'

export interface SendResult {
  ok: boolean
  provider: string
  errorCode?: string
  raw?: any
  messageId?: string
}

export function getSmsProvider() {
  console.log('VERIFYING SMS ENV VARS:', { sid: process.env.TWILIO_ACCOUNT_SID ? 'OK' : 'MISSING', token: process.env.TWILIO_AUTH_TOKEN ? 'OK' : 'MISSING', from: process.env.TWILIO_FROM ? 'OK' : 'MISSING' });
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    return new TwilioSmsProvider()
  }
  return new DryRunSmsProvider()
}

export function getWhatsAppProvider() {
  console.log('VERIFYING WHATSAPP ENV VARS:', { token: process.env.WHATSAPP_TOKEN ? 'OK' : 'MISSING', phoneId: process.env.WHATSAPP_PHONE_ID ? 'OK' : 'MISSING' });
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
    return new MetaWhatsAppProvider()
  }
  return new DryRunWhatsAppProvider()
}

export async function sendMessage(channels: Channel[], to: string, text: string, defaultCountryCode?: string) {
  const e164 = toE164(to, defaultCountryCode)
  const results: Record<Channel, SendResult> = {} as any
  for (const ch of channels) {
    if (ch === 'sms') {
      results.sms = await getSmsProvider().sendSms(e164, text)
    } else if (ch === 'whatsapp') {
      results.whatsapp = await getWhatsAppProvider().sendText(e164, text)
    }
  }
  return results
}

export async function sendWhatsAppTemplate(to: string, name: string, language: string, components: any[] = [], countryCode = 'GT') {
  const e164 = toE164(to, countryCode)
  const res = await getWhatsAppProvider().sendTemplate(e164, name, language, components || [])
  return res
}
