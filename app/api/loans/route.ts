import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified, computeETag, formatHttpDate } from '@/lib/http-cache'

// Function to generate a unique loan number
async function generateSequentialLoanNumber() {
  const admin = await createAdminClient()
  const { count } = await admin.from('loans').select('id', { count: 'exact', head: true })
  const next = (count ?? 0) + 1
  return String(next)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const loanData = await request.json()

  // Ensure all required fields are present
  const requiredFields = [
    'clientId',
    'amount',
    'termMonths',
    'startDate',
    'status',
    'monthlyPayment',
    'endDate',
  ]
  for (const field of requiredFields) {
    if (!loanData[field]) {
      return NextResponse.json(
        { message: `Error: Missing required field: ${field}` },
        { status: 400 },
      )
    }
  }

  const loanNumber = await generateSequentialLoanNumber()

  const totalAmountNum = parseFloat(loanData.amount)
  const termNum = parseInt(loanData.termMonths, 10)
  const rateMonthly = loanData.interestRate ? parseFloat(loanData.interestRate) : 0
  const aporteAdmin = 20
  const frequency: 'mensual' | 'quincenal' = (loanData.frequency === 'quincenal') ? 'quincenal' : 'mensual'
  const capitalMes = termNum > 0 ? (totalAmountNum / termNum) : 0
  const interesMes = totalAmountNum * (rateMonthly / 100)
  const installmentTotal = frequency === 'quincenal'
    ? capitalMes + (interesMes / 2) + aporteAdmin
    : capitalMes + interesMes + aporteAdmin

  const { data: newLoan, error } = await supabase.from('loans').insert([
    {
      client_id: loanData.clientId,
      loan_number: loanNumber,
      payment_frequency: frequency,
      amount: totalAmountNum,
      interest_rate: rateMonthly,
      term_months: termNum,
      start_date: loanData.startDate,
      end_date: loanData.endDate,
      monthly_payment: Math.round(installmentTotal * 100) / 100,
      status: loanData.status,
    },
  ]).select().single()

  if (error) {
    console.error('Error creating loan:', error)
    return NextResponse.json(
      { message: error.message, code: error.code, details: error.details, hint: error.hint },
      { status: 500 },
    )
  }

  // Create payment schedule (Nueva lógica: capital fijo, interés mensual fijo, gastos administrativos por cuota)
  const scheduleEntries = []
  const n = parseInt(loanData.termMonths, 10)
  const totalAmount = parseFloat(loanData.amount)
  const monthlyRate = (parseFloat(loanData.interestRate) || 0) / 100 // interés mensual
  const adminFeesPerInstallment = 20 // Q 20 por cuota

  const round2 = (num: number) => Math.round(num * 100) / 100
  const capitalPerMonth = round2(totalAmount / n)
  const interestPerMonth = round2(totalAmount * monthlyRate)

  const parseYMD = (ymd: string) => {
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(ymd))
    if (!m) return new Date(ymd)
    const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3])
    return new Date(Date.UTC(y, mo, d, 12, 0, 0))
  }
  const formatGTYMD = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(date)
  const addMonths = (ymd: string, months: number) => {
    const dt = parseYMD(ymd)
    const copy = new Date(dt.getTime())
    copy.setUTCMonth(copy.getUTCMonth() + months)
    return formatGTYMD(copy)
  }
  const addDays = (ymd: string, days: number) => {
    const dt = parseYMD(ymd)
    const copy = new Date(dt.getTime())
    copy.setUTCDate(copy.getUTCDate() + days)
    return formatGTYMD(copy)
  }

  if (frequency === 'mensual') {
    for (let i = 0; i < n; i++) {
      const dueYmd = addMonths(loanData.startDate, i + 1)
      const monthlyTotal = round2(capitalPerMonth + interestPerMonth + adminFeesPerInstallment)
      scheduleEntries.push({
        loan_id: newLoan.id,
        payment_number: i + 1,
        due_date: dueYmd,
        amount: monthlyTotal,
        principal: capitalPerMonth,
        interest: interestPerMonth,
        admin_fees: adminFeesPerInstallment,
        status: "pending",
      })
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dueYmd = addDays(loanData.startDate, (i + 1) * 15)
      const total = round2(capitalPerMonth + (interestPerMonth / 2) + adminFeesPerInstallment)
      scheduleEntries.push({
        loan_id: newLoan.id,
        payment_number: i + 1,
        due_date: dueYmd,
        amount: total,
        principal: capitalPerMonth,
        interest: round2(interestPerMonth / 2),
        admin_fees: adminFeesPerInstallment,
        status: "pending",
      })
    }
  }

  const { data: insertedSchedule, error: scheduleError } = await supabase
    .from("payment_schedule")
    .insert(scheduleEntries)
    .select("id")

  if (scheduleError) {
    console.error("[v0] Error creating payment schedule:", scheduleError)
  } else if (insertedSchedule && insertedSchedule.length > 0) {
    // Group logs: Delete individual logs created by trigger and insert a summary log
    try {
      const admin = await createAdminClient()
      const scheduleIds = insertedSchedule.map((s) => s.id)
      
      // Delete individual logs
      await admin
        .from("logs")
        .delete()
        .eq("entity_name", "payment_schedule")
        .in("entity_id", scheduleIds)
        .eq("action_type", "CREATE")

      // Get current user for the log
      const { data: { user } } = await supabase.auth.getUser()
      let actorId = null
      if (user) {
        const { data: userData } = await admin.from("users").select("id").eq("auth_id", user.id).single()
        actorId = userData?.id
      }

      // Insert summary log
      await admin.from("logs").insert({
        actor_user_id: actorId,
        action_type: "CREATE",
        entity_name: "payment_schedule",
        entity_id: newLoan.id, // Link to loan ID as the entity
        action_at: new Date().toISOString(),
        details: {
          message: `Creó el plan de pagos para el préstamo ${newLoan.loan_number} (${scheduleEntries.length} cuotas)`,
          loan_id: newLoan.id,
          loan_number: newLoan.loan_number,
          count: scheduleEntries.length,
          schedule_ids: scheduleIds // Keep track of created IDs if needed
        }
      })
    } catch (logError) {
      console.error("Error grouping payment schedule logs:", logError)
    }
  }

  return NextResponse.json({ message: 'Loan created successfully', data: newLoan }, { status: 201 })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user data to check role
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("auth_id", user.id)
      .maybeSingle()

    if (userError || !userData) {
      console.error("User not found for auth_id:", user.id, userError)
      return NextResponse.json({ error: `User not found. Details: ${userError?.message}` }, { status: 404 })
    }

    // Create a base query
    let query = supabase.from('loans').select(`
      *,
      client:clients (
        id,
        first_name,
        last_name,
        email
      )
    `)

    if (id) {
      query = query.eq('id', id)
    }

    // Apply filters based on user role
    if (userData.role === "cliente") {
      // Find the client ID based on the user's email
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("email", userData.email)
        .maybeSingle()

      if (clientError || !clientData) {
        console.error(
          "Error fetching client for user email:",
          userData.email,
          "Error:",
          clientError
        )
        return NextResponse.json(
          { error: `Client not found for email ${userData.email}` },
          { status: 404 }
        )
      }
      query = query.eq("client_id", clientData.id)
    } else if (userData.role === "asesor") {
      const { data: advisorClients, error: advisorError } = await supabase
        .from("clients")
        .select("id")
        .eq("advisor_id", userData.id)

      if (advisorError) {
        return NextResponse.json({ error: "Failed to fetch advisor clients" }, { status: 500 })
      }
      const clientIds = advisorClients.map(c => c.id)
      query = query.in("client_id", clientIds)
    }

    // Add ID filter if a specific loan is requested
    if (id) {
      query = query.eq("id", id)
    }

    // Execute the query
    const { data, error } = await (id ? query.maybeSingle() : query)


    if (error) {
      console.error('Error fetching loans:', error)
      return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 })
    }

    if (id && !data) {
      return NextResponse.json({ error: 'Loan not found or access denied' }, { status: 404 })
    }

    const transformLoan = (loan: any) => {
      if (!loan) return null
      const firstRow = Array.isArray((loan as any).schedule) && (loan as any).schedule.length ? (loan as any).schedule[0] : null
      const fallbackMonthly = firstRow ? (
        Number(firstRow.principal || 0) + Number(firstRow.interest || 0) + Number(firstRow.admin_fees || 0)
      ) : undefined
      const calcMonthly = (() => {
        const amt = Number(loan.amount || 0)
        const months = Number(loan.term_months || 0)
        const rate = Number(loan.interest_rate || 0) / 100
        const aporte = 20
        const capitalMes = months > 0 ? (amt / months) : 0
        const interesMes = amt * rate
        return Math.round((capitalMes + interesMes + aporte) * 100) / 100
      })()
      const displayInstallment = (loan.monthly_payment != null)
        ? Number(loan.monthly_payment)
        : (fallbackMonthly !== undefined ? Number(fallbackMonthly) : calcMonthly)
      const transformed = {
        id: loan.id,
        clientId: loan.client_id,
        loanNumber: loan.loan_number,
        paymentFrequency: (loan as any).payment_frequency,
        amount: Number(loan.amount),
        interestRate: Number(loan.interest_rate),
        termMonths: loan.term_months,
        monthlyPayment: displayInstallment,
        status: loan.status,
        startDate: loan.start_date,
        endDate: loan.end_date,
        createdAt: loan.created_at,
        updatedAt: loan.updated_at,
        client: loan.client
          ? {
              id: loan.client.id,
              firstName: loan.client.first_name,
              lastName: loan.client.last_name,
              email: loan.client.email,
            }
          : null,
        schedule: (loan as any).schedule,
      }
      const progressPaid = Array.isArray((loan as any).schedule) ? (loan as any).schedule.filter((s: any) => s.status === 'paid').length : undefined
      const progressTotal = Array.isArray((loan as any).schedule) ? (loan as any).schedule.length : undefined
      if (progressPaid != null && progressTotal != null) {
        return { ...transformed, progressPaid, progressTotal, hasOverdue: (loan as any).schedule.some((s: any) => s.status !== 'paid' && new Date(s.due_date) < new Date()) }
      }
      return transformed
    }

    // For a single loan, fetch its schedule and transform
    if (id && data) {
      const { data: schedule, error: scheduleError } = await supabase
        .from('payment_schedule')
        .select('*')
        .eq('loan_id', id)
        .order('payment_number', { ascending: true })

      if (scheduleError) {
        console.error('[v0] Error fetching schedule:', scheduleError)
      }

      // Attach schedule to the loan data
      ;(data as any).schedule = schedule || []
      const responseData = transformLoan(data)
      return NextResponse.json(responseData, { headers: { 'Cache-Control': 'no-store' } })
    }

    // For multiple loans, enrich with schedule aggregates
    if (Array.isArray(data)) {
      const loanIds = (data || []).map((l: any) => l.id).filter(Boolean)
      let aggregates: Record<string, { total: number; paid: number; hasOverdue: boolean }> = {}
      if (loanIds.length) {
        const { data: scheduleRows } = await supabase
          .from('payment_schedule')
          .select('loan_id, status, due_date')
          .in('loan_id', loanIds)
        const byLoan: Record<string, any[]> = {}
        for (const s of (scheduleRows || [])) {
          const k = String((s as any).loan_id)
          ;(byLoan[k] ||= []).push(s)
        }
        const today = new Date()
        const gtTodayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(today)
        const parseYMD = (ymd: string) => {
          const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(ymd))
          if (!m) return new Date(ymd)
          const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3])
          return new Date(Date.UTC(y, mo, d, 12, 0, 0))
        }
        const todayDate = parseYMD(gtTodayYMD)
        for (const id of loanIds) {
          const rows = byLoan[String(id)] || []
          const total = rows.length
          const paid = rows.filter(r => r.status === 'paid').length
          const hasOverdue = rows.some(r => r.status !== 'paid' && parseYMD(String(r.due_date)) < todayDate)
          aggregates[String(id)] = { total, paid, hasOverdue }
        }
      }
      const responseData = (data || []).map((loan: any) => {
        const t = transformLoan(loan)
        const agg = aggregates[String(loan.id)] || { total: 0, paid: 0, hasOverdue: false }
        return { ...t, progressPaid: agg.paid, progressTotal: agg.total, hasOverdue: agg.hasOverdue }
      })
      return NextResponse.json(responseData, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Fallback for any other case
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error("[v0] Error in loans API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: "Loan ID is required" }, { status: 400 })
    }

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { interestRate, status, frequency, startDate } = body
    const updates: any = { ...body }
    delete updates.frequency
    delete updates.startDate

    // Recalcular monto por cuota
    const totalAmountNum = updates.amount != null ? parseFloat(updates.amount) : undefined
    const termNum = updates.term_months != null ? parseInt(updates.term_months, 10) : undefined
    const rateMonthly = (interestRate != null ? parseFloat(interestRate) : undefined)
    const aporteAdmin = 20

    // Obtener valores actuales si faltan
    const { data: currentLoan } = await supabase
      .from('loans')
      .select('amount, term_months, interest_rate, start_date')
      .eq('id', id)
      .single()

    const amt = totalAmountNum ?? Number(currentLoan?.amount || 0)
    const months = termNum ?? Number(currentLoan?.term_months || 0)
    const rate = rateMonthly != null ? rateMonthly : Number(currentLoan?.interest_rate || 0)
    const capitalMes = months > 0 ? (amt / months) : 0
    const interesMes = amt * (rate / 100)
    const freq: 'mensual' | 'quincenal' = (frequency === 'quincenal') ? 'quincenal' : 'mensual'
    const installmentTotal = freq === 'quincenal' ? (capitalMes + (interesMes / 2) + aporteAdmin) : (capitalMes + interesMes + aporteAdmin)

    const { data: updatedLoan, error: updateError } = await supabase
      .from("loans")
      .update({
        ...updates,
        interest_rate: interestRate != null ? Number.parseFloat(interestRate) : undefined,
        monthly_payment: Math.round(installmentTotal * 100) / 100,
        payment_frequency: frequency,
        start_date: startDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[v0] Error updating loan:", updateError)
      return NextResponse.json({ error: "Failed to update loan" }, { status: 500 })
    }

    const transformedLoan = {
      id: updatedLoan.id,
      clientId: updatedLoan.client_id,
      loanNumber: updatedLoan.loan_number,
      amount: Number(updatedLoan.amount),
      interestRate: Number(updatedLoan.interest_rate),
      termMonths: updatedLoan.term_months,
      monthlyPayment: Number(updatedLoan.monthly_payment),
      status: updatedLoan.status,
      startDate: updatedLoan.start_date,
      endDate: updatedLoan.end_date,
      createdAt: updatedLoan.created_at,
      updatedAt: updatedLoan.updated_at,
    }

    // Removed automatic schedule regeneration as requested.
    // User must manually regenerate the schedule from the UI.

    return NextResponse.json(transformedLoan)
  } catch (error) {
    console.error("[v0] Error in loan update API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
