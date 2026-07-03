import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'receipts'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await admin
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json().catch(() => null)
    const actaUrl: string | undefined = body?.actaUrl
    if (!actaUrl || typeof actaUrl !== 'string') {
      return NextResponse.json({ error: 'actaUrl requerido' }, { status: 400 })
    }

    const { data: loan } = await admin
      .from('loans')
      .select('id, client_id, acta_url, client:clients(advisor_id)')
      .eq('id', loanId)
      .single()
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

    if (me.role === 'asesor') {
      const clientAdvisor = (loan as any).client?.advisor_id
      if (clientAdvisor !== me.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabaseHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
    const expectedPrefix = `${supabaseHost}/storage/v1/object/public/${STORAGE_BUCKET}/actas/${loanId}/`
    if (!actaUrl.startsWith(expectedPrefix) && !actaUrl.includes(`/storage/v1/object/public/${STORAGE_BUCKET}/actas/${loanId}/`)) {
      return NextResponse.json({ error: 'URL no válida' }, { status: 400 })
    }

    if (loan.acta_url && loan.acta_url !== actaUrl) {
      const oldPath = loan.acta_url.match(/actas\/[^?]+/)?.[0]
      if (oldPath) {
        await admin.storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {})
      }
    }

    const { error: updateError } = await admin
      .from('loans')
      .update({
        acta_url: actaUrl,
        acta_uploaded_at: new Date().toISOString(),
        acta_uploaded_by: me.id,
      })
      .eq('id', loanId)

    if (updateError) {
      console.error('[acta-upload] DB error:', updateError)
      return NextResponse.json({ error: 'Error al guardar referencia' }, { status: 500 })
    }

    return NextResponse.json({
      url: actaUrl,
      uploadedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    console.error('[acta-upload] Unexpected error:', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await admin
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: loan } = await admin
      .from('loans')
      .select('id, client_id, acta_url, client:clients(advisor_id)')
      .eq('id', loanId)
      .single()
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

    if (me.role === 'asesor') {
      const clientAdvisor = (loan as any).client?.advisor_id
      if (clientAdvisor !== me.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (loan.acta_url) {
      const oldPath = loan.acta_url.match(/actas\/[^?]+/)?.[0]
      if (oldPath) {
        await admin.storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {})
      }
    }

    const { error: updateError } = await admin
      .from('loans')
      .update({
        acta_url: null,
        acta_uploaded_at: null,
        acta_uploaded_by: null,
      })
      .eq('id', loanId)

    if (updateError) {
      console.error('[acta-upload] DB error on delete:', updateError)
      return NextResponse.json({ error: 'Error al limpiar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[acta-upload] Unexpected error:', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
