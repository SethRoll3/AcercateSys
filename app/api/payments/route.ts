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
  const newPaymentAmount = Math.round(Number.parseFloat(amount) * 100) / 100
  const currentPaidAmount = Math.round((Number(scheduleData.paid_amount) || 0) * 100) / 100
  const totalPaidAmount = Math.round((currentPaidAmount + newPaymentAmount) * 100) / 100
  const scheduledAmount = Math.round((Number(scheduleData.amount) + (Number(scheduleData.mora) || 0) + (Number(scheduleData.admin_fees) || 0)) * 100) / 100

    // Only validate that payment amount is positive and not excessively large
    if (newPaymentAmount <= 0) {
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

    // Generate receipt number
    const { count } = await supabase.from("payments").select("*", { count: "exact", head: true })
    const receiptNumber = `REC-${String((count || 0) + 1).padStart(6, "0")}`

    // Insert payment
  let insertAmount = totalPaidAmount
  if (isFull && Array.isArray(fullScheduleIds) && fullScheduleIds.length > 0) {
    const admin = await createAdminClient()
    const { data: targets } = await admin
      .from("payment_schedule")
      .select("id, amount, mora, paid_amount, loan_id, status")
      .in("id", fullScheduleIds)
      .eq("loan_id", scheduleData.loan_id)
    const sum = (targets || []).reduce((acc: number, s: any) => {
      const schedAmt = Math.round((Number(s.amount || 0) + Number(s.mora || 0)) * 100) / 100
      const paid = Math.round((Number(s.paid_amount || 0)) * 100) / 100
      const remaining = Math.max(0, schedAmt - paid)
      return acc + remaining
    }, 0)
    insertAmount = Math.round(sum * 100) / 100
  }

  const { error: paymentError, data: newPayment } = await supabase
    .from("payments")
    .insert({
      loan_id: scheduleData.loan_id,
      schedule_id: paymentScheduleId,
      amount: insertAmount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      notes: notes,
      receipt_number: receiptNumber, // Incluir el número de recibo generado
      confirmation_status: "pending_confirmation",
      has_been_edited: has_been_edited ? true : false,
    })
    .select()
    .single()

    if (paymentError) {
      console.error("Error creating payment:", paymentError)
      return NextResponse.json({ error: "Error al crear el pago" }, { status: 500 })
    }

    // Insert log for payment creation
    const adminClient = await createAdminClient()
    await adminClient.from("logs").insert({
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

    // Actualizar el estado y el monto pagado en el cronograma de pagos
    // Requerimiento: SIEMPRE pasa a "pending_confirmation" al registrar el pago.
    const newStatus = "pending_confirmation"
    // Usar cliente admin para evitar bloqueos de RLS cuando el usuario es cliente
  const admin = await createAdminClient()
  if (isFull && Array.isArray(fullScheduleIds) && fullScheduleIds.length > 0) {
    const { data: targets } = await admin
      .from("payment_schedule")
      .select("id, amount, mora")
      .in("id", fullScheduleIds)
    const updates = (targets || []).map((t: any) => ({
      id: t.id,
      status: newStatus,
      paid_amount: Math.round((Number(t.amount || 0) + Number(t.mora || 0)) * 100) / 100,
    }))
    for (const up of updates) {
      await admin.from("payment_schedule").update({ status: up.status, paid_amount: up.paid_amount }).eq("id", up.id)
    }
  } else {
    const { error: scheduleUpdateError } = await admin
      .from("payment_schedule")
      .update({
        status: newStatus,
        paid_amount: totalPaidAmount,
      })
      .eq("id", paymentScheduleId)
    if (scheduleUpdateError) {
      console.error("Error updating schedule:", scheduleUpdateError)
    }
  }

  // No devolver el error si ocurre durante updates adicionales

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
