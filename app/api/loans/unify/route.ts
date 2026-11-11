import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function authorizedActor() {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('id, role').eq('auth_id', user.id).maybeSingle()
  if (!profile || !['admin', 'asesor'].includes(profile.role)) return null
  return { admin, user, profile }
}

export async function GET(request: NextRequest) {
  const actor = await authorizedActor()
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const loanId = request.nextUrl.searchParams.get('loanId')
  if (loanId) {
    if (!/^[0-9a-f-]{36}$/i.test(loanId)) return NextResponse.json({ error: 'Préstamo inválido' }, { status: 400 })
    const { data: target } = await actor.admin.from('loans').select('id, client_id').eq('id', loanId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
    const { data: client } = await actor.admin.from('clients').select('advisor_id').eq('id', target.client_id).single()
    if (actor.profile.role === 'asesor' && client?.advisor_id !== actor.profile.id) {
      return NextResponse.json({ error: 'Préstamo no disponible' }, { status: 404 })
    }
    let { data: event } = await actor.admin.from('loan_unifications')
      .select('id, new_loan_id, actor_user_id, amount, excluded_mora, created_at')
      .eq('new_loan_id', loanId).maybeSingle()
    if (!event) {
      const { data: source } = await actor.admin.from('loan_unification_sources')
        .select('unification_id').eq('source_loan_id', loanId).maybeSingle()
      if (source) {
        const lookup = await actor.admin.from('loan_unifications')
          .select('id, new_loan_id, actor_user_id, amount, excluded_mora, created_at')
          .eq('id', source.unification_id).maybeSingle()
        event = lookup.data
      }
    }
    if (!event) return NextResponse.json({ unification: null }, { headers: { 'Cache-Control': 'no-store' } })
    const { data: sourceRows } = await actor.admin.from('loan_unification_sources')
      .select('source_loan_id, balance_without_mora, excluded_mora').eq('unification_id', event.id)
    const sourceIds = (sourceRows || []).map((row) => row.source_loan_id)
    const [{ data: sourceLoans }, { data: newLoan }, { data: user }] = await Promise.all([
      actor.admin.from('loans').select('id, loan_number').in('id', sourceIds),
      actor.admin.from('loans').select('loan_number').eq('id', event.new_loan_id).single(),
      actor.admin.from('users').select('full_name, email').eq('id', event.actor_user_id).single(),
    ])
    return NextResponse.json({ unification: {
      newLoanId: event.new_loan_id, newLoanNumber: newLoan?.loan_number,
      amount: Number(event.amount), excludedMora: Number(event.excluded_mora),
      actorName: user?.full_name || user?.email || 'Usuario', createdAt: event.created_at,
      sources: (sourceRows || []).map((row) => ({ id: row.source_loan_id,
        loanNumber: sourceLoans?.find((loan) => loan.id === row.source_loan_id)?.loan_number || row.source_loan_id,
        balance: Number(row.balance_without_mora), excludedMora: Number(row.excluded_mora) })),
    } }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
  }
  const { data: client } = await actor.admin.from('clients').select('id, advisor_id').eq('id', clientId).maybeSingle()
  if (!client || (actor.profile.role === 'asesor' && client.advisor_id !== actor.profile.id)) {
    return NextResponse.json({ error: 'Cliente no disponible' }, { status: 404 })
  }
  const { data: loans, error } = await actor.admin.from('loans')
    .select('id, loan_number, status, amount, payment_schedule(principal, interest, admin_fees, paid_amount, mora, waived_amount)')
    .eq('client_id', clientId).in('status', ['active', 'defaulted']).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'No se pudieron consultar los préstamos' }, { status: 500 })
  const available = (loans || []).map((loan) => {
    const schedules = Array.isArray(loan.payment_schedule) ? loan.payment_schedule : []
    const balance = schedules.reduce((sum, row) => sum + Math.max(0,
      Number(row.principal || 0) + Number(row.interest || 0) + Number(row.admin_fees || 0)
      - Math.max(0, Number(row.waived_amount || 0) - Number(row.mora || 0))
      - Math.max(0, Number(row.paid_amount || 0) - Math.max(0, Number(row.mora || 0) - Number(row.waived_amount || 0)))), 0)
    const excludedMora = schedules.reduce((sum, row) => sum + Math.max(0,
      Number(row.mora || 0) - Number(row.waived_amount || 0) - Number(row.paid_amount || 0)), 0)
    return { id: loan.id, loanNumber: loan.loan_number, status: loan.status,
      balance: Math.round(balance * 100) / 100, excludedMora: Math.round(excludedMora * 100) / 100 }
  }).filter((loan) => loan.balance > 0)
  return NextResponse.json({ loans: available }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const actor = await authorizedActor()
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }
  const ids = body.sourceIds
  const preview = body.preview === true
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 20 ||
    ids.some((id) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) ||
    new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'Seleccione al menos dos préstamos distintos' }, { status: 400 })
  }
  const term = Number(body.term)
  const interestRate = Number(body.interestRate)
  const frequency = body.frequency
  const startDate = body.startDate
  const expectedAmount = Number(body.expectedAmount)
  const expectedExcludedMora = Number(body.expectedExcludedMora)
  if (!preview && (!Number.isInteger(term) || term < 1 || term > 120 ||
    !Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100 ||
    !Number.isFinite(expectedAmount) || expectedAmount <= 0 ||
    !Number.isFinite(expectedExcludedMora) || expectedExcludedMora < 0 ||
    !['mensual', 'quincenal'].includes(String(frequency)) ||
    typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))) {
    return NextResponse.json({ error: 'Plazo, tasa, frecuencia o fecha inválidos' }, { status: 400 })
  }
  const { data, error } = await actor.admin.rpc(preview ? 'unify_client_loans' : 'unify_client_loans_confirmed', {
    p_actor_auth_id: actor.user.id,
    p_source_ids: ids,
    p_term: preview ? null : term,
    p_frequency: preview ? null : frequency,
    p_interest_rate: preview ? null : interestRate,
    p_start_date: preview ? null : startDate,
    ...(preview ? { p_preview: true } : {
      p_expected_amount: expectedAmount,
      p_expected_excluded_mora: expectedExcludedMora,
    }),
  })
  if (error) {
    console.error('Loan unification failed:', error)
    const expected = error.code === 'P0001' || error.code === '23514'
    return NextResponse.json({ error: expected ? error.message : 'No se pudieron unificar los préstamos' },
      { status: expected ? 400 : 500 })
  }
  return NextResponse.json(data, { status: preview ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
}
