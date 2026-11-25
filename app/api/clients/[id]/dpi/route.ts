import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'dpi-images'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: me, error: meError } = await admin
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (meError || !me || !['admin', 'asesor', 'contador'].includes(me.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { data: client, error: clientError } = await admin
      .from('clients')
      .select(
        'id, advisor_id, dpi_front_path, dpi_back_path, dpi_scanned_at, dpi_provider, birth_date, nationality, dpi_issue_date, dpi_expiry_date',
      )
      .eq('id', id)
      .maybeSingle()

    if (clientError) {
      const missingColumns = clientError.code === '42703' || /column .* does not exist/i.test(clientError.message)
      if (missingColumns) {
        return NextResponse.json({
          configured: false,
          error:
            'La migración de DPI aún no está aplicada. Ejecuta 20261120090000_add_dpi_documents_to_clients.sql en Supabase.',
        })
      }
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    if (me.role === 'asesor' && client.advisor_id !== me.id) {
      return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
    }

    const [frontSigned, backSigned] = await Promise.all([
      client.dpi_front_path
        ? admin.storage.from(BUCKET).createSignedUrl(client.dpi_front_path, 3600)
        : Promise.resolve({ data: null, error: null }),
      client.dpi_back_path
        ? admin.storage.from(BUCKET).createSignedUrl(client.dpi_back_path, 3600)
        : Promise.resolve({ data: null, error: null }),
    ])

    return NextResponse.json({
      configured: true,
      frontUrl: frontSigned.data?.signedUrl ?? null,
      backUrl: backSigned.data?.signedUrl ?? null,
      scannedAt: client.dpi_scanned_at ?? null,
      provider: client.dpi_provider ?? null,
      birth_date: client.birth_date ?? null,
      nationality: client.nationality ?? null,
      dpi_issue_date: client.dpi_issue_date ?? null,
      dpi_expiry_date: client.dpi_expiry_date ?? null,
    })
  } catch (error) {
    console.error('[client-dpi] Unexpected error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
