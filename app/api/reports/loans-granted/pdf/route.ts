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
    if (me.role !== 'admin' && me.role !== 'asesor' && me.role !== 'contador') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: ac } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (ac || []).map((c: any) => String(c.id))
      if (!clientIds.length) return emptyPdf(from, to)
    }

    let q = admin.from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, monthly_payment, payment_frequency, status, start_date, end_date, client:clients(id, first_name, last_name, phone)')
      .in('status', ['active', 'paid']).order('start_date', { ascending: false })
    if (me.role === 'asesor' && clientIds.length) q = q.in('client_id', clientIds)
    if (from) q = q.gte('start_date', from)
    if (to) q = q.lte('start_date', to)

    const { data: loans, error: le } = await q
    if (le) return NextResponse.json({ error: le.message }, { status: 500 })
    if (!loans?.length) return emptyPdf(from, to)

    let totalMonto = 0, countActive = 0, countPaid = 0
    for (const l of loans) { totalMonto += Number(l.amount || 0); if (l.status === 'active') countActive++; else countPaid++ }
    const avg = loans.length > 0 ? totalMonto / loans.length : 0

    const logo = await getLogoDataUrl()
    const now = new Date()

    let rows = ''
    for (const l of loans) {
      const cr: any = l.client; const c: any = Array.isArray(cr) ? cr[0] : cr
      const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim()
      const freq = l.payment_frequency === 'quincenal' ? 'Quincenal' : 'Mensual'
      rows += `<tr><td>${l.loan_number}</td><td>${name}</td><td>${c?.phone || '—'}</td><td class="currency">${fmtQ(Number(l.amount||0))}</td><td class="text-center">${Number(l.interest_rate||0)}%</td><td class="text-center">${l.term_months}</td><td class="text-center">${freq}</td><td class="currency">${fmtQ(Number(l.monthly_payment||0))}</td><td class="text-center">${translateStatus(l.status)}</td><td class="text-center">${fmtDateGT(l.start_date)}</td><td class="text-center">${fmtDateGT(l.end_date)}</td></tr>`
    }

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
      <div class="meta"><strong>Reporte Mensual de Préstamos Otorgados</strong> — ${dateRangeLabel(from,to)} — Generado: ${now.toLocaleDateString('es-GT')}</div>
      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Total Préstamos</div><div class="kpi-value">${loans.length}</div></div>
        <div class="kpi-box"><div class="kpi-label">Monto Otorgado</div><div class="kpi-value">${fmtQ(totalMonto)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Activos / Pagados</div><div class="kpi-value">${countActive} / ${countPaid}</div></div>
        <div class="kpi-box"><div class="kpi-label">Monto Promedio</div><div class="kpi-value">${fmtQ(avg)}</div></div>
      </div>
      <table><thead><tr><th>Préstamo</th><th>Cliente</th><th>Tel.</th><th>Monto</th><th>Tasa</th><th>Plazo</th><th>Frec.</th><th>Cuota</th><th>Estado</th><th>Inicio</th><th>Fin</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Prestamos_Otorgados_${now.toISOString().slice(0,10)}.pdf`, true)
  } catch (e: any) {
    console.error('[loans-granted PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string|null, to: string|null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo?`<img src="${logo}" class="header-logo"/>`:''}
    <div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Préstamos Otorgados</strong> — ${dateRangeLabel(from,to)}</div>
    <p>No hay préstamos otorgados en el período seleccionado.</p></body></html>`,
    `Cooperativa_Prestamos_Otorgados_${new Date().toISOString().slice(0,10)}.pdf`, true)
}
