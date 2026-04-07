import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getLogoDataUrl, htmlToPdfResponse, reportCSS, dateRangeLabel, fmtQ } from '@/lib/pdf-report-helpers'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (me.role !== 'admin' && me.role !== 'asesor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let loanIdsForAdvisor: string[] = []
    if (me.role === 'asesor') {
      const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      const clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return emptyPdf(from, to)
      const { data: advisorLoans } = await admin.from('loans').select('id').in('client_id', clientIds)
      loanIdsForAdvisor = (advisorLoans || []).map((l: any) => String(l.id))
      if (!loanIdsForAdvisor.length) return emptyPdf(from, to)
    }

    let scheduleQuery = admin
      .from('payment_schedule')
      .select('id, loan_id, due_date, amount, principal, interest, mora, admin_fees, paid_amount, status')
      .neq('status', 'paid')

    if (from) scheduleQuery = scheduleQuery.gte('due_date', from)
    if (to) scheduleQuery = scheduleQuery.lte('due_date', to)
    if (me.role === 'asesor' && loanIdsForAdvisor.length) scheduleQuery = scheduleQuery.in('loan_id', loanIdsForAdvisor)

    const { data: schedules, error: schedulesError } = await scheduleQuery
    if (schedulesError) return NextResponse.json({ error: schedulesError.message }, { status: 500 })
    if (!schedules?.length) return emptyPdf(from, to)

    const loanIds = Array.from(new Set(schedules.map((s: any) => s.loan_id)))
    const { data: loans } = await admin
      .from('loans')
      .select('id, loan_number, client:clients(first_name, last_name)')
      .in('id', loanIds)
    const loanMap = new Map((loans || []).map((l: any) => [l.id, l]))

    // Aggregate
    interface AgedEntry { clientName: string; loanNumber: string; totalDue: number; current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number }
    const reportData: Record<string, AgedEntry> = {}
    const now = new Date(); now.setHours(0, 0, 0, 0)

    for (const s of schedules) {
      const loan: any = loanMap.get(s.loan_id)
      if (!loan) continue
      const dueDate = new Date(s.due_date)
      const dueTime = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime()
      const daysOverdue = Math.floor((now.getTime() - dueTime) / 864e5)
      const debt = (Number(s.amount || 0) + Number(s.mora || 0) + Number(s.admin_fees || 0)) - Number(s.paid_amount || 0)
      if (debt <= 0.01) continue

      if (!reportData[s.loan_id]) {
        reportData[s.loan_id] = { clientName: `${loan.client?.first_name || ''} ${loan.client?.last_name || ''}`.trim(), loanNumber: loan.loan_number || 'N/A', totalDue: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
      }
      const e = reportData[s.loan_id]
      e.totalDue += debt
      if (daysOverdue <= 0) e.current += debt
      else if (daysOverdue <= 30) e.d1_30 += debt
      else if (daysOverdue <= 60) e.d31_60 += debt
      else if (daysOverdue <= 90) e.d61_90 += debt
      else e.d90plus += debt
    }

    const entries = Object.values(reportData)
    const logo = await getLogoDataUrl()

    let rows = ''
    let totals = { totalDue: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }
    for (const e of entries) {
      totals.totalDue += e.totalDue; totals.current += e.current; totals.d1_30 += e.d1_30; totals.d31_60 += e.d31_60; totals.d61_90 += e.d61_90; totals.d90plus += e.d90plus
      rows += `<tr><td>${e.clientName}</td><td>${e.loanNumber}</td><td class="currency">${fmtQ(e.totalDue)}</td><td class="currency">${fmtQ(e.current)}</td><td class="currency">${fmtQ(e.d1_30)}</td><td class="currency">${fmtQ(e.d31_60)}</td><td class="currency">${fmtQ(e.d61_90)}</td><td class="currency">${fmtQ(e.d90plus)}</td></tr>`
    }
    rows += `<tr style="font-weight:700;background:#f1f5f9;"><td colspan="2">TOTALES</td><td class="currency">${fmtQ(totals.totalDue)}</td><td class="currency">${fmtQ(totals.current)}</td><td class="currency">${fmtQ(totals.d1_30)}</td><td class="currency">${fmtQ(totals.d31_60)}</td><td class="currency">${fmtQ(totals.d61_90)}</td><td class="currency">${fmtQ(totals.d90plus)}</td></tr>`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}</style></head><body>
      <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Reporte de Antigüedad de Saldos</strong> — ${dateRangeLabel(from, to)} — Generado: ${new Date().toLocaleDateString('es-GT')}</div>
      <table><thead><tr><th>Cliente</th><th>Préstamo</th><th>Saldo Total</th><th>Corriente</th><th>1-30 Días</th><th>31-60 Días</th><th>61-90 Días</th><th>+90 Días</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Antiguedad_Saldos_${new Date().toISOString().slice(0, 10)}.pdf`)
  } catch (e: any) {
    console.error('[aged-receivables PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string | null, to: string | null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Antigüedad de Saldos</strong> — ${dateRangeLabel(from, to)}</div>
    <p>No hay datos disponibles.</p></body></html>`,
    `Cooperativa_Antiguedad_Saldos_${new Date().toISOString().slice(0, 10)}.pdf`)
}
