import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ─── GET: Listar clientes Betterware ───────────────────────
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
    const search = searchParams.get('search')

    if (id) {
      const { data, error } = await admin
        .from('betterware_clientes')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json(data)
    }

    let query = admin
      .from('betterware_clientes')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`nombres.ilike.%${search}%,apellidos.ilike.%${search}%,dpi.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [], { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[betterware-clientes] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST: Crear cliente Betterware ────────────────────────
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
    const { dpi, nombres, apellidos, direccion, telefono, nit, fecha_nacimiento, email, gerente_zona, observaciones } = body

    if (!dpi || !nombres || !apellidos) {
      return NextResponse.json({ error: 'DPI, nombres y apellidos son obligatorios' }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const admin = createAdminClient()

    // Check for duplicate DPI
    const { data: existing } = await admin
      .from('betterware_clientes')
      .select('id')
      .eq('dpi', dpi)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Ya existe un cliente Betterware con ese DPI' }, { status: 409 })
    }

    const { data, error } = await admin
      .from('betterware_clientes')
      .insert({
        dpi,
        nombres,
        apellidos,
        direccion: direccion || null,
        telefono: telefono || null,
        nit: nit || null,
        fecha_nacimiento: fecha_nacimiento || null,
        email: email || null,
        gerente_zona: gerente_zona || null,
        observaciones: observaciones || null,
        created_by: userData.id,
      })
      .select()
      .single()

    if (error) {
      console.error('[betterware-clientes] POST error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Cliente Betterware creado', data }, { status: 201 })
  } catch (error) {
    console.error('[betterware-clientes] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PATCH: Editar cliente Betterware ──────────────────────
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const updates: any = {}
    const allowedFields = ['dpi', 'nombres', 'apellidos', 'direccion', 'telefono', 'nit', 'fecha_nacimiento', 'email', 'gerente_zona', 'observaciones']
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Use admin client to bypass RLS
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('betterware_clientes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[betterware-clientes] PATCH error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[betterware-clientes] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: Eliminar cliente Betterware (solo admin) ──────
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
      return NextResponse.json({ error: 'Solo administradores pueden eliminar clientes' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    // Use admin client to bypass RLS
    const admin = createAdminClient()

    const { error } = await admin
      .from('betterware_clientes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[betterware-clientes] DELETE error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Cliente eliminado' })
  } catch (error) {
    console.error('[betterware-clientes] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
