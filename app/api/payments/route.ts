import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache"

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
  const { 
    paymentScheduleId, 
    amount, 
    paymentDate, 
    paymentMethod, 
    notes, 
    status = "pagado",
    confirmationStatus = "pendiente",
    receiptImageUrl = null,
    has_been_edited,
    isFull,
    fullScheduleIds
  } = data

    // Validate required fields
    if (!paymentScheduleId || !amount || !paymentDate || !paymentMethod) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Get payment schedule info to get loan_id and current payment data

    // Get payment schedule info to get loan_id and current payment data
  const { data: scheduleData, error: scheduleError } = await supabase
    .from("payment_schedule")
    .select("loan_id, amount, paid_amount, mora, admin_fees, status")
    .eq("id", paymentScheduleId)
    .single()

    if (scheduleError || !scheduleData) {
      return NextResponse.json({ error: "Payment schedule not found" }, { status: 404 })
    }

    // Calculate amounts with proper rounding
  const newPaymentAmount = Math.round(Number(amount) * 100) / 100
  const currentPaidAmount = Math.round((Number(scheduleData.paid_amount) || 0) * 100) / 100
  const totalPaidAmount = Math.round((currentPaidAmount + newPaymentAmount) * 100) / 100
  const scheduledAmount = Math.round((Number(scheduleData.amount) + (Number(scheduleData.mora) || 0) + (Number(scheduleData.admin_fees) || 0)) * 100) / 100

    // Only validate that payment amount is positive and not excessively large
    if (!Number.isFinite(newPaymentAmount) || newPaymentAmount <= 0) {
      return NextResponse.json({ 
        error: "El monto del pago debe ser mayor a 0" 
      }, { status: 400 })
    }

    // Allow overpayment but warn if it's significantly more than the scheduled amount
    if (!isFull) {
      if (totalPaidAmount > scheduledAmount * 1.5) {
        return NextResponse.json({ 
          error: `El monto del pago parece excesivo. Monto programado: ${scheduledAmount}, Total a pagar: ${totalPaidAmount}` 
        }, { status: 400 })
      }
    }

    const { count } = await supabase.from("payments").select("*", { count: "exact", head: true })
    const receiptPrefix = `REC-${String((count || 0) + 1).padStart(6, "0")}`
    const randomSegment = Math.random().toString(36).slice(2, 8).toUpperCase()
    let receiptNumber = `${receiptPrefix}-${randomSegment}`

    // Insert payment
  // A payment row stores this transaction's amount, not the schedule's
  // cumulative paid amount. The cumulative figure is updated only after approval.
  const insertAmount = newPaymentAmount
  if (isFull && Array.isArray(fullScheduleIds) && fullScheduleIds.length > 0) {
    const ids = Array.from(new Set(fullScheduleIds))
    if (ids.length !== fullScheduleIds.length || !ids.includes(paymentScheduleId)) {
      return NextResponse.json({ error: "Las cuotas del pago completo no son válidas" }, { status: 400 })
    }
    try {
      const notesText = String(notes || "")
      if (!notesText.startsWith("[FULL_PAYMENT]")) throw new Error("Missing full payment marker")
      const metadata = JSON.parse(notesText.slice(notesText.indexOf("{"), notesText.indexOf("}") + 1))
      if (!Array.isArray(metadata.scheduleIds) ||
        metadata.scheduleIds.length !== ids.length ||
        !ids.every((id) => metadata.scheduleIds.includes(id))) {
        throw new Error("Mismatched full payment schedules")
      }
    } catch {
      return NextResponse.json({ error: "Los datos del pago completo no son válidos" }, { status: 400 })
    }
    const admin = await createAdminClient()
    const { data: targets, error: targetsError } = await admin
      .from("payment_schedule")
      .select("id, amount, principal, interest, mora, admin_fees, waived_amount, paid_amount, loan_id, status")
      .in("id", ids)
      .eq("loan_id", scheduleData.loan_id)
    if (targetsError || targets?.length !== ids.length) {
      return NextResponse.json({ error: "Las cuotas del pago completo no pertenecen al préstamo" }, { status: 400 })
    }
    const sum = (targets || []).reduce((acc: number, s: any) => {
      const base = s.principal != null || s.interest != null
        ? Number(s.principal || 0) + Number(s.interest || 0)
        : Number(s.amount || 0)
      const schedAmt = Math.round((base + Number(s.mora || 0) + Number(s.admin_fees || 0) - Number(s.waived_amount || 0)) * 100) / 100
      const paid = Math.round((Number(s.paid_amount || 0)) * 100) / 100
      const remaining = Math.max(0, schedAmt - paid)
      return acc + remaining
    }, 0)
    if (Math.abs(insertAmount - Math.round(sum * 100) / 100) > 1) {
      return NextResponse.json({ error: "El monto no coincide con el saldo pendiente del préstamo" }, { status: 400 })
    }
  } else if (isFull) {
    return NextResponse.json({ error: "El pago completo requiere cuotas válidas" }, { status: 400 })
  } else if (String(notes || "").startsWith("[FULL_PAYMENT]")) {
    return NextResponse.json({ error: "El pago completo requiere cuotas válidas" }, { status: 400 })
  }

  let newPayment: any = null
  let paymentError: any = null
  {
    let attempts = 0
    while (attempts < 3) {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          loan_id: scheduleData.loan_id,
          schedule_id: paymentScheduleId,
          amount: insertAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes: notes,
          receipt_number: receiptNumber,
          confirmation_status: "pending_confirmation",
          has_been_edited: has_been_edited ? true : false,
        })
        .select()
        .single()
      if (error && (error as any)?.code === '23505') {
        const altSegment = Math.random().toString(36).slice(2, 8).toUpperCase()
        receiptNumber = `${receiptPrefix}-${altSegment}`
        attempts++
        continue
      }
      newPayment = data
      paymentError = error
      break
    }
  }

    if (paymentError) {
      console.error("Error creating payment:", paymentError)
      return NextResponse.json({ error: "Error al crear el pago" }, { status: 500 })
    }

    const admin = createAdminClient()
    const targetIds = isFull ? fullScheduleIds : [paymentScheduleId]
    const { error: scheduleUpdateError } = await admin
      .from("payment_schedule")
      .update({ status: "pending_confirmation" })
      .in("id", targetIds)
      .eq("loan_id", scheduleData.loan_id)
    if (scheduleUpdateError) {
      console.error("Error updating schedules for new payment:", scheduleUpdateError)
      await admin.from("payments").delete().eq("id", newPayment.id)
      return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 })
    }

    await admin.from("logs").insert({
      actor_user_id: user.id,
      action_type: "CREATE",
      entity_name: "payment",
      entity_id: newPayment.id,
      action_at: new Date().toISOString(),
      details: {
        message: `Se creó un nuevo pago con recibo ${newPayment.receipt_number} para el préstamo ${scheduleData.loan_id}`,
        payment_id: newPayment.id,
        loan_id: scheduleData.loan_id,
        receipt_number: newPayment.receipt_number,
        amount: newPayment.amount,
      },
    })

    return NextResponse.json(newPayment)
  } catch (error) {
    console.error("Error in POST /api/payments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: Request) {
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

    // Get user role and email
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const loanId = searchParams.get("loanId")

    let query = supabase
      .from("payments")
      .select(`
        *,
        loan:loans!payments_loan_id_fkey (
          loan_number,
          client:clients!loans_client_id_fkey (
            first_name,
            last_name,
            email
          )
        )
      `)
      .order("created_at", { ascending: false })

    // Apply role-based filtering via RLS policies; only loanId filter is needed
    // Client and advisor visibility is enforced at the database level
    // Admins can see all payments (no additional filtering)

    if (loanId) {
      query = query.eq("loan_id", loanId)
    }

    const { data: payments, error: paymentsError } = await query

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError)
      return NextResponse.json({ 
        error: "Failed to fetch payments", 
        details: (paymentsError as any)?.message || String(paymentsError),
        hint: (paymentsError as any)?.hint,
        code: (paymentsError as any)?.code
      }, { status: 500 })
    }

    // Transform payments
    const transformedPayments = payments?.map(payment => ({
      id: payment.id,
      loanId: payment.loan_id,
      scheduleId: payment.schedule_id,
      amount: Number(payment.amount),
      paymentDate: payment.payment_date,
      receiptNumber: payment.receipt_number,
      paymentMethod: payment.payment_method,
      notes: payment.notes,
      confirmationStatus: payment.confirmation_status,
      receiptImageUrl: payment.receipt_image_url,
      confirmedBy: payment.confirmed_by,
      confirmedAt: payment.confirmed_at,
      rejectionReason: payment.rejection_reason,
      hasBeenEdited: Boolean(payment.has_been_edited),
      createdAt: payment.created_at,
      loan: payment.loan ? {
        loanNumber: payment.loan.loan_number,
        client: payment.loan.client ? {
          firstName: payment.loan.client.first_name,
          lastName: payment.loan.client.last_name,
        } : null
      } : null
    })) || []

    const responseData = transformedPayments
    const body = stableJsonStringify(responseData)
    const headers = buildCacheHeaders({
      body,
      lastModified: latestUpdatedAt(responseData) ?? new Date(),
      cacheControl: 'private, max-age=0, must-revalidate',
    })
    const etag = headers['ETag']
    const lastMod = headers['Last-Modified']
    if (isNotModified(request, { etag, lastModified: lastMod })) {
      return new NextResponse(null, { status: 304, headers })
    }
    return NextResponse.json(responseData, { headers })
  } catch (error) {
    console.error("Error fetching payments:", error)
    return NextResponse.json({ 
      error: "Internal server error",
      details: (error as any)?.message || String(error)
    }, { status: 500 })
  }
}
