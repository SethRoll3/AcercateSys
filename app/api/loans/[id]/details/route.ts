import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const debug = process.env.NEXT_PUBLIC_LOG_DEBUG === 'true'
    const supabase = await createClient()
    const { id } = await params

    if (debug) console.log("[DEBUG] Loan ID requested:", id)

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      if (debug) console.log("[DEBUG] Auth error:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (debug) console.log("[DEBUG] Authenticated user:", user.id, user.email)

    // Get user data to check role
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("auth_id", user.id)
      .single()

    if (userError || !userData) {
      if (debug) console.log("[DEBUG] User data error:", userError)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (debug) console.log("[DEBUG] User data:", userData)

    // Create service role client to bypass RLS (same as working loans endpoint)
    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch loan with client details with role-based filtering
    let loanQuery = serviceSupabase
      .from("loans")
      .select(`
        *,
        client:clients (*)
      `)
      .eq("id", id)

    if (debug) console.log("[DEBUG] Initial loan query for ID:", id)

    // Apply role-based filtering
    if (userData.role === 'cliente') {
      const { data: clientData, error: clientError } = await serviceSupabase
        .from("clients")
        .select("id")
        .eq("email", userData.email)
        .maybeSingle()

      if (clientError || !clientData) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }

      let allowByGroup = false
      const { data: groups } = await serviceSupabase
        .from("grupos")
        .select("id")
        .contains("clientes_ids", [clientData.id])

      const groupIds = (groups || []).map((g: any) => g.id)

      if (groupIds.length > 0) {
        const { data: lgRows } = await serviceSupabase
          .from("loans_groups")
          .select("loans, group_id")
          .in("group_id", groupIds)

        allowByGroup = (lgRows || []).some((row: any) => (row.loans || []).some((entry: any) => entry.loan_id === id))
      }

      if (!allowByGroup) {
        loanQuery = loanQuery.eq("client_id", clientData.id)
      }
    } else if (userData.role === 'asesor') {
      if (debug) console.log("[DEBUG] User is an advisor, applying advisor filter")
      // Advisor can see loans of their assigned clients
      const { data: advisorClients, error: advisorError } = await serviceSupabase
        .from("clients")
        .select("id")
        .eq("advisor_id", userData.id)

      if (advisorError) {
        if (debug) console.error("[DEBUG] Error fetching advisor clients:", advisorError)
        return NextResponse.json({ error: "Failed to fetch advisor clients" }, { status: 500 })
      }
      if (debug) console.log("[DEBUG] Advisor clients found:", advisorClients)
      const clientIds = advisorClients.map(client => client.id)
      if (debug) console.log("[DEBUG] Filtering loans by client IDs:", clientIds)
      loanQuery = loanQuery.in("client_id", clientIds)
    } else {
      if (debug) console.log("[DEBUG] User is admin, no additional filtering applied")
    }
    // Admin can see all loans (no additional filtering)

    if (debug) console.log("[DEBUG] Executing final loan query...")
    
    const { data: loan, error: loanError } = await loanQuery.maybeSingle()

    if (debug) console.log("[DEBUG] Loan query result:", { loan: loan ? "found" : "not found", loanError })

    if (loanError || !loan) {
      if (debug) console.log("[DEBUG] Loan not found. Error:", loanError)
      return NextResponse.json({ error: "Loan not found or access denied" }, { status: 404 })
    }

    if (debug) console.log("[DEBUG] Loan found successfully:", loan.id)

    // Fetch payment schedule and history in parallel
    const [scheduleResponse, paymentsResponse] = await Promise.all([
      serviceSupabase
        .from("payment_schedule")
        .select("*")
        .eq("loan_id", id)
        .order("payment_number", { ascending: true }),
      serviceSupabase
        .from("payments")
        .select("*")
        .eq("loan_id", id)
        
        .order("created_at", { ascending: false })
    ]);

    const { data: schedule, error: scheduleError } = scheduleResponse;
    const { data: payments, error: paymentsError } = paymentsResponse;

    if (scheduleError && debug) {
      console.error("[v0] Error fetching schedule:", scheduleError)
    }

    if (paymentsError && debug) {
      console.error("[v0] Error fetching payments:", paymentsError)
    }

    // Collect schedule IDs from payments to fetch boletas
    const scheduleIds = Array.from(new Set((payments || []).map((p: any) => p.schedule_id).filter(Boolean)))

    // Fetch boletas linked to payment schedules
    let boletasBySchedule: Record<string, any[]> = {}
    if (scheduleIds.length > 0) {
      const { data: cuotaBoletas, error: cuotaBoletasError } = await serviceSupabase
        .from("cuota_boletas")
        .select(`
          id,
          payment_schedule_id,
          boleta_id,
          created_at,
          boletas (
            id,
            numero_boleta,
            forma_pago,
            fecha,
            referencia,
            banco,
            monto,
            observaciones,
            created_at,
            created_by,
            image_url
          )
        `)
        .in("payment_schedule_id", scheduleIds)
        .order("created_at", { ascending: false })

      if (cuotaBoletasError && debug) {
        console.error("[v0] Error fetching cuota_boletas:", cuotaBoletasError)
      } else {
        boletasBySchedule = (cuotaBoletas || []).reduce((acc: Record<string, any[]>, cb: any) => {
          const sid = cb.payment_schedule_id
          const boleta = cb.boletas
          if (!acc[sid]) acc[sid] = []
          if (boleta) {
            acc[sid].push({
              id: boleta.id,
              numeroBoleta: boleta.numero_boleta,
              formaPago: boleta.forma_pago,
              fecha: boleta.fecha,
              referencia: boleta.referencia,
              banco: boleta.banco,
              monto: Number.parseFloat(boleta.monto),
              observaciones: boleta.observaciones,
              createdAt: boleta.created_at,
              createdBy: boleta.created_by,
              imageUrl: boleta.image_url,
            })
          }
          return acc
        }, {})
      }
    }

    // Transform payments to frontend shape and attach boletas
    const transformedPayments = (payments || []).map((p: any) => ({
      id: p.id,
      loanId: p.loan_id,
      scheduleId: p.schedule_id,
      amount: Number(p.amount),
      paymentDate: p.payment_date,
      receiptNumber: p.receipt_number,
      paymentMethod: p.payment_method,
      notes: p.notes,
      confirmationStatus: p.confirmation_status,
      receiptImageUrl: p.receipt_image_url,
      confirmedBy: p.confirmed_by,
      confirmedAt: p.confirmed_at,
      rejectionReason: p.rejection_reason,
      hasBeenEdited: Boolean(p.has_been_edited),
      createdAt: p.created_at,
      boletas: boletasBySchedule[p.schedule_id] || [],
    }))

    // Calculate total paid and remaining balance using ONLY approved payments
    const totalPaid = transformedPayments
      .filter((payment: any) => payment.confirmationStatus === 'aprobado')
      .reduce((sum: number, payment: any) => sum + Number(payment.amount), 0)
    const remainingBalance = Math.max(Number(loan.amount) - totalPaid, 0)

    const firstRow = Array.isArray(schedule) && schedule.length ? schedule[0] : null
    const monthlyFromSchedule = firstRow ? (
      Number(firstRow.amount ?? 0) || (Number(firstRow.principal || 0) + Number(firstRow.interest || 0) + Number(firstRow.admin_fees || 0))
    ) : undefined
    let groupName: string | null = null
    try {
      const gid = (loan.client as any)?.group_id
      if (gid) {
        const { data: grp } = await serviceSupabase
          .from('grupos')
          .select('id, nombre')
          .eq('id', gid)
          .single()
        groupName = grp?.nombre ?? null
      }
    } catch {}

    const transformedLoan = {
      id: loan.id,
      clientId: loan.client_id,
      loanNumber: loan.loan_number,
      amount: Number(loan.amount),
      interestRate: Number(loan.interest_rate),
      termMonths: loan.term_months,
      monthlyPayment: monthlyFromSchedule !== undefined ? Number(monthlyFromSchedule) : Number(loan.monthly_payment),
      status: loan.status,
      startDate: loan.start_date,
      endDate: loan.end_date,
      createdAt: loan.created_at,
      updatedAt: loan.updated_at,
      client: {
        id: loan.client.id,
        email: loan.client.email,
        first_name: loan.client.first_name,
        last_name: loan.client.last_name,
        phone: loan.client.phone,
        phone_country_code: loan.client.phone_country_code,
        address: loan.client.address,
        emergency_phone: loan.client.emergency_phone,
        group_id: (loan.client as any).group_id ?? null,
        group_name: groupName,
        created_at: loan.client.created_at,
        updated_at: loan.client.updated_at,
        firstName: loan.client.first_name,
        lastName: loan.client.last_name,
      }
    }

    return NextResponse.json({
      loan: transformedLoan,
      schedule: schedule || [],
      payments: transformedPayments,
      totalPaid,
      remainingBalance
    })
  } catch (error) {
    console.error("[v0] Error in loan details API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
