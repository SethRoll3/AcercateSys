import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient()
    const body = await req.json().catch(() => ({}))
    // Intentar extraer id y status del payload del Cloud API
    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses || body?.statuses
    const s0 = Array.isArray(statuses) ? statuses[0] : null
    const wamid = s0?.id || body?.wamid || body?.messages?.[0]?.id
    const status = (s0?.status || body?.status || '').toLowerCase()
    if (!wamid) return NextResponse.json({ ok: true })

    const { data: rows } = await admin
      .from('notifications_log')
      .select('id, payload_json, status')
      .contains('payload_json', { results: { whatsapp: { messageId: wamid } } })
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
          .update({ status: newStatus })
          .eq('id', row.id)
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false })
  }
}
