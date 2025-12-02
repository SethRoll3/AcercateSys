import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const service = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await service.from('system_settings').select('*').limit(1)
    const row = Array.isArray(data) ? data[0] : null
    return NextResponse.json(row || null)
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
    if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const service = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Upsert single row settings
    const { data: existing } = await service.from('system_settings').select('id').limit(1)
    const id = Array.isArray(existing) && existing[0]?.id

    if (id) {
      const { error } = await service
        .from('system_settings')
        .update({
          support_contact: body.support_contact,
          payment_instructions: body.payment_instructions,
          default_quiet_hours_start: body.default_quiet_hours_start,
          default_quiet_hours_end: body.default_quiet_hours_end,
          default_country_code: body.default_country_code,
          timezone: body.timezone,
          dynamic_mora_enabled: !!body.dynamic_mora_enabled,
          dynamic_mora_amount: Number(body.dynamic_mora_amount ?? 0),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) {
        console.error('[settings.system] Update error:', error)
        return NextResponse.json({ error: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint }, { status: 500 })
      }
    } else {
      const { error } = await service
        .from('system_settings')
        .insert({
          support_contact: body.support_contact,
          payment_instructions: body.payment_instructions,
          default_quiet_hours_start: body.default_quiet_hours_start,
          default_quiet_hours_end: body.default_quiet_hours_end,
          default_country_code: body.default_country_code,
          timezone: body.timezone,
          dynamic_mora_enabled: !!body.dynamic_mora_enabled,
          dynamic_mora_amount: Number(body.dynamic_mora_amount ?? 0),
        })
      if (error) {
        console.error('[settings.system] Insert error:', error)
        return NextResponse.json({ error: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[settings.system] Unexpected error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
