export interface SmsProvider {
  sendSms(to: string, text: string): Promise<{ ok: boolean; provider: string; errorCode?: string; raw?: any }>
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
    return { ok: res.ok, provider: 'twilio', errorCode: res.ok ? undefined : String(raw?.code || res.status), raw: { ...raw }, ...(messageId ? { messageId } : {}) }
  }
}

export class DryRunSmsProvider implements SmsProvider {
  async sendSms(to: string, text: string) {
    return { ok: true, provider: 'dry-run', raw: { to, text } }
  }
}
