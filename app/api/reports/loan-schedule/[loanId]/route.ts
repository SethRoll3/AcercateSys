import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generatePaymentScheduleExcel } from "@/lib/excel-generator"
import { Loan, Client, PaymentSchedule, Payment } from "@/lib/types"
import { computeETag, formatHttpDate } from "@/lib/http-cache"

export async function GET(request: Request, { params }: { params: Promise<{ loanId: string }> }) {
  try {
    const supabase = await createClient()
    const { loanId } = await params

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch loan with client information
    const { data: loan, error: loanError } = await supabase
      .from("loans")
      .select(`
        *,
        client:clients (*)
      `)
      .eq("id", loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    // Fetch payment schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("payment_schedule")
      .select("*")
      .eq("loan_id", loanId)
      .order("payment_number", { ascending: true })

    if (scheduleError) {
      console.error("[v0] Error fetching schedule:", scheduleError)
    }

    // Fetch payments
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .eq("loan_id", loanId)
      .order("payment_date", { ascending: false })

    if (paymentsError) {
      console.error("[v0] Error fetching payments:", paymentsError)
    }

    // Transform data
    const transformedLoan = {
      id: loan.id,
      clientId: loan.client_id,
      loanNumber: loan.loan_number,
      amount: Number(loan.amount),
      interestRate: Number(loan.interest_rate),
      termMonths: loan.term_months,
      monthlyPayment: Number(loan.monthly_payment),
      status: loan.status,
      startDate: loan.start_date,
      endDate: loan.end_date,
      createdAt: loan.created_at,
      updatedAt: loan.updated_at,
      client: {
        id: loan.client.id,
        first_name: loan.client.first_name,
        last_name: loan.client.last_name,
        email: loan.client.email,
        phone: loan.client.phone,
        createdAt: loan.client.created_at,
        updatedAt: loan.client.updated_at,
      },
    }

    const transformedSchedule = (schedule || []).map((s) => ({
      id: s.id,
      loanId: s.loan_id,
      paymentNumber: s.payment_number,
      dueDate: s.due_date,
      amount: Number(s.amount),
      principal: Number(s.principal),
      interest: Number(s.interest),
      mora: Number(s.mora || 0),
      status: s.status,
      createdAt: s.created_at,
    }))

    const transformedPayments = (payments || []).map((p) => ({
      id: p.id,
      loanId: p.loan_id,
      scheduleId: p.schedule_id,
      amount: Number(p.amount),
      paymentDate: p.payment_date,
      receiptNumber: p.receipt_number,
      paymentMethod: p.payment_method,
      notes: p.notes,
      createdAt: p.created_at,
      confirmationStatus: p.confirmation_status || 'confirmado',
      receiptImageUrl: p.receipt_image_url || null,
      confirmedBy: p.confirmed_by || null,
      confirmedAt: p.confirmed_at || null,
      rejectionReason: p.rejection_reason || null,
    }))

    const csvContent = generatePaymentScheduleExcel(
      transformedLoan,
      transformedSchedule,
      transformedPayments,
    )

    const headers = new Headers()
    headers.append("Content-Type", "text/csv")
    headers.append("Content-Disposition", `attachment; filename="plan-pagos-${loan.loan_number}.csv"`)
    headers.append("ETag", computeETag(Buffer.from(csvContent), true))
    headers.append("Last-Modified", formatHttpDate(new Date()))
    headers.append("Cache-Control", "private, no-cache")
    return new NextResponse(new Uint8Array(csvContent), { headers })
  } catch (error) {
    console.error("[v0] Error generating schedule report:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
