import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminSupabase = await createAdminClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: me, error: meError } = await adminSupabase.from("users").select("id, role").eq("auth_id", user.id).single()
    if (meError || !me) {
      return NextResponse.json({ error: meError?.message || "User not found" }, { status: 404 })
    }
    if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { data: loan, error: loanError } = await adminSupabase.from("loans").select("*").eq("id", id).single()
    if (loanError || !loan) {
      return NextResponse.json({ error: loanError?.message || "Loan not found" }, { status: 404 })
    }
    if (loan.status === "active") return NextResponse.json({ status: "active", message: "Loan already active" })

    const { data: schedule, error: scheduleError } = await adminSupabase.from("payment_schedule").select("id").eq("loan_id", id)
    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 })
    if (!schedule || schedule.length === 0) return NextResponse.json({ error: "Loan has no payment schedule" }, { status: 409 })

    const { data: approvalsRaw, error: approvalsError } = await adminSupabase
      .from("logs")
      .select("actor_user_id")
      .eq("entity_name", "loan_activation")
      .eq("entity_id", id)

    if (approvalsError) {
      return NextResponse.json({ error: approvalsError.message }, { status: 500 })
    }

    const approvalsSet = new Set(
      (approvalsRaw || []).map((r: any) => r.actor_user_id).filter(Boolean)
    )

    if (approvalsSet.has(me.id)) {
      return NextResponse.json({
        status: "pending",
        message: "Ya confirmaste esta activación",
        approvals: { count: approvalsSet.size, required: 2, approvedByIds: Array.from(approvalsSet) },
      }, { status: 409 })
    }

    const { error: insertError } = await adminSupabase.from("logs").insert({
      actor_user_id: me.id,
      action_type: "UPDATE",
      entity_name: "loan_activation",
      entity_id: id,
      action_at: new Date().toISOString(),
      details: {
        message: `Confirmó activación del préstamo ${loan.loan_number}`,
        loan_id: id,
        loan_number: loan.loan_number,
      },
    })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    approvalsSet.add(me.id)
    let updated: any = loan

    if (approvalsSet.size >= 2) {
      const { data: updatedRow, error: updateError } = await adminSupabase
        .from("loans")
        .update({ 
          status: "active", 
          updated_at: new Date().toISOString(), 
          activated_by_admin_id: me.id, 
          activated_at: new Date().toISOString() 
        })
        .eq("id", id)
        .select("*")
        .single()

      if (updateError) {
        console.error("Error activating loan:", updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
      updated = updatedRow
    }
    
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
    return NextResponse.json({
      ...transformed,
      status: approvalsSet.size >= 2 ? "active" : "pending",
      approvals: { count: approvalsSet.size, required: 2, approvedByIds: Array.from(approvalsSet) },
    })
  } catch (e) {
    console.error("Activation error:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
