import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const regular = await createClient()
    const { data: { user } } = await regular.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me, error: meError } = await regular
      .from('users')
      .select('id, auth_id, email, full_name, role')
      .eq('auth_id', user.id)
      .single()

    if (meError || !me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const admin = await createAdminClient()
    const { data: clientRows } = await admin
      .from('clients')
      .select('id, first_name, last_name, email, phone, phone_country_code, emergency_phone, address')
      .eq('email', me.email)
      .limit(1)

    const client = Array.isArray(clientRows) ? clientRows[0] : null

    return NextResponse.json({ user: me, client })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const regular = await createClient()
    const admin = await createAdminClient()
    const body = await req.json()

    const { data: { user } } = await regular.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me, error: meError } = await regular
      .from('users')
      .select('id, auth_id, email, full_name, role')
      .eq('auth_id', user.id)
      .single()

    if (meError || !me) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (me.role !== 'cliente') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const previousEmail = me.email
    const newEmail = String(body.email || previousEmail)
    const newFullName = String(body.full_name || me.full_name || '')

    const { data: clientRows } = await admin
      .from('clients')
      .select('id')
      .eq('email', previousEmail)
      .limit(1)

    const clientId = Array.isArray(clientRows) && clientRows[0]?.id

    const updates: any = {}
    if (body.first_name !== undefined) updates.first_name = body.first_name
    if (body.last_name !== undefined) updates.last_name = body.last_name
    if (body.address !== undefined) updates.address = body.address
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.phone_country_code !== undefined) updates.phone_country_code = body.phone_country_code
    if (body.emergency_phone !== undefined) updates.emergency_phone = body.emergency_phone
    if (newEmail && newEmail !== previousEmail) updates.email = newEmail

    if (clientId) {
      const { error: clientUpdateError } = await admin
        .from('clients')
        .update(updates)
        .eq('id', clientId)
      if (clientUpdateError) return NextResponse.json({ error: clientUpdateError.message }, { status: 500 })
    }

    const { error: userUpdateError } = await admin
      .from('users')
      .update({ email: newEmail, full_name: newFullName })
      .eq('id', me.id)
    if (userUpdateError) return NextResponse.json({ error: userUpdateError.message }, { status: 500 })

    const { error: authError } = await admin.auth.admin.updateUserById(me.auth_id, {
      email: newEmail,
      user_metadata: { full_name: newFullName, role: me.role }
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

    // Log the profile update
    try {
      await admin.from("logs").insert({
        actor_user_id: user.id,
        action_type: "UPDATE",
        entity_name: "profile",
        entity_id: me.id,
        action_at: new Date().toISOString(),
        details: {
          message: `Perfil de usuario ${me.email} actualizado.`,
          user_id: me.id,
          updated_fields: Object.keys(updates)
        },
      })
    } catch (logErr) {
      console.error("Error creating log for profile update:", logErr)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}