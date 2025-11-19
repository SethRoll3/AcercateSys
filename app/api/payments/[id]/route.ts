import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const paymentId = params.id
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
      has_been_edited: has_been_edited ? true : true,
      rejection_reason: null,
    }

    if (amount !== undefined) {
      const roundedAmount = Math.round(Number(amount) * 100) / 100
      if (roundedAmount <= 0) {
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
      .select()
      .single()

    if (updateError) {
      console.error("Error updating payment:", updateError)
      return NextResponse.json({ error: "Failed to update payment" }, { status: 500 })
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