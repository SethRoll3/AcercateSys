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

    const { data: me } = await supabase.from('users').select('role, email, id').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (me.role !== 'admin' && me.role !== 'asesor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 1. Clients
    let clientsQuery = admin.from('clients').select('id, first_name, last_name, phone, email')
    if (me.role === 'asesor') clientsQuery = clientsQuery.eq('advisor_id', me.id)
    const { data: clients, error: clientsError } = await clientsQuery.order('first_name', { ascending: true })
    if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })
    if (!clients?.length) return emptyPdf(from, to)

    const clientIds = clients.map((c: any) => String(c.id))

    // 2. Loans
    const { data: loans } = await admin
      .from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, status, start_date, client_id')
      .in('client_id', clientIds)
      .order('created_at', { ascending: true })
    const loanIds = (loans || []).map((l: any) => String(l.id))
    if (!loanIds.length) return emptyPdf(from, to)

    // 3. Approved payments
    let allPayments: any[] = []
    for (let i = 0; i < loanIds.length; i += 200) {
      const chunk = loanIds.slice(i, i + 200)
      let payQuery = admin.from('payments')
        .select('id, amount, payment_date, payment_method, receipt_number, notes, confirmation_status, receipt_image_url, loan_id, schedule_id')
        .in('loan_id', chunk).eq('confirmation_status', 'aprobado').order('payment_date', { ascending: true })
      if (from) payQuery = payQuery.gte('payment_date', from)
      if (to) payQuery = payQuery.lte('payment_date', to)
      const { data } = await payQuery
      allPayments = allPayments.concat(data || [])
    }

    // 4. Schedules
    const scheduleIds = Array.from(new Set(allPayments.map(p => p.schedule_id).filter(Boolean)))
    const scheduleMap: Record<string, any> = {}
    for (let i = 0; i < scheduleIds.length; i += 500) {
      const chunk = scheduleIds.slice(i, i + 500) as string[]
      const { data } = await admin.from('payment_schedule')
        .select('id, payment_number, amount, principal, interest, mora, admin_fees, due_date, status').in('id', chunk)
      for (const s of (data || [])) scheduleMap[String(s.id)] = s
    }

    // 5. Boletas
    const boletasBySchedule: Record<string, any[]> = {}
    if (scheduleIds.length > 0) {
      for (let i = 0; i < scheduleIds.length; i += 500) {
        const chunk = scheduleIds.slice(i, i + 500) as string[]
        const { data } = await admin.from('cuota_boletas')
          .select('payment_schedule_id, boletas(id, numero_boleta, image_url)').in('payment_schedule_id', chunk)
        for (const cb of (data || [])) {
          const sid = String(cb.payment_schedule_id)
          const boleta = (cb as any).boletas
          if (boleta) { if (!boletasBySchedule[sid]) boletasBySchedule[sid] = []; boletasBySchedule[sid].push(boleta) }
        }
      }
    }

    // Group data
    const loansByClient: Record<string, any[]> = {}
    for (const l of (loans || [])) { const cid = String(l.client_id); (loansByClient[cid] ||= []).push(l) }
    const paymentsByLoan: Record<string, any[]> = {}
    for (const p of allPayments) { const lid = String(p.loan_id); (paymentsByLoan[lid] ||= []).push(p) }

    const logo = await getLogoDataUrl()
    const now = new Date()
    let grandTotalPagado = 0, grandTotalPayments = 0, totalClientsWithPayments = 0

    let bodyHtml = ''
    for (const client of clients) {
      const cid = String(client.id)
      const clientLoans = loansByClient[cid] || []
      let clientHasPayments = false
      for (const loan of clientLoans) { if ((paymentsByLoan[String(loan.id)] || []).length > 0) { clientHasPayments = true; break } }
      if (!clientHasPayments) continue
      totalClientsWithPayments++
      const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim()
      bodyHtml += `<div class="client-bar">CLIENTE: ${clientName} — Email: ${client.email || 'N/A'} — Tel: ${client.phone || 'N/A'}</div>`

      for (const loan of clientLoans) {
        const lid = String(loan.id)
        const loanPayments = paymentsByLoan[lid] || []
        if (!loanPayments.length) continue
        bodyHtml += `<div class="loan-bar">Préstamo #${loan.loan_number || loan.id} — Monto: ${fmtQ(Number(loan.amount || 0))} — Tasa: ${loan.interest_rate}% — ${translateStatus(loan.status)}</div>`
        bodyHtml += `<table><thead><tr><th>Cuota</th><th>Fecha Pago</th><th>Vencimiento</th><th>Método</th><th>Recibo</th><th>Capital</th><th>Interés</th><th>Mora</th><th>Gastos</th><th>Cuota</th><th>Pagado</th><th>Estado</th><th>Boleta</th></tr></thead><tbody>`
        let loanTotal = 0
        for (const payment of loanPayments) {
          const sched = scheduleMap[String(payment.schedule_id)] || {}
          const principal = Number(sched.principal || 0)
          const interest = Number(sched.interest || 0)
          const mora = Number(sched.mora || 0)
          const adminFees = Number(sched.admin_fees || 0)
          const cuotaTotal = Number(sched.amount || 0) + mora + adminFees
          const montoPagado = Number(payment.amount || 0)
          loanTotal += montoPagado; grandTotalPagado += montoPagado; grandTotalPayments++

          const boletas = boletasBySchedule[String(payment.schedule_id)] || []
          let imageUrl = payment.receipt_image_url || ''
          if (!imageUrl && boletas.length > 0) imageUrl = boletas[0].image_url || ''
          const boletaLink = imageUrl ? `<a href="${imageUrl}" style="color:#2563EB;">Ver boleta</a>` : ''

          bodyHtml += `<tr>
            <td class="text-center">${sched.payment_number || ''}</td>
            <td class="text-center">${fmtDateGT(payment.payment_date)}</td>
            <td class="text-center">${fmtDateGT(sched.due_date || '')}</td>
            <td>${payment.payment_method || ''}</td><td>${payment.receipt_number || ''}</td>
            <td class="currency">${fmtQ(principal)}</td><td class="currency">${fmtQ(interest)}</td>
            <td class="currency">${fmtQ(mora)}</td><td class="currency">${fmtQ(adminFees)}</td>
            <td class="currency">${fmtQ(cuotaTotal)}</td><td class="currency">${fmtQ(montoPagado)}</td>
            <td class="text-center">${translateStatus(sched.status || '')}</td><td>${boletaLink}</td>
          </tr>`
        }
        bodyHtml += `<tr style="font-weight:700;background:#f1f5f9;"><td colspan="10" class="text-right">Subtotal Préstamo:</td><td class="currency">${fmtQ(loanTotal)}</td><td colspan="2"></td></tr>`
        bodyHtml += `</tbody></table>`
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      @page { size: A4 landscape; margin: 8mm; }
      td, th { font-size: 8px; padding: 3px 5px; }
    </style></head><body>
      <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Reporte de Pagos por Cliente</strong> — ${dateRangeLabel(from, to)} — Generado: ${now.toLocaleDateString('es-GT')}</div>
      ${bodyHtml}
      <div class="summary-box">RESUMEN EJECUTIVO</div>
      <div style="padding:8px 0;">
        <div class="summary-row"><span class="summary-label">Total Clientes con pagos:</span><span>${totalClientsWithPayments}</span></div>
        <div class="summary-row"><span class="summary-label">Total Pagos Aprobados:</span><span>${grandTotalPayments}</span></div>
        <div class="summary-row"><span class="summary-label">Total Monto Pagado:</span><span>${fmtQ(grandTotalPagado)}</span></div>
      </div>
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Pagos_Por_Cliente_${now.toISOString().slice(0, 10)}.pdf`, true)
  } catch (e: any) {
    console.error('[client-payments PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string | null, to: string | null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Pagos por Cliente</strong> — ${dateRangeLabel(from, to)}</div>
    <p>No hay datos de pagos disponibles.</p></body></html>`,
    `Cooperativa_Pagos_Por_Cliente_${new Date().toISOString().slice(0, 10)}.pdf`, true)
}
