import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { translateStatus } from '@/lib/utils'
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
    if (me.role !== 'admin' && me.role !== 'asesor' && me.role !== 'contador') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: ac } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (ac || []).map((c: any) => String(c.id))
      if (!clientIds.length) return emptyPdf(from, to)
    }

    let loansQ = admin.from('loans')
      .select('id, loan_number, amount, status, client:clients(id, first_name, last_name, phone)')
      .in('status', ['active', 'paid']).order('loan_number', { ascending: true })
    if (me.role === 'asesor' && clientIds.length) loansQ = loansQ.in('client_id', clientIds)
    if (from) loansQ = loansQ.gte('start_date', from)
    if (to) loansQ = loansQ.lte('start_date', to)
    const { data: loans, error: le } = await loansQ
    if (le) return NextResponse.json({ error: le.message }, { status: 500 })
    if (!loans?.length) return emptyPdf(from, to)

    const loanIds = loans.map((l: any) => String(l.id))
    const { data: schedules } = await admin.from('payment_schedule')
      .select('loan_id, principal, interest, mora, admin_fees, paid_amount, status')
      .in('loan_id', loanIds)

    type LS = { loanNumber: string; clientName: string; phone: string; status: string; saldoInicial: number; pagosCapital: number; intPagados: number; moraPagada: number; gastosAdmin: number; saldoActual: number; avance: number }
    const sm = new Map<string, LS>()
    for (const l of loans) {
      const cr: any = l.client; const c: any = Array.isArray(cr) ? cr[0] : cr
      sm.set(String(l.id), { loanNumber: String(l.loan_number), clientName: `${c?.first_name||''} ${c?.last_name||''}`.trim(), phone: c?.phone||'', status: l.status, saldoInicial: Number(l.amount||0), pagosCapital: 0, intPagados: 0, moraPagada: 0, gastosAdmin: 0, saldoActual: Number(l.amount||0), avance: 0 })
    }

    for (const s of (schedules || [])) {
      const e = sm.get(String((s as any).loan_id)); if (!e) continue
      const pa = Number((s as any).paid_amount||0); if (pa <= 0) continue
      const mora = Number((s as any).mora||0), af = Number((s as any).admin_fees||0), int = Number((s as any).interest||0), pr = Number((s as any).principal||0)
      let rem = pa
      const mp = Math.min(rem, mora); rem -= mp; e.moraPagada += mp
      const fp = Math.min(rem, af); rem -= fp; e.gastosAdmin += fp
      const ip = Math.min(rem, int); rem -= ip; e.intPagados += ip
      e.pagosCapital += Math.min(rem, pr)
    }
    for (const e of sm.values()) { e.saldoActual = Math.max(0, e.saldoInicial - e.pagosCapital); e.avance = e.saldoInicial > 0 ? e.pagosCapital / e.saldoInicial : 0 }

    const entries = Array.from(sm.values())
    let sumSI = 0, sumCap = 0, sumInt = 0, sumMora = 0, sumGA = 0, sumSA = 0
    for (const e of entries) { sumSI += e.saldoInicial; sumCap += e.pagosCapital; sumInt += e.intPagados; sumMora += e.moraPagada; sumGA += e.gastosAdmin; sumSA += e.saldoActual }
    const avGlobal = sumSI > 0 ? (sumCap / sumSI * 100).toFixed(2) : '0.00'

    const logo = await getLogoDataUrl()
    const now = new Date()

    let rows = ''
    for (const e of entries) {
      const pct = (e.avance * 100).toFixed(1)
      rows += `<tr><td>${e.loanNumber}</td><td>${e.clientName}</td><td>${e.phone||'—'}</td><td class="currency">${fmtQ(e.saldoInicial)}</td><td class="currency">${fmtQ(e.pagosCapital)}</td><td class="currency">${fmtQ(e.intPagados)}</td><td class="currency">${fmtQ(e.moraPagada)}</td><td class="currency">${fmtQ(e.gastosAdmin)}</td><td class="currency" style="font-weight:700">${fmtQ(e.saldoActual)}</td><td class="text-center">${translateStatus(e.status)}</td><td class="text-center">${pct}%</td></tr>`
    }

    const row = (l: string, v: string) => `<div class="summary-row"><span class="summary-label">${l}</span><span>${v}</span></div>`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      @page{size:A4 landscape;margin:10mm}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
      .kpi-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
      .kpi-label{font-size:9px;color:#64748b;text-transform:uppercase}
      .kpi-value{font-size:16px;font-weight:800;color:#1e293b}
    </style></head><body>
      <div class="header"><div class="header-left">${logo?`<img src="${logo}" class="header-logo"/>`:''}
      <div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Estado de Cuenta General de Préstamos</strong> — ${dateRangeLabel(from,to)} — Generado: ${now.toLocaleDateString('es-GT')}</div>
      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Saldo Inicial Total</div><div class="kpi-value">${fmtQ(sumSI)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Capital Recuperado</div><div class="kpi-value">${fmtQ(sumCap)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Saldo Actual Total</div><div class="kpi-value">${fmtQ(sumSA)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Avance Global</div><div class="kpi-value">${avGlobal}%</div></div>
      </div>
      <table><thead><tr><th>Préstamo</th><th>Cliente</th><th>Tel.</th><th>Saldo Inicial</th><th>Pagos Capital</th><th>Intereses</th><th>Mora</th><th>Gastos Adm.</th><th>Saldo Actual</th><th>Estado</th><th>Avance</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="summary-box">RESUMEN</div>
      <div style="padding:8px 0">
        ${row('Total préstamos', String(entries.length))}
        ${row('Total saldo inicial', fmtQ(sumSI))}
        ${row('Total pagos a capital', fmtQ(sumCap))}
        ${row('Total intereses pagados', fmtQ(sumInt))}
        ${row('Total mora pagada', fmtQ(sumMora))}
        ${row('Total gastos administrativos', fmtQ(sumGA))}
        ${row('Total saldo actual', fmtQ(sumSA))}
        ${row('Avance global', avGlobal + '%')}
      </div>
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Estado_Cuenta_${now.toISOString().slice(0,10)}.pdf`, true)
  } catch (e: any) {
    console.error('[loan-statement PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string|null, to: string|null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo?`<img src="${logo}" class="header-logo"/>`:''}
    <div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Estado de Cuenta</strong> — ${dateRangeLabel(from,to)}</div>
    <p>No hay préstamos disponibles.</p></body></html>`,
    `Cooperativa_Estado_Cuenta_${new Date().toISOString().slice(0,10)}.pdf`, true)
}
