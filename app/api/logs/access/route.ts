import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const regular = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await regular.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const event = String(body?.event || 'access')
  const details = body?.details ?? {}

  if (event === 'logout') {
    return NextResponse.json({ ok: true })
  }

    let actorId: string | null = null
    {
      const { data: byAuth } = await admin.from('users').select('id').eq('auth_id', user.id).maybeSingle()
      if (byAuth?.id) actorId = String(byAuth.id)
    }
    if (!actorId) {
      const { data: byId } = await admin.from('users').select('id').eq('id', user.id).maybeSingle()
      if (byId?.id) actorId = String(byId.id)
    }
    if (!actorId && user.email) {
      const { data: byEmail } = await admin.from('users').select('id').eq('email', user.email).maybeSingle()
      if (byEmail?.id) actorId = String(byEmail.id)
    }

    const payload = {
      actor_user_id: actorId,
      action_type: 'ACCESS',
      entity_name: 'auth',
      entity_id: null,
      action_at: new Date().toISOString(),
      details: { 
        message: event === 'login' ? 'Inició sesión' : event === 'logout' ? 'Cerró sesión' : `Acceso: ${event}`,
        event, 
        actor_auth_id: user.id, 
        actor_email: user.email, 
        ...details 
      },
    }

    const { error } = await admin.from('logs').insert(payload)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
