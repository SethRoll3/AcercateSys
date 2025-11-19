import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTemplate, renderTemplate } from '@/lib/messaging/templates'
import { getSystemSettings } from '@/lib/messaging/settings'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createClient({ admin: true })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const params = new URL(req.url).searchParams
    const stage = params.get('stage') as any
    const clientId = params.get('clientId')
    const channel = (params.get('channel') || 'sms') as 'sms' | 'whatsapp'
    if (!stage || !clientId) return NextResponse.json({ error: 'Missing stage or clientId' }, { status: 400 })

    const { data: client } = await admin.from('clients').select('*').eq('id', clientId).single()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const settings = await getSystemSettings()
    const tkey = stage as any
    const tpl = await getTemplate(tkey, channel)
    const vars = {
      cliente_nombre: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      monto_pendiente: 'Q 0',
      fecha_limite: new Date().toLocaleDateString('es-GT'),
      instrucciones_pago: settings.payment_instructions,
      soporte_contacto: settings.support_contact,
      dias_mora: '0',
      total_pendiente: 'Q 0',
    }
    const text = renderTemplate(tpl, vars)
    return NextResponse.json({ text, channel, stage })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

