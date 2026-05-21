import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── Generar número de solicitud secuencial ────────────────
async function generateSolicitudNumber() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('betterware_solicitudes')
    .select('numero_solicitud')
    .order('created_at', { ascending: false })
    .limit(100)

  let maxNum = 0
  if (data && data.length) {
    for (const row of data) {
      const value = String(row.numero_solicitud || '')
      const match = value.match(/(\d+)$/)
      if (match) {
        const num = Number(match[1])
        if (Number.isFinite(num) && num > maxNum) maxNum = num
      }
    }
  }
  const next = maxNum + 1
  return `BW-${String(next).padStart(6, '0')}`
}

// ─── GET: Listar solicitudes ───────────────────────────────
export async function GET(request: NextRequest) {
  try {
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

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const allowedRoles = ['admin', 'asesor', 'contador', 'betterware_supervisor']
    if (!allowedRoles.includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use admin client to bypass RLS (role already validated above)
    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const estado = searchParams.get('estado')

    // Single solicitud
    if (id) {
      const { data, error } = await admin
        .from('betterware_solicitudes')
        .select(`
          *,
          cliente:betterware_clientes(*)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data) {
        return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
      }
      return NextResponse.json(data)
    }

    // List all
    let query = admin
      .from('betterware_solicitudes')
      .select(`
        *,
        cliente:betterware_clientes(id, dpi, nombres, apellidos, telefono, gerente_zona)
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (estado) {
      query = query.eq('estado_asociado', estado)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Count documents per solicitud for completeness indicator
    const solicitudIds = (data || []).map((s: any) => s.id)
    let docsCountMap: Record<string, number> = {}
    if (solicitudIds.length > 0) {
      const { data: docsData } = await admin
        .from('betterware_documentos')
        .select('solicitud_id, tipo_documento')
        .in('solicitud_id', solicitudIds)

      if (docsData) {
        const byId: Record<string, Set<string>> = {}
        for (const doc of docsData) {
          const key = String(doc.solicitud_id)
          if (!byId[key]) byId[key] = new Set()
          byId[key].add(doc.tipo_documento)
        }
        for (const [k, v] of Object.entries(byId)) {
          docsCountMap[k] = v.size
        }
      }
    }

    const enriched = (data || []).map((s: any) => ({
      ...s,
      documentos_count: docsCountMap[s.id] || 0,
      expediente_completo: (docsCountMap[s.id] || 0) >= 4, // 4 tipos requeridos
    }))

    return NextResponse.json(enriched, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[betterware] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST: Crear solicitud ─────────────────────────────────
export async function POST(request: NextRequest) {
  try {
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

    if (!userData || !['admin', 'asesor', 'betterware_supervisor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { cliente_id, id_referencia, score_credito, monto_solicitado, fecha_solicitud } = body

    if (!cliente_id || !monto_solicitado) {
      return NextResponse.json({ error: 'cliente_id y monto_solicitado son obligatorios' }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const admin = createAdminClient()

    // Verify client exists
    const { data: clienteExists } = await admin
      .from('betterware_clientes')
      .select('id')
      .eq('id', cliente_id)
      .maybeSingle()

    if (!clienteExists) {
      return NextResponse.json({ error: 'Cliente Betterware no encontrado' }, { status: 404 })
    }

    // Generate solicitud number with retry
    let newSolicitud: any = null
    let lastError: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const numero = await generateSolicitudNumber()
      const { data, error } = await admin
        .from('betterware_solicitudes')
        .insert({
          cliente_id,
          numero_solicitud: numero,
          id_referencia: id_referencia || null,
          score_credito: score_credito || null,
          monto_solicitado: parseFloat(monto_solicitado),
          monto_autorizado: 0,
          status: 'pendiente',
          estado_asociado: 'habilitado',
          fecha_solicitud: fecha_solicitud || new Date().toISOString().split('T')[0],
          created_by: userData.id,
        })
        .select(`*, cliente:betterware_clientes(*)`)
        .single()

      if (!error) {
        newSolicitud = data
        break
      }
      lastError = error
      if (error.code !== '23505') {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (!newSolicitud) {
      return NextResponse.json({ error: lastError?.message || 'Error generando número de solicitud' }, { status: 409 })
    }

    return NextResponse.json({ message: 'Solicitud creada', data: newSolicitud }, { status: 201 })
  } catch (error) {
    console.error('[betterware] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH: Editar solicitud ───────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
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

    if (!userData || !['admin', 'asesor', 'betterware_supervisor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Solicitud ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const updates: any = {}
    const allowedFields = ['id_referencia', 'score_credito', 'monto_solicitado', 'monto_autorizado', 'status', 'fecha_solicitud']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Only admin can change status to aprobado from rechazado (re-evaluation)
    if (body.status === 'aprobado') {
      const { data: currentSol } = await admin
        .from('betterware_solicitudes')
        .select('status')
        .eq('id', id)
        .maybeSingle()

      if (currentSol?.status === 'rechazado' && userData.role !== 'admin') {
        return NextResponse.json({ error: 'Solo un administrador puede re-aprobar una solicitud rechazada' }, { status: 403 })
      }
    }

    const { data, error } = await admin
      .from('betterware_solicitudes')
      .update(updates)
      .eq('id', id)
      .select(`*, cliente:betterware_clientes(*)`)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[betterware] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: Eliminar solicitud (solo admin) ───────────────
export async function DELETE(request: NextRequest) {
  try {
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

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar solicitudes' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Solicitud ID is required' }, { status: 400 })
    }

    const { error } = await admin
      .from('betterware_solicitudes')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Solicitud eliminada' })
  } catch (error) {
    console.error('[betterware] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
