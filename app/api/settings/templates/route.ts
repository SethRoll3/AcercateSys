import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data } = await admin
      .from('notifications_templates')
      .select('*')
      .order('key', { ascending: true })
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createClient({ admin: true })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    // Expected: { key, channel, locale, text, active }
    const { key, channel, locale = 'es-GT', text, active = true } = body || {}
    if (!key || !channel || !text) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { data: existing } = await admin
      .from('notifications_templates')
      .select('id')
      .eq('key', key)
      .eq('channel', channel)
      .eq('locale', locale)
      .limit(1)

    const row = Array.isArray(existing) ? existing[0] : null
    if (row) {
      const { error } = await admin
        .from('notifications_templates')
        .update({ text, active })
        .eq('id', row.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await admin
        .from('notifications_templates')
        .insert({ key, channel, locale, text, active })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
