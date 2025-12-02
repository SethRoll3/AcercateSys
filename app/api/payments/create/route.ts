import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

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

  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .select("status")
    .eq("id", loanId)
    .single()
  if (loanError || !loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 })
  }
  if (loan.status !== "active") {
    return NextResponse.json({ error: "Loan is not active" }, { status: 409 })
  }

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

    try {
      const serviceSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const { data: loanRow } = await serviceSupabase
        .from('loans')
        .select(`id, client:clients(id, first_name, last_name, email, advisor:users!advisor_id(email))`)
        .eq('id', loanId)
        .limit(1)
        .single()

      const client = loanRow?.client
      const advisorEmail: string | null = client?.advisor?.email || null
      const actionUrl = `/dashboard/loans/${loanId}`
      const fmt = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
      const amountText = fmt.format(Number(newPayment.amount) || 0)

      const rows: any[] = []
      if (advisorEmail) {
        rows.push({
          recipient_email: advisorEmail,
          recipient_role: 'asesor',
          title: 'Nuevo pago registrado',
          body: `El cliente ${client?.first_name || ''} ${client?.last_name || ''} registró un pago de ${amountText}. Recibo ${newPayment.receipt_number || '-'}.`,
          type: 'client_payment_registered',
          status: 'unread',
          related_entity_type: 'payment',
          related_entity_id: newPayment.id,
          action_url: actionUrl,
          meta_json: { loan_id: loanId, schedule_id: scheduleId },
        })
      }

      rows.push({
        recipient_role: 'admin',
        recipient_email: null,
        title: 'Pago registrado',
        body: `Se registró un pago ${newPayment.receipt_number || '-'} por ${amountText}. Pendiente de revisión/confirmación.`,
        type: 'payment_created',
        status: 'unread',
        related_entity_type: 'payment',
        related_entity_id: newPayment.id,
        action_url: actionUrl,
        meta_json: { loan_id: loanId, schedule_id: scheduleId },
      })

      await serviceSupabase.from('notifications').insert(rows)
    } catch (e) {
      console.error('[IN-APP NOTIFS] Failed to insert notifications on payment create:', e)
    }

    return NextResponse.json(transformedPayment)
  } catch (error) {
    console.error("[v0] Error creating payment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
