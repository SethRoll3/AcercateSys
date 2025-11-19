import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified, computeETag, formatHttpDate } from '@/lib/http-cache'

// Function to generate a unique loan number
function generateLoanNumber() {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString().slice(2, 8)
  return `LP-${year}${month}${day}-${random}`
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

  const loanNumber = generateLoanNumber()

  const totalAmountNum = parseFloat(loanData.amount)
  const termNum = parseInt(loanData.termMonths, 10)
  const rateMonthly = loanData.interestRate ? parseFloat(loanData.interestRate) : 0
  const aporteAdmin = 20
  const monthlyTotal = (termNum > 0 ? (totalAmountNum / termNum) : 0) + (totalAmountNum * (rateMonthly / 100)) + aporteAdmin

  const { data: newLoan, error } = await supabase.from('loans').insert([
    {
      client_id: loanData.clientId,
      loan_number: loanNumber,
      amount: totalAmountNum,
      interest_rate: rateMonthly,
      term_months: termNum,
      start_date: loanData.startDate,
      end_date: loanData.endDate,
      monthly_payment: Math.round(monthlyTotal * 100) / 100,
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
  const adminFeesPerInstallment = 20 // Q 20 por defecto

  const round2 = (num: number) => Math.round(num * 100) / 100
  const capitalPerMonth = round2(totalAmount / n)
  const interestPerMonth = round2(totalAmount * monthlyRate)

  for (let i = 0; i < n; i++) {
    const dueDate = new Date(loanData.startDate)
    dueDate.setMonth(dueDate.getMonth() + i + 1)

    const monthlyTotal = round2(capitalPerMonth + interestPerMonth + adminFeesPerInstallment)

    scheduleEntries.push({
      loan_id: newLoan.id,
      payment_number: i + 1,
      due_date: dueDate.toISOString().split("T")[0],
      amount: monthlyTotal,
      principal: capitalPerMonth,
      interest: interestPerMonth,
      admin_fees: adminFeesPerInstallment,
      status: "pending",
    })
  }

  const { error: scheduleError } = await supabase.from("payment_schedule").insert(scheduleEntries)

  if (scheduleError) {
    console.error("[v0] Error creating payment schedule:", scheduleError)
    // Note: Decide if you want to roll back the loan creation here
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
      .single()

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

    // Apply filters based on user role
    if (userData.role === "cliente") {
      // Find the client ID based on the user's email
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("email", userData.email)
        .single()

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

      console.log(
        `Found client id: ${clientData.id} for email ${userData.email}. Filtering loans.`
      )
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
    const { data, error } = await (id ? query.single() : query)

    if (error) {
      console.error('[v0] Error fetching loans:', error)
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
      const transformed = {
        id: loan.id,
        clientId: loan.client_id,
        loanNumber: loan.loan_number,
        amount: Number(loan.amount),
        interestRate: Number(loan.interest_rate),
        termMonths: loan.term_months,
        monthlyPayment: fallbackMonthly !== undefined ? Number(fallbackMonthly) : calcMonthly,
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

    // For multiple loans, transform each
    if (Array.isArray(data)) {
      const responseData = data.map(transformLoan)
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

    const { interestRate, ...rest } = await request.json()



    // Update loan
    const { data: updatedLoan, error: updateError } = await supabase
      .from("loans")
      .update({
        ...rest,
        interest_rate: interestRate ? Number.parseFloat(interestRate) : undefined,
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

    return NextResponse.json(transformedLoan)
  } catch (error) {
    console.error("[v0] Error in loan update API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
