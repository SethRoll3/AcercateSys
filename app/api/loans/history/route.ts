import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await supabase.from("users").select("id, role, email").eq("auth_id", user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    // Only non-clients can access this
    if (me.role === "cliente") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Fetch all loans with client info
    let query = admin
      .from("loans")
      .select(`
        id,
        loan_number,
        amount,
        interest_rate,
        term_months,
        monthly_payment,
        status,
        start_date,
        created_at,
        client:clients (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .order("created_at", { ascending: false })

    // Asesores only see loans for their assigned clients
    if (me.role === "asesor") {
      const { data: assignedClients } = await admin
        .from("clients")
        .select("id")
        .eq("advisor_id", me.id)
      const clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return NextResponse.json([])
      query = query.in("client_id", clientIds)
    }

    const { data: loans, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result = (loans || []).map((l: any) => {
      const clientRaw = Array.isArray(l.client) ? l.client[0] : l.client
      return {
        id: l.id,
        loanNumber: l.loan_number,
        amount: Number(l.amount || 0),
        interestRate: Number(l.interest_rate || 0),
        termMonths: l.term_months,
        monthlyPayment: Number(l.monthly_payment || 0),
        status: l.status,
        startDate: l.start_date,
        createdAt: l.created_at,
        client: {
          id: clientRaw?.id,
          firstName: clientRaw?.first_name || "",
          lastName: clientRaw?.last_name || "",
          email: clientRaw?.email || "",
          phone: clientRaw?.phone || "",
        },
      }
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[loans/history]", e)
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 })
  }
}
