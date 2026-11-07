import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: paymentId } = await params
    const supabase = await createClient()

    // 1) Auth user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2) Get user role/email
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("auth_id", user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // 3) Service role client to bypass RLS; enforce our own checks
    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    // 4) Fetch payment with loan->client for role checks
    const { data: paymentRow, error: paymentError } = await serviceSupabase
      .from("payments")
      .select(
        `
        *,
        loan:loans (
          client:clients (
            id, email, advisor_id
          )
        )
      `
      )
      .eq("id", paymentId)
      .single()

    if (paymentError || !paymentRow) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    if (paymentRow.confirmation_status === "aprobado") {
      return NextResponse.json({ error: "Un pago aprobado no se puede editar" }, { status: 409 })
    }

    // 5) Role-based access: cliente -> own email; asesor -> assigned client; admin -> any
    const client = paymentRow.loan?.client
    if (userData.role === "cliente") {
      if (!client || client.email !== userData.email) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 })
      }
    } else if (userData.role === "asesor") {
      if (!client || client.advisor_id !== userData.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 })
      }
    }

    // 6) Build update payload from provided fields
    const body = await request.json()
    const { amount, paymentDate, paymentMethod, notes, has_been_edited } = body || {}

    const updateData: any = {
      // keep confirmation pending while edited
      confirmation_status: "pending_confirmation",
      has_been_edited: true,
      rejection_reason: null,
      confirmed_by: null,
      confirmed_at: null,
    }

    if (amount !== undefined) {
      const roundedAmount = Math.round(Number(amount) * 100) / 100
      if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
        return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
      }
      updateData.amount = roundedAmount
    }
    if (paymentDate) updateData.payment_date = paymentDate
    if (paymentMethod) updateData.payment_method = paymentMethod
    if (notes !== undefined) updateData.notes = notes

    // 7) Update payment
    const { data: updated, error: updateError } = await serviceSupabase
      .from("payments")
      .update(updateData)
      .eq("id", paymentId)
      .in("confirmation_status", ["pending_confirmation", "rechazado"])
      .select()
      .single()

    if (updateError) {
      console.error("Error updating payment:", updateError)
      return NextResponse.json({ error: "Failed to update payment" }, { status: 500 })
    }

    // Editing a rejected payment sends it back to review. Rebuild the schedule's
    // paid amount from approved payments only so a previously rejected submission
    // cannot remain counted as money received.
    const notesText = String(updated.notes || "")
    let scheduleIds = [updated.schedule_id]
    if (notesText.startsWith("[FULL_PAYMENT]")) {
      const left = notesText.indexOf("{")
      const right = notesText.lastIndexOf("}")
      if (left !== -1 && right > left) {
        try {
          const parsed = JSON.parse(notesText.slice(left, right + 1))
          if (Array.isArray(parsed?.scheduleIds)) {
            scheduleIds = Array.from(new Set([updated.schedule_id, ...parsed.scheduleIds.filter((value: unknown) => typeof value === "string")]))
          }
        } catch {
          // Keep the payment's own schedule if legacy full-payment notes are malformed.
        }
      }
    }

    const { data: targetSchedules, error: targetSchedulesError } = await serviceSupabase
      .from("payment_schedule")
      .select("id")
      .in("id", scheduleIds)
      .eq("loan_id", updated.loan_id)

    if (targetSchedulesError) {
      console.error("Error loading schedules for payment resubmission:", targetSchedulesError)
      return NextResponse.json({ error: "No se pudo devolver el pago a revisión" }, { status: 500 })
    }

    const validScheduleIds = (targetSchedules || []).map((schedule: any) => schedule.id)
    // Pending and rejected payments never change the paid balance. Abonos and
    // other approved payments may already be reflected in paid_amount.
    for (const scheduleId of validScheduleIds) {
      const { error: scheduleUpdateError } = await serviceSupabase
        .from("payment_schedule")
        .update({ status: "pending_confirmation" })
        .eq("id", scheduleId)
        .eq("loan_id", updated.loan_id)

      if (scheduleUpdateError) {
        console.error("Error resubmitting payment schedule:", scheduleUpdateError)
        return NextResponse.json({ error: "No se pudo devolver el pago a revisión" }, { status: 500 })
      }
    }

    // 8) Return transformed payment (frontend shape)
    const transformed = {
      id: updated.id,
      loanId: updated.loan_id,
      scheduleId: updated.schedule_id,
      amount: Number(updated.amount),
      paymentDate: updated.payment_date,
      receiptNumber: updated.receipt_number,
      paymentMethod: updated.payment_method,
      notes: updated.notes,
      confirmationStatus: updated.confirmation_status,
      receiptImageUrl: updated.receipt_image_url,
      confirmedBy: updated.confirmed_by,
      confirmedAt: updated.confirmed_at,
      rejectionReason: updated.rejection_reason,
      hasBeenEdited: Boolean(updated.has_been_edited),
      createdAt: updated.created_at,
    }

    return NextResponse.json(transformed)
  } catch (error) {
    console.error("[v0] Error in PATCH /api/payments/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
