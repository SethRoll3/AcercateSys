import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: me, error: meError } = await supabase.from("users").select("id, role").eq("auth_id", user.id).single()
    if (meError || !me) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data: loan, error: loanError } = await supabase.from("loans").select("*").eq("id", id).single()
    if (loanError || !loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    if (loan.status === "active") return NextResponse.json({ message: "Loan already active" })

    const { data: schedule, error: scheduleError } = await supabase.from("payment_schedule").select("id").eq("loan_id", id)
    if (scheduleError) return NextResponse.json({ error: "Failed to verify schedule" }, { status: 500 })
    if (!schedule || schedule.length === 0) return NextResponse.json({ error: "Loan has no payment schedule" }, { status: 409 })

    const { data: updated, error: updateError } = await supabase
      .from("loans")
      .update({ status: "active", updated_at: new Date().toISOString(), activated_by_admin_id: me.id, activated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single()
    if (updateError) return NextResponse.json({ error: "Failed to activate loan" }, { status: 500 })
    const transformed = {
      id: updated.id,
      clientId: updated.client_id,
      loanNumber: updated.loan_number,
      amount: Number(updated.amount),
      interestRate: Number(updated.interest_rate),
      termMonths: updated.term_months,
      monthlyPayment: Number(updated.monthly_payment),
      status: updated.status,
      startDate: updated.start_date,
      endDate: updated.end_date,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    }
    return NextResponse.json(transformed)
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
