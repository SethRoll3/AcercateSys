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
    if (me.role !== 'admin' && me.role !== 'asesor' && me.role !== 'contador') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: ac } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (ac || []).map((c: any) => String(c.id))
      if (!clientIds.length) return emptyPdf(from, to)
    }

    let loansQ = admin.from('loans').select('id, loan_number, amount, interest_rate, client:clients(id, first_name, last_name)').eq('status', 'active')
    if (me.role === 'asesor' && clientIds.length) loansQ = loansQ.in('client_id', clientIds)
    const { data: loans, error: le } = await loansQ
    if (le) return NextResponse.json({ error: le.message }, { status: 500 })
    if (!loans?.length) return emptyPdf(from, to)

    const loanIds = loans.map((l: any) => String(l.id))
    let schedQ = admin.from('payment_schedule').select('loan_id, interest, paid_amount, principal, mora, admin_fees, status, due_date').in('loan_id', loanIds)
    if (from) schedQ = schedQ.gte('due_date', from)
    if (to) schedQ = schedQ.lte('due_date', to)
    const { data: schedules } = await schedQ

    type LI = { loanNumber: string; clientName: string; loanAmount: number; rate: number; intTotal: number; intCollected: number; intReceivable: number }
    const loanMap = new Map<string, LI>()
    for (const l of loans) {
      const cr: any = l.client; const c: any = Array.isArray(cr) ? cr[0] : cr
      loanMap.set(String(l.id), { loanNumber: String(l.loan_number), clientName: `${c?.first_name||''} ${c?.last_name||''}`.trim(), loanAmount: Number(l.amount||0), rate: Number(l.interest_rate||0), intTotal: 0, intCollected: 0, intReceivable: 0 })
    }
    for (const s of (schedules || [])) {
      const e = loanMap.get(String((s as any).loan_id)); if (!e) continue
      const interest = Number((s as any).interest||0)
      const paidAmt = Number((s as any).paid_amount||0)
      e.intTotal += interest
      if (paidAmt > 0) {
        let rem = paidAmt; rem -= Math.min(rem, Number((s as any).mora||0)); rem -= Math.min(rem, Number((s as any).admin_fees||0))
        e.intCollected += Math.min(rem, interest)
      }
    }
    for (const e of loanMap.values()) e.intReceivable = Math.max(0, e.intTotal - e.intCollected)

    const entries = Array.from(loanMap.values()).filter(e => e.intTotal > 0)
    if (!entries.length) return emptyPdf(from, to)

    let sumTotal = 0, sumCol = 0, sumRec = 0
    for (const e of entries) { sumTotal += e.intTotal; sumCol += e.intCollected; sumRec += e.intReceivable }

    const logo = await getLogoDataUrl()
    const now = new Date()

    let rows = ''
    for (const e of entries) {
      rows += `<tr><td>${e.loanNumber}</td><td>${e.clientName}</td><td class="currency">${fmtQ(e.loanAmount)}</td><td class="text-center">${e.rate}%</td><td class="currency">${fmtQ(e.intTotal)}</td><td class="currency">${fmtQ(e.intCollected)}</td><td class="currency" style="font-weight:700;color:#dc2626">${fmtQ(e.intReceivable)}</td></tr>`
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}
      .kpi-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
      .kpi-label{font-size:9px;color:#64748b;text-transform:uppercase}
      .kpi-value{font-size:16px;font-weight:800;color:#1e293b}
      .kpi-value.danger{color:#dc2626}
    </style></head><body>
      <div class="header"><div class="header-left">${logo?`<img src="${logo}" class="header-logo"/>`:''}
      <div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Reporte Mensual de Intereses por Cobrar</strong> — ${dateRangeLabel(from,to)} — Generado: ${now.toLocaleDateString('es-GT')}</div>
      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Interés Total Programado</div><div class="kpi-value">${fmtQ(sumTotal)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Interés Cobrado</div><div class="kpi-value">${fmtQ(sumCol)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Interés por Cobrar</div><div class="kpi-value danger">${fmtQ(sumRec)}</div></div>
      </div>
      <table><thead><tr><th>Préstamo</th><th>Cliente</th><th>Monto</th><th>Tasa</th><th>Interés Total</th><th>Cobrado</th><th>Por Cobrar</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Intereses_Por_Cobrar_${now.toISOString().slice(0,10)}.pdf`)
  } catch (e: any) {
    console.error('[interest-receivable PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string|null, to: string|null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo?`<img src="${logo}" class="header-logo"/>`:''}
    <div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Intereses por Cobrar</strong> — ${dateRangeLabel(from,to)}</div>
    <p>No hay datos de intereses disponibles.</p></body></html>`,
    `Cooperativa_Intereses_Por_Cobrar_${new Date().toISOString().slice(0,10)}.pdf`)
}
