import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get role for current user
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("auth_id", user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (userData.role === "cliente") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    let { mora, adminFees } = body as { mora?: number; adminFees?: number }

    // Defaulting and sanitization
    const parsedMora = Math.round(Number(mora || 0) * 100) / 100
    const parsedAdminFees = Math.round(Number(adminFees ?? 20) * 100) / 100

    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Fetch existing principal/interest to recompute amount coherently
    const { data: currentRow } = await serviceSupabase
      .from("payment_schedule")
      .select("principal, interest")
      .eq("id", params.id)
      .single()

    const newAmount = Math.round(((Number(currentRow?.principal || 0) + Number(currentRow?.interest || 0) + parsedAdminFees)) * 100) / 100

    const { data: updated, error: updateError } = await serviceSupabase
      .from("payment_schedule")
      .update({ mora: parsedMora, admin_fees: parsedAdminFees, amount: newAmount })
      .eq("id", params.id)
      .select("*")
      .single()

    if (updateError) {
      console.error("[fees] Error updating schedule:", updateError)
      return NextResponse.json({ error: "Failed to update fees" }, { status: 500 })
    }

    return NextResponse.json({
      id: updated.id,
      loanId: updated.loan_id,
      paymentNumber: updated.payment_number,
      due_date: updated.due_date,
      amount: Number(updated.amount),
      principal: Number(updated.principal),
      interest: Number(updated.interest),
      mora: Number(updated.mora || 0),
      admin_fees: Number(updated.admin_fees || 0),
      status: updated.status,
      createdAt: updated.created_at,
    })
  } catch (error) {
    console.error("[fees] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}