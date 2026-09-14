import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Solo admin puede cancelar préstamos
    const { data: currentUser } = await admin
      .from("users")
      .select("id, role, email, full_name")
      .eq("auth_id", user.id)
      .single()

    if (!currentUser || currentUser.role !== "admin") {
      return NextResponse.json({ error: "Solo administradores pueden cancelar préstamos" }, { status: 403 })
    }

    const body = await request.json()
    const { reason } = body

    // Obtener el préstamo actual
    const { data: loan, error: loanError } = await admin
      .from("loans")
      .select("id, loan_number, status, client_id")
      .eq("id", loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 })
    }

    if (loan.status === "cancelled") {
      return NextResponse.json({ error: "El préstamo ya está cancelado" }, { status: 400 })
    }

    if (loan.status === "paid") {
      return NextResponse.json({ error: "No se puede cancelar un préstamo pagado" }, { status: 400 })
    }

    const previousStatus = loan.status

    // Cambiar status a cancelled
    const { error: updateError } = await admin
      .from("loans")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", loanId)

    if (updateError) {
      console.error("Error cancelling loan:", updateError)
      return NextResponse.json({ error: "Error al cancelar préstamo" }, { status: 500 })
    }

    // Cancelar cuotas pendientes
    await admin
      .from("payment_schedule")
      .update({ status: "cancelled" })
      .eq("loan_id", loanId)
      .in("status", ["pending", "overdue", "partially_paid"])

    // Crear log de auditoría
    await admin.from("logs").insert({
      actor_user_id: currentUser.id,
      action_type: "UPDATE",
      entity_name: "loans",
      entity_id: loanId,
      action_at: new Date().toISOString(),
      details: {
        message: `Préstamo ${loan.loan_number} cancelado por ${currentUser.full_name || currentUser.email}`,
        actor_email: currentUser.email,
        actor_name: currentUser.full_name,
        loan_number: loan.loan_number,
        previous_status: previousStatus,
        new_status: "cancelled",
        reason: reason || null,
      },
    })

    return NextResponse.json({ success: true, message: "Préstamo cancelado exitosamente" })
  } catch (error) {
    console.error("Error in POST /api/loans/[id]/cancel:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
