import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── POST: Cambiar estado del asociado ─────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: solicitudId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (!userData || !['admin', 'betterware_supervisor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Solo admin o supervisor Betterware pueden cambiar estado' }, { status: 403 })
    }

    const admin = createAdminClient()

    const body = await request.json()
    const { estado_nuevo, motivo, requiere_excepcion, supervisor_password } = body

    if (!estado_nuevo || !motivo) {
      return NextResponse.json({ error: 'estado_nuevo y motivo son obligatorios' }, { status: 400 })
    }

    const validStates = ['habilitado', 'despacho_detenido', 'bloqueado']
    if (!validStates.includes(estado_nuevo)) {
      return NextResponse.json({ error: `Estado inválido. Valores permitidos: ${validStates.join(', ')}` }, { status: 400 })
    }

    // Get current solicitud state
    const { data: solicitud } = await admin
      .from('betterware_solicitudes')
      .select('estado_asociado')
      .eq('id', solicitudId)
      .maybeSingle()

    if (!solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    if (solicitud.estado_asociado === estado_nuevo) {
      return NextResponse.json({ error: 'El estado ya es el mismo' }, { status: 400 })
    }

    // If exception is required, verify supervisor password
    let supervisorId = null
    if (requiere_excepcion) {
      if (!supervisor_password) {
        return NextResponse.json({ error: 'Se requiere la contraseña del supervisor para aplicar la excepción' }, { status: 400 })
      }

      // Re-authenticate the user with their password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: supervisor_password,
      })

      if (signInError) {
        return NextResponse.json({ error: 'Contraseña de supervisor incorrecta' }, { status: 401 })
      }

      supervisorId = userData.id
    }

    // Log the state change
    const { error: logError } = await admin
      .from('betterware_estados_log')
      .insert({
        solicitud_id: solicitudId,
        estado_anterior: solicitud.estado_asociado,
        estado_nuevo,
        motivo,
        requiere_excepcion: !!requiere_excepcion,
        supervisor_id: supervisorId,
        created_by: userData.id,
      })

    if (logError) {
      console.error('[betterware-estado] Log insert error:', logError)
      return NextResponse.json({ error: logError.message }, { status: 500 })
    }

    // Update solicitud state
    const { data: updated, error: updateError } = await admin
      .from('betterware_solicitudes')
      .update({ estado_asociado: estado_nuevo })
      .eq('id', solicitudId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      message: `Estado cambiado a ${estado_nuevo}`,
      data: updated,
    })
  } catch (error) {
    console.error('[betterware-estado] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
