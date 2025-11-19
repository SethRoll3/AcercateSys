import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
    const { paymentScheduleId, boletaId, boletaIds } = body

    // Support both single boleta (boletaId) and multiple boletas (boletaIds)
    const boletas = boletaIds || (boletaId ? [boletaId] : [])

    if (!paymentScheduleId || boletas.length === 0) {
      return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 })
    }

    // Fetch current user's app role and identifiers
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('auth_id', user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json({ error: "No se pudo determinar el rol del usuario" }, { status: 403 })
    }

    // Authorization guard: ensure the payment schedule belongs to the current user or their assigned clients
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

    // Role-based check before attempting insert (to avoid RLS violations with 500s)
    if (currentUser.role === 'cliente') {
      if (clientRow.email !== currentUser.email) {
        return NextResponse.json({ error: "No autorizado: la cuota no pertenece al cliente" }, { status: 403 })
      }
    } else if (currentUser.role === 'asesor') {
      if (clientRow.advisor_id !== currentUser.id) {
        return NextResponse.json({ error: "No autorizado: la cuota no pertenece a tus clientes" }, { status: 403 })
      }
    }

    // Check if any boleta is already assigned
    const { data: existing } = await supabase
      .from("cuota_boletas")
      .select("boleta_id")
      .eq("payment_schedule_id", paymentScheduleId)
      .in("boleta_id", boletas)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Una o más boletas ya están asignadas a esta cuota" }, { status: 400 })
    }

    // Insert all boletas
    const insertData = boletas.map((currentBoletaId: any) => ({
      payment_schedule_id: paymentScheduleId,
      boleta_id: currentBoletaId,
    }))

    const { data, error } = await supabase
      .from("cuota_boletas")
      .insert(insertData)
      .select()

    if (error) {
      // Translate RLS denial into a clear 403 for clients/advisors
      const code = (error as any).code || ''
      if (code === '42501') {
        return NextResponse.json({ error: "Permisos insuficientes por RLS al asignar boleta a la cuota" }, { status: 403 })
      }
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[v0] Error assigning boleta:", error)
    return NextResponse.json({ error: "Error assigning boleta" }, { status: 500 })
  }
}
