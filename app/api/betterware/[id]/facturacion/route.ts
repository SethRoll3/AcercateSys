import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Listar facturación semanal ───────────────────────
export async function GET(
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

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('betterware_facturacion')
      .select('*')
      .eq('solicitud_id', solicitudId)
      .order('anio', { ascending: false })
      .order('numero_semana', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('[betterware-facturacion] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST: Registrar factura semanal ───────────────────────
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

    if (!userData || !['admin', 'asesor', 'betterware_supervisor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()

    const body = await request.json()
    const { numero_semana, anio, monto_factura, limite_asignado, observaciones } = body

    if (!numero_semana || !anio || monto_factura === undefined) {
      return NextResponse.json({ error: 'numero_semana, anio y monto_factura son obligatorios' }, { status: 400 })
    }

    // Get solicitud's monto_autorizado for default limite
    const { data: solicitud } = await admin
      .from('betterware_solicitudes')
      .select('monto_autorizado')
      .eq('id', solicitudId)
      .maybeSingle()

    if (!solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    const limite = limite_asignado !== undefined ? parseFloat(limite_asignado) : parseFloat(solicitud.monto_autorizado || 0)
    const montoFact = parseFloat(monto_factura)
    const excedente = Math.max(0, montoFact - limite)
    const status = excedente > 0 ? 'excedente_pendiente' : 'pendiente'

    const { data, error } = await admin
      .from('betterware_facturacion')
      .insert({
        solicitud_id: solicitudId,
        numero_semana: parseInt(numero_semana),
        anio: parseInt(anio),
        monto_factura: montoFact,
        limite_asignado: limite,
        excedente,
        pago_excedente: 0,
        status,
        observaciones: observaciones || null,
        created_by: userData.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `Ya existe facturación para la semana ${numero_semana} del año ${anio}` }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Facturación registrada', data }, { status: 201 })
  } catch (error) {
    console.error('[betterware-facturacion] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH: Actualizar factura ─────────────────────────────
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
    const factId = searchParams.get('factId')
    if (!factId) {
      return NextResponse.json({ error: 'factId is required' }, { status: 400 })
    }

    const contentType = request.headers.get('content-type') || ''
    const updates: any = {}
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      
      const file = formData.get('file') as File
      if (file) {
        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `${solicitudId}/pagos/${timestamp}_${safeName}`
        
        const arrayBuffer = await file.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)
        
        const { error: uploadError } = await admin.storage
          .from('betterware-docs')
          .upload(filePath, fileBuffer, { contentType: file.type, upsert: false })
          
        if (uploadError) {
          return NextResponse.json({ error: 'Error subiendo comprobante: ' + uploadError.message }, { status: 500 })
        }
        
        const { data: urlData } = admin.storage.from('betterware-docs').getPublicUrl(filePath)
        updates.comprobante_url = urlData?.publicUrl || filePath
      }
      
      // Extract other fields
      const allowedFormDataFields = ['monto_factura', 'limite_asignado', 'pago_excedente', 'status', 'observaciones', 'no_boleta', 'banco', 'fecha_pago']
      for (const field of allowedFormDataFields) {
        if (formData.has(field)) updates[field] = formData.get(field)
      }
    } else {
      const body = await request.json()
      const allowedFields = ['monto_factura', 'limite_asignado', 'pago_excedente', 'status', 'observaciones', 'no_boleta', 'banco', 'fecha_pago', 'comprobante_url']
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field]
        }
      }
    }

    // Recalculate excedente if monto_factura or limite_asignado changed
    if (updates.monto_factura !== undefined || updates.limite_asignado !== undefined) {
      const { data: current } = await admin
        .from('betterware_facturacion')
        .select('monto_factura, limite_asignado')
        .eq('id', factId)
        .maybeSingle()

      if (current) {
        const mf = updates.monto_factura !== undefined ? parseFloat(updates.monto_factura) : parseFloat(current.monto_factura)
        const la = updates.limite_asignado !== undefined ? parseFloat(updates.limite_asignado) : parseFloat(current.limite_asignado)
        updates.excedente = Math.max(0, mf - la)
      }
    }

    const { data, error } = await admin
      .from('betterware_facturacion')
      .update(updates)
      .eq('id', factId)
      .eq('solicitud_id', solicitudId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[betterware-facturacion] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
