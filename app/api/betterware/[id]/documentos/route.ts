import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Listar documentos de una solicitud ───────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: documentos, error } = await admin
      .from('betterware_documentos')
      .select('*')
      .eq('solicitud_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(documentos || [])
  } catch (error) {
    console.error('[betterware-docs] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST: Subir documento ─────────────────────────────────
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

    const formData = await request.formData()
    const file = formData.get('file') as File
    const tipoDocumento = formData.get('tipo_documento') as string

    if (!file || !tipoDocumento) {
      return NextResponse.json({ error: 'file y tipo_documento son obligatorios' }, { status: 400 })
    }

    const validTypes = ['solicitud_credito', 'consulta_buro', 'dpi', 'recibo', 'otro']
    if (!validTypes.includes(tipoDocumento)) {
      return NextResponse.json({ error: `tipo_documento inválido. Valores permitidos: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const admin = createAdminClient()

    // Upload file to Supabase Storage
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${solicitudId}/${tipoDocumento}/${timestamp}_${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await admin.storage
      .from('betterware-docs')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[betterware-docs] Upload error:', uploadError)
      return NextResponse.json({ error: 'Error al subir archivo: ' + uploadError.message }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from('betterware-docs')
      .getPublicUrl(filePath)

    // Save document record
    const { data: docRecord, error: docError } = await admin
      .from('betterware_documentos')
      .insert({
        solicitud_id: solicitudId,
        tipo_documento: tipoDocumento,
        nombre_archivo: file.name,
        url: urlData?.publicUrl || filePath,
        tamano_bytes: file.size,
        mime_type: file.type,
        uploaded_by: userData.id,
      })
      .select()
      .single()

    if (docError) {
      console.error('[betterware-docs] Insert error:', docError)
      return NextResponse.json({ error: docError.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Documento subido', data: docRecord }, { status: 201 })
  } catch (error) {
    console.error('[betterware-docs] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: Eliminar documento ────────────────────────────
export async function DELETE(
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
    const docId = searchParams.get('docId')
    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 })
    }

    let motivo = 'Sin motivo especificado'
    try {
      const body = await request.json()
      if (body.motivo) motivo = body.motivo
    } catch {
      // Body might be empty or invalid JSON, ignore
    }

    // Get document to find storage path and details for the log
    const { data: doc } = await admin
      .from('betterware_documentos')
      .select('url, nombre_archivo, tipo_documento')
      .eq('id', docId)
      .eq('solicitud_id', solicitudId)
      .maybeSingle()

    if (doc?.url) {
      // Try to remove from storage
      try {
        const path = doc.url.split('/betterware-docs/').pop()
        if (path) {
          await admin.storage.from('betterware-docs').remove([path])
        }
      } catch (e) {
        console.warn('[betterware-docs] Could not delete storage file:', e)
      }
    }

    const { error } = await admin
      .from('betterware_documentos')
      .delete()
      .eq('id', docId)
      .eq('solicitud_id', solicitudId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Insert log
    await admin.from('betterware_actividad_log').insert({
      solicitud_id: solicitudId,
      accion: 'Eliminación de documento',
      detalle: `Documento eliminado: ${doc?.nombre_archivo || 'Desconocido'} (${doc?.tipo_documento || 'N/A'})`,
      motivo: motivo,
      created_by: userData.id
    })

    return NextResponse.json({ message: 'Documento eliminado' })
  } catch (error) {
    console.error('[betterware-docs] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
