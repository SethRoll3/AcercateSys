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

    const { data: existingSchedules } = await supabaseAdmin
      .from('payment_schedule')
      .select('id')
      .eq('loan_id', id)

    if (existingSchedules && existingSchedules.length > 0) {
      const scheduleIds = existingSchedules.map((r: any) => r.id)
      const { error: unlinkError } = await supabaseAdmin
        .from('cuota_boletas')
        .delete()
        .in('payment_schedule_id', scheduleIds)
      if (unlinkError) {
        console.error('[v0] Error deleting cuota_boletas links:', unlinkError)
        return NextResponse.json({ error: 'Failed to unlink schedule receipts' }, { status: 500 })
      }
    }

    const { error: paymentsDeleteError } = await supabaseAdmin
      .from('payments')
      .delete()
      .eq('loan_id', id)
    if (paymentsDeleteError) {
      console.error('[v0] Error deleting payments:', paymentsDeleteError)
      return NextResponse.json({ error: 'Failed to delete payments' }, { status: 500 })
    }

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

  const { searchParams } = new URL(request.url)
  const frequency = (searchParams.get('frequency') === 'quincenal') ? 'quincenal' : 'mensual'

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
      const dueYmd = addMonths(loan.start_date, i + 1)
      scheduleEntries.push({
        loan_id: loan.id,
        payment_number: i + 1,
        due_date: dueYmd,
        amount: round2(capitalPerMonth + interestPerMonth),
        principal: capitalPerMonth,
        interest: interestPerMonth,
        admin_fees: adminFeesPerInstallment,
        status: 'pending',
      })
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dueYmd = addDays(loan.start_date, (i + 1) * 15)
      scheduleEntries.push({
        loan_id: loan.id,
        payment_number: i + 1,
        due_date: dueYmd,
        amount: round2(capitalPerMonth + (interestPerMonth / 2)),
        principal: capitalPerMonth,
        interest: round2(interestPerMonth / 2),
        admin_fees: adminFeesPerInstallment,
        status: 'pending',
      })
    }
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
