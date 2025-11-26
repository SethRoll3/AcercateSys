import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
      .select('role, email, id')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })
    }

    // Build payments query with role-based filtering
    let paymentsQuery = supabase
      .from("payments")
      .select(`
        *,
        loan:loans!payments_loan_id_fkey (
          id,
          client:clients!loans_client_id_fkey (
            email
          )
        )
      `)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .eq('confirmation_status', 'aprobado')
      .order("payment_date", { ascending: true })

    // Apply role-based filtering
    if (userData.role === 'cliente') {
      // Clients can only see payments for loans associated with their email
      paymentsQuery = paymentsQuery.eq('loan.client.email', userData.email)
    } else if (userData.role === 'asesor') {
      // Advisors can see payments for loans of their assigned clients
      const { data: assignedClients, error: clientsError } = await supabase
        .from('clients')
        .select('email')
        .eq('advisor_id', userData.id)

      if (clientsError) {
        return NextResponse.json({ error: "Error fetching assigned clients" }, { status: 500 })
      }

      const clientEmails = (assignedClients || []).map((client: any) => client.email).filter(Boolean)
      if (clientEmails.length > 0) {
        paymentsQuery = paymentsQuery.in('loan.client.email', clientEmails)
      } else {
        // If advisor has no assigned clients, return empty report
        return NextResponse.json({
          dateRange: { startDate, endDate },
          clients: [],
          totals: { totalPaidAmount: 0, totalMora: 0, totalPayments: 0, totalClients: 0 }
        })
      }
    }
    // Admins can see all payments (no additional filtering)

    const { data: payments, error: paymentsError } = await paymentsQuery

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError)
      return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 })
    }

    if (!payments || payments.length === 0) {
      return NextResponse.json({
        dateRange: { startDate, endDate },
        clients: [],
        totals: { totalPaidAmount: 0, totalMora: 0, totalPayments: 0, totalClients: 0 }
      })
    }

    // Get all unique loan IDs from payments to fetch additional data
    const loanIds = Array.from(new Set(payments.map(p => p.loan_id).filter(Boolean)))
    
    // Get loan and client data for the payments
    const { data: loansData, error: loansError } = await supabase
      .from("loans")
      .select(`
        id,
        loan_number,
        amount,
        client:clients!loans_client_id_fkey (
          id,
          first_name,
          last_name,
          phone,
          email
        )
      `)
      .in('id', loanIds)

    if (loansError) {
      console.error("Error fetching loans data:", loansError)
      return NextResponse.json({ error: "Failed to fetch loans data" }, { status: 500 })
    }

    // Get payment schedules for additional information
    const scheduleIds = Array.from(new Set(payments.map(p => p.schedule_id).filter(Boolean)))
    
    const { data: schedules, error: schedulesError } = await supabase
      .from("payment_schedule")
      .select(`
        id,
        amount,
        due_date,
        status,
        mora,
        admin_fees,
        principal
      `)
      .in('id', scheduleIds)

    if (schedulesError) {
      console.error("Error fetching schedules:", schedulesError)
      return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 })
    }

    // Create maps for quick lookup
    const loansMap = new Map()
    loansData?.forEach(loan => {
      loansMap.set(loan.id, loan)
    })

    const scheduleMap = new Map()
    schedules?.forEach(schedule => {
      scheduleMap.set(schedule.id, schedule)
    })

    // Transform and organize data by client
    const clientsMap = new Map()
    let totalPaidAmount = 0
    let totalMora = 0
    let totalScheduledAmount = 0
    let totalCapital = 0

    payments.forEach(payment => {
      const loan = loansMap.get(payment.loan_id)
      const schedule = scheduleMap.get(payment.schedule_id)
      
      if (!loan || !loan.client) return

      const client = loan.client
      const clientKey = client.id
      
      if (!clientsMap.has(clientKey)) {
        clientsMap.set(clientKey, {
          clientId: client.id,
          clientName: `${client.first_name} ${client.last_name}`,
          clientEmail: client.email || "",
          clientPhone: client.phone || "",
          payments: []
        })
      }

      const clientData = clientsMap.get(clientKey)
      const paidAmount = Number(payment.amount)
      const scheduledAmount = schedule 
        ? Number(schedule.amount || 0) + Number(schedule.admin_fees || 0) + Number(schedule.mora || 0)
        : 0
      const mora = schedule ? Number(schedule.mora || 0) : 0
      const capital = schedule ? Number(schedule.principal || 0) : 0
      const adminFees = schedule ? Number(schedule.admin_fees || 0) : 0
      const interest = schedule ? Math.max(0, Number(schedule.amount || 0) - capital) : 0
      
      // Determine payment status
      let paymentStatus = "Completo"
      if (schedule && schedule.status === "partially_paid") {
        paymentStatus = "Parcial"
      }

      clientData.payments.push({
        paymentId: payment.id,
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        loanNumber: loan.loan_number,
        loanAmount: Number(loan.amount),
        scheduledAmount: scheduledAmount,
        capital: capital,
        interest: interest,
        paidAmount: paidAmount,
        mora: mora,
        adminFees: adminFees,
        paymentStatus: paymentStatus,
        dueDate: schedule ? schedule.due_date : null,
        notes: payment.notes || ""
      })

      totalPaidAmount += paidAmount
      totalMora += mora
      totalScheduledAmount += scheduledAmount
      totalCapital += capital
    })

    // Convert map to array and sort by client name
    const clientsData = Array.from(clientsMap.values()).sort((a, b) => 
      a.clientName.localeCompare(b.clientName)
    )

    const reportData = {
      dateRange: {
        startDate,
        endDate
      },
      clients: clientsData,
      totals: {
        totalPaidAmount: Number(totalPaidAmount.toFixed(2)),
        totalMora: Number(totalMora.toFixed(2)),
        totalScheduledAmount: Number(totalScheduledAmount.toFixed(2)),
        totalCapital: Number(totalCapital.toFixed(2)),
        totalPayments: payments?.length || 0,
        totalClients: clientsData.length
      }
    }

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("Error generating payments report:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
