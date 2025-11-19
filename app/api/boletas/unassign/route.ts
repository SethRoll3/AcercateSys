import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { paymentScheduleId, boletaIds } = body || {}

    if (!paymentScheduleId || !Array.isArray(boletaIds) || boletaIds.length === 0) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    // Fetch current user info
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('auth_id', user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // Load schedule -> loan -> client to enforce access
    const { data: scheduleRow, error: scheduleError } = await supabase
      .from('payment_schedule')
      .select('id, loan_id')
      .eq('id', paymentScheduleId)
      .single()

    if (scheduleError || !scheduleRow) {
      return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 })
    }

    const { data: loanRow, error: loanError } = await supabase
      .from('loans')
      .select('id, client_id')
      .eq('id', scheduleRow.loan_id)
      .single()

    if (loanError || !loanRow) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 })
    }

    const { data: clientRow, error: clientError } = await supabase
      .from('clients')
      .select('id, email, advisor_id')
      .eq('id', loanRow.client_id)
      .single()

    if (clientError || !clientRow) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Role-based authorization mirroring /boletas/assign
    if (currentUser.role === 'cliente') {
      if (clientRow.email !== currentUser.email) {
        return NextResponse.json({ error: "No autorizado: la cuota no pertenece al cliente" }, { status: 403 })
      }
    } else if (currentUser.role === 'asesor') {
      if (clientRow.advisor_id !== currentUser.id) {
        return NextResponse.json({ error: "No autorizado: la cuota no pertenece a tus clientes" }, { status: 403 })
      }
    }

    // Use service role to bypass RLS for DELETE safely after manual checks
    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await serviceSupabase
      .from('cuota_boletas')
      .delete()
      .eq('payment_schedule_id', paymentScheduleId)
      .in('boleta_id', boletaIds)
      .select()

    if (error) {
      console.error('[v0] Error unassigning boletas:', error)
      return NextResponse.json({ error: 'Error al desasignar boletas' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[v0] Unassign boletas API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
