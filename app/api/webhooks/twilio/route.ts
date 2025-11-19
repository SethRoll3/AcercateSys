import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function parseForm(body: string) {
  const params = new URLSearchParams(body)
  const obj: Record<string, string> = {}
  params.forEach((v, k) => { obj[k] = v })
  return obj
}

export async function POST(req: NextRequest) {
  try {
    const admin = await createClient({ admin: true })
    const text = await req.text()
    const data = parseForm(text)
    const sid = data['MessageSid'] || data['SmsSid']
    const status = (data['MessageStatus'] || '').toLowerCase()
    const errorCode = data['ErrorCode'] || null
    if (!sid) return NextResponse.json({ ok: true })

    // Buscar el último log que contenga este messageId en payload_json.results.sms.messageId
    const { data: rows } = await admin
      .from('notifications_log')
      .select('id, payload_json, status')
      .contains('payload_json', { results: { sms: { messageId: sid } } })
      .order('sent_at', { ascending: false })
      .limit(1)
    const row = Array.isArray(rows) ? rows[0] : null
    if (row?.id) {
      const delivered = status === 'delivered'
      const failed = status === 'failed' || status === 'undelivered'
      const newStatus = delivered ? 'delivered' : failed ? 'failed' : row.status
      if (newStatus !== row.status) {
        await admin
          .from('notifications_log')
          .update({ status: newStatus, error_code: errorCode })
          .eq('id', row.id)
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false })
  }
}

