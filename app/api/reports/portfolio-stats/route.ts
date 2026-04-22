import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Lightweight endpoint returning portfolio-level stats for the dashboard.
 * Uses the SAME payment priority logic as the Total Cartera PDF report:
 *   paid_amount → mora → admin_fees → interest → principal (capital)
 * Returns: totalCapitalRecuperado, totalInteresesRecuperados, totalInteresesPorPagar
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id, role').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!['admin', 'asesor', 'contador'].includes(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Build the active loans query scoped to the user's role
    let loansQuery = admin.from('loans').select('id').eq('status', 'active')
    if (me.role === 'asesor') {
      const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      const clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return NextResponse.json({ totalCapitalRecuperado: 0, totalInteresesRecuperados: 0, totalInteresesPorPagar: 0 })
      loansQuery = loansQuery.in('client_id', clientIds)
    }

    const { data: activeLoans } = await loansQuery
    const activeLoanIds = (activeLoans || []).map((l: any) => String(l.id))
    if (!activeLoanIds.length) return NextResponse.json({ totalCapitalRecuperado: 0, totalInteresesRecuperados: 0, totalInteresesPorPagar: 0 })

    const { data: schedules } = await admin
      .from('payment_schedule')
      .select('loan_id, principal, interest, mora, admin_fees, paid_amount, status')
      .in('loan_id', activeLoanIds)

    let totalInteresesEsperados = 0
    let totalInteresesRecuperados = 0
    let totalCapitalRecuperado = 0

    for (const s of (schedules || [])) {
      const principal = Number((s as any).principal || 0)
      const interest = Number((s as any).interest || 0)
      const mora = Number((s as any).mora || 0)
      const adminFees = Number((s as any).admin_fees || 0)
      const paidAmt = Number((s as any).paid_amount || 0)

      totalInteresesEsperados += interest

      // Apply payment priority: mora -> admin_fees -> interest -> principal (capital)
      let rem = paidAmt
      rem -= Math.min(rem, mora)
      rem -= Math.min(rem, adminFees)
      const intPaid = Math.min(rem, interest)
      rem -= intPaid
      totalInteresesRecuperados += intPaid
      totalCapitalRecuperado += Math.min(rem, principal)
    }

    const totalInteresesPorPagar = Math.max(0, totalInteresesEsperados - totalInteresesRecuperados)

    return NextResponse.json({ totalCapitalRecuperado, totalInteresesRecuperados, totalInteresesPorPagar })
  } catch (e: any) {
    console.error('[portfolio-stats]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
