export interface SmsProvider {
  sendSms(to: string, text: string): Promise<{ ok: boolean; provider: string; errorCode?: string; raw?: any; messageId?: string }>
}

export class TwilioSmsProvider implements SmsProvider {
  private accountSid: string | undefined
  private authToken: string | undefined
  private from: string | undefined

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID
    this.authToken = process.env.TWILIO_AUTH_TOKEN
    this.from = process.env.TWILIO_FROM
  }

  async sendSms(to: string, text: string) {
    if (!this.accountSid || !this.authToken || !this.from) {
      return { ok: false, provider: 'twilio', errorCode: 'missing_env' }
    }
    try { console.log('SMS_SEND_REQUEST', { to, from: this.from, length: text?.length || 0 }) } catch {}
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`
    const body = new URLSearchParams({ From: this.from, To: to, Body: text })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const raw = await res.json().catch(() => ({}))
    const messageId = raw?.sid || undefined
    try {
      if (!res.ok) {
        console.log('SMS_SEND_ERROR', { status: res.status, code: String(raw?.code || res.status), to, provider: 'twilio' })
      } else {
        console.log('SMS_SEND_OK', { to, provider: 'twilio', messageId })
      }
    } catch {}
    return { ok: res.ok, provider: 'twilio', errorCode: res.ok ? undefined : String(raw?.code || res.status), raw: { ...raw }, ...(messageId ? { messageId } : {}) }
  }
}

export class DryRunSmsProvider implements SmsProvider {
  async sendSms(to: string, text: string) {
    try { console.log('SMS_DRY_RUN', { to, length: text?.length || 0 }) } catch {}
    return { ok: true, provider: 'dry-run', raw: { to, text }, messageId: 'DRY_RUN_SMS' }
  }
}
