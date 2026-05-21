import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── POST: Registrar autorización ──────────────────────────
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
      .select('id, role')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (!userData || !['admin', 'betterware_supervisor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Solo admin o supervisor Betterware pueden autorizar' }, { status: 403 })
    }

    const admin = createAdminClient()

    const body = await request.json()
    const { score, clasificacion, monto_autorizado, resultado, observaciones } = body

    if (!resultado) {
      return NextResponse.json({ error: 'resultado es obligatorio (pendiente, aprobado, rechazado)' }, { status: 400 })
    }

    // If re-evaluating a rejected solicitud, only admin can do it
    const { data: currentSol } = await admin
      .from('betterware_solicitudes')
      .select('status')
      .eq('id', solicitudId)
      .maybeSingle()

    if (!currentSol) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    if (currentSol.status === 'rechazado' && userData.role !== 'admin') {
      return NextResponse.json({ error: 'Solo un administrador puede re-evaluar una solicitud rechazada' }, { status: 403 })
    }

    // Insert authorization record
    const { data: auth, error: authInsertError } = await admin
      .from('betterware_autorizaciones')
      .insert({
        solicitud_id: solicitudId,
        score: score || null,
        clasificacion: clasificacion || null,
        monto_autorizado: monto_autorizado ? parseFloat(monto_autorizado) : null,
        resultado,
        observaciones: observaciones || null,
        autorizado_por: userData.id,
      })
      .select()
      .single()

    if (authInsertError) {
      return NextResponse.json({ error: authInsertError.message }, { status: 500 })
    }

    // Update solicitud status and monto_autorizado based on authorization result
    const solUpdates: any = { status: resultado }
    if (resultado === 'aprobado' && monto_autorizado) {
      solUpdates.monto_autorizado = parseFloat(monto_autorizado)
    }
    if (score) {
      solUpdates.score_credito = score
    }

    const { error: updateError } = await admin
      .from('betterware_solicitudes')
      .update(solUpdates)
      .eq('id', solicitudId)

    if (updateError) {
      console.error('[betterware-auth] Update solicitud error:', updateError)
    }

    return NextResponse.json({ message: 'Autorización registrada', data: auth }, { status: 201 })
  } catch (error) {
    console.error('[betterware-auth] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH: Actualizar autorización ────────────────────────
export async function PATCH(
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
      .select('id, role')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (!userData || !['admin', 'betterware_supervisor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const authId = searchParams.get('authId')
    if (!authId) {
      return NextResponse.json({ error: 'authId is required' }, { status: 400 })
    }

    const body = await request.json()
    const updates: any = {}
    const allowedFields = ['score', 'clasificacion', 'monto_autorizado', 'resultado', 'observaciones']
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    const { data, error } = await admin
      .from('betterware_autorizaciones')
      .update(updates)
      .eq('id', authId)
      .eq('solicitud_id', solicitudId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[betterware-auth] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
