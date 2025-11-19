import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { loanId, scheduleId, amount, paymentDate, paymentMethod, notes } = data

    // Generate receipt number
    const { count } = await supabase.from("payments").select("*", { count: "exact", head: true })

    const receiptNumber = `REC-${String((count || 0) + 1).padStart(6, "0")}`

    // Insert payment
    const { data: newPayment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        loan_id: loanId,
        schedule_id: scheduleId,
        amount: Number.parseFloat(amount),
        payment_date: paymentDate,
        receipt_number: receiptNumber,
        payment_method: paymentMethod,
        notes: notes || null,
      })
      .select()
      .single()

    if (paymentError) {
      console.error("[v0] Error creating payment:", paymentError)
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 })
    }

    // Update schedule status
    const { error: scheduleError } = await supabase
      .from("payment_schedule")
      .update({ status: "paid" })
      .eq("id", scheduleId)

    if (scheduleError) {
      console.error("[v0] Error updating schedule:", scheduleError)
    }

    // Transform response
    const transformedPayment = {
      id: newPayment.id,
      loanId: newPayment.loan_id,
      scheduleId: newPayment.schedule_id,
      amount: Number(newPayment.amount),
      paymentDate: newPayment.payment_date,
      receiptNumber: newPayment.receipt_number,
      paymentMethod: newPayment.payment_method,
      notes: newPayment.notes,
      createdAt: newPayment.created_at,
    }

    return NextResponse.json(transformedPayment)
  } catch (error) {
    console.error("[v0] Error creating payment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
