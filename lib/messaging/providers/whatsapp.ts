export interface WhatsAppProvider {
  sendText(to: string, text: string): Promise<{ ok: boolean; provider: string; errorCode?: string; raw?: any }>
  sendTemplate(to: string, name: string, language: string, components: any[]): Promise<{ ok: boolean; provider: string; errorCode?: string; raw?: any; messageId?: string }>
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private token: string | undefined
  private phoneId: string | undefined

  constructor() {
    this.token = process.env.WHATSAPP_TOKEN
    this.phoneId = process.env.WHATSAPP_PHONE_ID
  }

  async sendText(to: string, text: string) {
    if (!this.token || !this.phoneId) {
      return { ok: false, provider: 'meta_whatsapp', errorCode: 'missing_env' }
    }
    const url = `https://graph.facebook.com/v20.0/${this.phoneId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const raw = await res.json().catch(() => ({}))
    const messageId = raw?.messages?.[0]?.id || raw?.contacts?.[0]?.wa_id || undefined
    return { ok: res.ok, provider: 'meta_whatsapp', errorCode: res.ok ? undefined : String(raw?.error?.code || res.status), raw: { ...raw }, ...(messageId ? { messageId } : {}) }
  }

  async sendTemplate(to: string, name: string, language: string, components: any[] = []) {
    if (!this.token || !this.phoneId) {
      return { ok: false, provider: 'meta_whatsapp', errorCode: 'missing_env' }
    }
    const url = `https://graph.facebook.com/v20.0/${this.phoneId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name,
        language: { code: language },
        components,
      },
    }
    try {
      console.log('WHATSAPP_TEMPLATE_REQUEST', {
        to,
        name,
        language,
        components,
      })
    } catch {}
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const raw = await res.json().catch(() => ({}))
    try {
      if (!res.ok) {
        console.log('WHATSAPP_TEMPLATE_ERROR', { status: res.status, raw })
      } else {
        console.log('WHATSAPP_TEMPLATE_OK', raw)
      }
    } catch {}
    const messageId = raw?.messages?.[0]?.id || raw?.contacts?.[0]?.wa_id || undefined
    return { ok: res.ok, provider: 'meta_whatsapp', errorCode: res.ok ? undefined : String(raw?.error?.code || res.status), raw: { ...raw }, ...(messageId ? { messageId } : {}) }
  }
}

export class DryRunWhatsAppProvider implements WhatsAppProvider {
  async sendText(to: string, text: string) {
    return { ok: true, provider: 'dry-run', raw: { to, text } }
  }

  async sendTemplate(to: string, name: string, language: string, components: any[] = []) {
    return { ok: true, provider: 'dry-run', raw: { to, name, language, components }, messageId: 'DRY_RUN_WA_TEMPLATE' }
  }
}
