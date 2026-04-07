import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { translateStatus } from '@/lib/utils'
import { getLogoDataUrl, htmlToPdfResponse, reportCSS, dateRangeLabel, fmtQ, fmtDateGT } from '@/lib/pdf-report-helpers'

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

    const gtTodayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())

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
      .select('id, loan_id, payment_number, due_date, amount, principal, interest, mora, admin_fees, status')
      .eq('status', 'pending')
      .lt('due_date', gtTodayYMD)
      .order('due_date', { ascending: true })

    if (from) scheduleQuery = scheduleQuery.gte('due_date', from)
    if (to) scheduleQuery = scheduleQuery.lte('due_date', to)
    if (me.role === 'asesor' && loanIdsForAdvisor.length) scheduleQuery = scheduleQuery.in('loan_id', loanIdsForAdvisor)

    const { data: schedules, error: schedulesError } = await scheduleQuery
    if (schedulesError) return NextResponse.json({ error: schedulesError.message }, { status: 500 })

    const loanIds = Array.from(new Set((schedules || []).map((s: any) => String(s.loan_id)).filter(Boolean)))
    if (!loanIds.length) return emptyPdf(from, to)

    const { data: loans } = await admin
      .from('loans')
      .select('id, loan_number, amount, client:clients(id, first_name, last_name, email)')
      .in('id', loanIds)

    const loansMap: Record<string, any> = {}
    for (const l of (loans || [])) loansMap[String(l.id)] = l

    // Groups
    const { data: groupRows } = await admin.from('loans_groups').select('group_id, group:grupos(nombre), loans, total_amount')
    const loanToGroup: Record<string, { groupName: string }> = {}
    for (const gr of (groupRows || [])) {
      const g = Array.isArray((gr as any).group) ? (gr as any).group[0] : (gr as any).group
      for (const entry of ((gr as any).loans || [])) {
        loanToGroup[String(entry.loan_id)] = { groupName: g?.nombre || '' }
      }
    }

    const logo = await getLogoDataUrl()
    const now = new Date()

    const individuals = (schedules || []).filter((s: any) => !loanToGroup[String(s.loan_id)])
    const grouped = (schedules || []).filter((s: any) => loanToGroup[String(s.loan_id)])

    const buildRows = (items: any[], tipo: string) => {
      let html = ''
      for (const s of items) {
        const loan = loansMap[String(s.loan_id)]
        const client = loan?.client
        const nombre = tipo === 'Individual'
          ? `${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'N/A'
          : (loanToGroup[String(s.loan_id)]?.groupName || 'Grupo')
        const programado = Number(s.amount || 0)
        const mora = Number(s.mora || 0)
        const totalPagar = programado + mora
        html += `<tr>
          <td>${tipo}</td><td>${nombre}</td><td>${loan?.loan_number || ''}</td>
          <td class="currency">${fmtQ(Number(loan?.amount || 0))}</td><td class="text-center">${s.payment_number}</td>
          <td class="text-center">${fmtDateGT(s.due_date)}</td><td class="text-center">${translateStatus(s.status)}</td>
          <td class="currency">${fmtQ(programado)}</td><td class="currency">${fmtQ(Number(s.principal || 0))}</td>
          <td class="currency">${fmtQ(Number(s.interest || 0))}</td><td class="currency">${fmtQ(mora)}</td>
          <td class="currency">${fmtQ(Number(s.admin_fees || 0))}</td><td class="currency">${fmtQ(totalPagar)}</td>
        </tr>`
      }
      return html
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      @page { size: A4 landscape; margin: 10mm; }
    </style></head><body>
      <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Reporte de Cartera en Mora</strong> — ${dateRangeLabel(from, to)} — Generado: ${now.toLocaleDateString('es-GT')}</div>
      <div class="section-title">Préstamos Individuales (${individuals.length})</div>
      <table><thead><tr><th>Tipo</th><th>Cliente</th><th>Préstamo</th><th>Monto</th><th>Cuota</th><th>Vencimiento</th><th>Estado</th><th>Programado</th><th>Capital</th><th>Interés</th><th>Mora</th><th>Gastos</th><th>Total</th></tr></thead>
        <tbody>${buildRows(individuals, 'Individual')}</tbody></table>
      ${grouped.length > 0 ? `<div class="section-title">Préstamos de Grupo (${grouped.length})</div>
      <table><thead><tr><th>Tipo</th><th>Grupo</th><th>Préstamo</th><th>Monto</th><th>Cuota</th><th>Vencimiento</th><th>Estado</th><th>Programado</th><th>Capital</th><th>Interés</th><th>Mora</th><th>Gastos</th><th>Total</th></tr></thead>
        <tbody>${buildRows(grouped, 'Grupo')}</tbody></table>` : ''}
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Cartera_Mora_${now.toISOString().slice(0, 10)}.pdf`, true)
  } catch (e: any) {
    console.error('[delinquent PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string | null, to: string | null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Cartera en Mora</strong> — ${dateRangeLabel(from, to)}</div>
    <p>No hay cuotas en mora.</p></body></html>`,
    `Cooperativa_Cartera_Mora_${new Date().toISOString().slice(0, 10)}.pdf`, true)
}
