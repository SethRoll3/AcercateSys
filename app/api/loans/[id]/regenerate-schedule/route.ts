import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: Promise<{ id: string }> } }
) {
  try {
    const supabase = await createClient()
    const paramsData = await params
    const id = paramsData.id

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch loan details
    const { data: loan, error: loanError } = await supabase
      .from("loans")
      .select("*")
      .eq("id", id)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    // Usar cliente con service role directo para evitar problemas de RLS (sin cookies)
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    console.log("[v0] Using direct service-role client for schedule regeneration")

    // Eliminar el plan de pagos existente usando SQL directo
    const { error: deleteError } = await supabaseAdmin
      .from('payment_schedule')
      .delete()
      .eq('loan_id', id)

    if (deleteError) {
      console.error("[v0] Error deleting existing schedule:", deleteError)
      return NextResponse.json({ error: "Failed to delete existing schedule" }, { status: 500 })
    }

    // Crear nuevo plan de pagos: capital fijo + interés mensual fijo.
    // IMPORTANTE: "amount" guarda SOLO (capital + interés). Los gastos administrativos
    // se almacenan en "admin_fees" y se suman al mostrar o cobrar.
    const scheduleEntries = []
    const n = loan.term_months
    const totalLoanAmount = parseFloat(loan.amount)
    const monthlyRate = (loan.interest_rate || 0) / 100 // interés mensual
    const adminFeesPerInstallment = 20
    const round2 = (num: number) => Math.round(num * 100) / 100

    const capitalPerMonth = round2(totalLoanAmount / n)
    const interestPerMonth = round2(totalLoanAmount * monthlyRate)

    for (let i = 0; i < n; i++) {
      const dueDate = new Date(loan.start_date)
      dueDate.setMonth(dueDate.getMonth() + i + 1)

      scheduleEntries.push({
        loan_id: loan.id,
        payment_number: i + 1,
        due_date: dueDate.toISOString().split("T")[0],
        // amount debe ser capital + interés (sin gastos administrativos)
        amount: round2(capitalPerMonth + interestPerMonth),
        principal: capitalPerMonth,
        interest: interestPerMonth,
        admin_fees: adminFeesPerInstallment,
        status: "pending"
      })
    }

    // Insertar el nuevo plan de pagos usando el cliente de administrador
    const { error: scheduleError } = await supabaseAdmin
      .from('payment_schedule')
      .insert(scheduleEntries)

    if (scheduleError) {
      console.error("[v0] Error creating payment schedule:", scheduleError)
      return NextResponse.json({ error: "Failed to create payment schedule" }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Payment schedule regenerated successfully',
      count: scheduleEntries.length
    }, { status: 200 })
  } catch (error) {
    console.error("[v0] Error regenerating schedule:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}