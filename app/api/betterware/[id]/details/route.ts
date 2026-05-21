import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Detalle completo de solicitud ────────────────────
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

    // Fetch solicitud with client
    const { data: solicitud, error: solError } = await admin
      .from('betterware_solicitudes')
      .select(`*, cliente:betterware_clientes(*)`)
      .eq('id', id)
      .maybeSingle()

    if (solError || !solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    // Fetch documents
    const { data: documentos } = await admin
      .from('betterware_documentos')
      .select('*')
      .eq('solicitud_id', id)
      .order('created_at', { ascending: false })

    // Fetch authorizations
    const { data: autorizaciones } = await admin
      .from('betterware_autorizaciones')
      .select('*')
      .eq('solicitud_id', id)
      .order('created_at', { ascending: false })

    // Fetch estado history
    const { data: estadosLog } = await admin
      .from('betterware_estados_log')
      .select('*')
      .eq('solicitud_id', id)
      .order('created_at', { ascending: false })

    // Fetch billing
    const { data: facturacion } = await admin
      .from('betterware_facturacion')
      .select('*')
      .eq('solicitud_id', id)
      .order('anio', { ascending: false })
      .order('numero_semana', { ascending: false })

    // Document completeness
    const requiredDocs = ['solicitud_credito', 'consulta_buro', 'dpi', 'recibo']
    const uploadedTypes = new Set((documentos || []).map((d: any) => d.tipo_documento))
    const docsCompleteness = {
      total_required: requiredDocs.length,
      uploaded: uploadedTypes.size,
      complete: requiredDocs.every(t => uploadedTypes.has(t)),
      missing: requiredDocs.filter(t => !uploadedTypes.has(t)),
    }

    return NextResponse.json({
      solicitud,
      documentos: documentos || [],
      autorizaciones: autorizaciones || [],
      estados_log: estadosLog || [],
      facturacion: facturacion || [],
      docs_completeness: docsCompleteness,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[betterware-details] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
