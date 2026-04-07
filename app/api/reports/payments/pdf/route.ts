import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { translateStatus } from '@/lib/utils'
import { getLogoDataUrl, htmlToPdfResponse, reportCSS, dateRangeLabel, fmtQ, fmtDateGT } from '@/lib/pdf-report-helpers'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('from') || searchParams.get('startDate')
    const endDate = searchParams.get('to') || searchParams.get('endDate')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('role, email, id').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Build payments query
    let paymentsQuery = supabase
      .from('payments')
      .select('*, loan:loans!payments_loan_id_fkey(id, client:clients!loans_client_id_fkey(email))')
      .eq('confirmation_status', 'aprobado')
      .order('payment_date', { ascending: true })

    if (startDate) paymentsQuery = paymentsQuery.gte('payment_date', startDate)
    if (endDate) paymentsQuery = paymentsQuery.lte('payment_date', endDate)

    if (me.role === 'asesor') {
      const { data: assignedClients } = await supabase.from('clients').select('email').eq('advisor_id', me.id)
      const emails = (assignedClients || []).map((c: any) => c.email).filter(Boolean)
      if (emails.length > 0) paymentsQuery = paymentsQuery.in('loan.client.email', emails)
    }

    const { data: payments } = await paymentsQuery
    if (!payments || !payments.length) {
      const logo = await getLogoDataUrl()
      return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
        <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div></div></div></div>
        <div class="divider"></div><p>No se encontraron pagos.</p></body></html>`,
        `Cooperativa_Reporte_Pagos_${new Date().toISOString().slice(0, 10)}.pdf`, true)
    }

    const loanIds = Array.from(new Set(payments.map(p => p.loan_id).filter(Boolean)))
    const { data: loansData } = await supabase
      .from('loans')
      .select('id, loan_number, amount, client:clients!loans_client_id_fkey(id, first_name, last_name, phone, email)')
      .in('id', loanIds)

    const scheduleIds = Array.from(new Set(payments.map(p => p.schedule_id).filter(Boolean)))
    const { data: schedules } = await supabase
      .from('payment_schedule')
      .select('id, amount, due_date, status, mora, admin_fees, principal')
      .in('id', scheduleIds)

    const loansMap = new Map((loansData || []).map((l: any) => [l.id, l]))
    const scheduleMap = new Map((schedules || []).map((s: any) => [s.id, s]))

    // Group by client
    const clientsMap = new Map<string, { name: string; email: string; phone: string; rows: any[] }>()
    let totalPaid = 0, totalMora = 0, totalScheduled = 0, totalCapital = 0

    for (const p of payments) {
      const loan: any = loansMap.get(p.loan_id)
      const sched: any = scheduleMap.get(p.schedule_id)
      if (!loan?.client) continue
      const c = loan.client
      const key = c.id
      if (!clientsMap.has(key)) clientsMap.set(key, { name: `${c.first_name} ${c.last_name}`, email: c.email || '', phone: c.phone || '', rows: [] })
      const paid = Number(p.amount || 0)
      const scheduled = sched ? Number(sched.amount || 0) + Number(sched.mora || 0) : 0
      const capital = sched ? Number(sched.principal || 0) : 0
      const mora = sched ? Number(sched.mora || 0) : 0
      const adminFees = sched ? Number(sched.admin_fees || 0) : 0
      const interest = sched ? Math.max(0, Number(sched.amount || 0) - capital - adminFees) : 0
      totalPaid += paid; totalMora += mora; totalScheduled += scheduled; totalCapital += capital
      clientsMap.get(key)!.rows.push({ loanNumber: loan.loan_number, payDate: p.payment_date, method: p.payment_method, scheduled, capital, interest, paid, mora, adminFees: sched ? Number(sched.admin_fees || 0) : 0, dueDate: sched?.due_date || '', status: translateStatus(sched?.status || ''), notes: p.notes || '' })
    }

    const clients = Array.from(clientsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    const logo = await getLogoDataUrl()
    const now = new Date()

    let tableRows = ''
    for (const c of clients) {
      tableRows += `<tr><td colspan="13" class="client-bar">${c.name} — ${c.email || 'N/A'} — Tel: ${c.phone || 'N/A'}</td></tr>`
      for (const r of c.rows) {
        tableRows += `<tr>
          <td>${r.loanNumber}</td><td class="text-center">${fmtDateGT(r.payDate)}</td><td>${r.method}</td>
          <td class="currency">${fmtQ(r.scheduled)}</td><td class="currency">${fmtQ(r.capital)}</td>
          <td class="currency">${fmtQ(r.interest)}</td><td class="currency">${fmtQ(r.paid)}</td>
          <td class="currency">${fmtQ(r.mora)}</td><td class="currency">${fmtQ(r.adminFees)}</td>
          <td class="text-center">${fmtDateGT(r.dueDate)}</td><td class="text-center">${r.status}</td>
          <td>${r.notes}</td>
        </tr>`
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      @page { size: A4 landscape; margin: 10mm; }
    </style></head><body>
      <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Reporte General de Pagos</strong> — ${dateRangeLabel(startDate, endDate)} — Generado el: ${now.toLocaleDateString('es-GT')} a las ${now.toLocaleTimeString('es-GT')}</div>
      <table>
        <thead><tr><th>Préstamo</th><th>Fecha Pago</th><th>Método</th><th>Programado</th><th>Capital</th><th>Intereses</th><th>Pagado</th><th>Mora</th><th>Gastos Adm.</th><th>Vencimiento</th><th>Estado</th><th>Notas</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="summary-box">RESUMEN EJECUTIVO</div>
      <div style="padding:8px 0;">
        <div class="summary-row"><span class="summary-label">Total Clientes:</span><span>${clients.length}</span></div>
        <div class="summary-row"><span class="summary-label">Total Pagos:</span><span>${payments.length}</span></div>
        <div class="summary-row"><span class="summary-label">Total Programado:</span><span>${fmtQ(totalScheduled)}</span></div>
        <div class="summary-row"><span class="summary-label">Total Capital:</span><span>${fmtQ(totalCapital)}</span></div>
        <div class="summary-row"><span class="summary-label">Total Pagado:</span><span>${fmtQ(totalPaid)}</span></div>
        <div class="summary-row"><span class="summary-label">Total Mora:</span><span>${fmtQ(totalMora)}</span></div>
      </div>
      <div class="footer">Este documento es un reporte oficial generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Reporte_Pagos_${now.toISOString().slice(0, 10)}.pdf`, true)
  } catch (e: any) {
    console.error('[payments PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
