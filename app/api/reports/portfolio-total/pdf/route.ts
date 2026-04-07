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

    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return emptyPdf(from, to)
    }

    let loansQuery = admin.from('loans').select('id, amount, status, client:clients(*)').in('status', ['active', 'paid'])
    if (me.role === 'asesor' && clientIds.length) loansQuery = loansQuery.in('client_id', clientIds)
    if (from) loansQuery = loansQuery.gte('start_date', from)
    if (to) loansQuery = loansQuery.lte('start_date', to)

    const { data: loans, error: loansError } = await loansQuery
    if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 })
    if (!loans?.length) return emptyPdf(from, to)

    const loanIds = loans.map((l: any) => String(l.id))

    const { data: schedules } = await admin
      .from('payment_schedule')
      .select('loan_id, amount, principal, interest, admin_fees, mora, paid_amount, status, due_date')
      .in('loan_id', loanIds)

    const gtTodayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
    const parseYMD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
    const todayGT = parseYMD(gtTodayYMD)

    const activeLoansList = loans.filter((l: any) => l.status === 'active')
    const activeLoanIds = new Set(activeLoansList.map((l: any) => l.id))
    const totalPrestado = activeLoansList.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0)

    let totalCapitalRecuperado = 0, totalInteresesEsperados = 0, totalInteresesRecuperados = 0
    let cuotasTotales = 0, cuotasPagadas = 0, cuotasPendientes = 0, cuotasEnMora = 0

    for (const s of (schedules || [])) {
      const isActive = activeLoanIds.has((s as any).loan_id)
      const principal = Number((s as any).principal || 0)
      const interest = Number((s as any).interest || 0)
      const mora = Number((s as any).mora || 0)
      const adminFees = Number((s as any).admin_fees || 0)
      const paidAmt = Number((s as any).paid_amount || 0)

      cuotasTotales++
      if (String((s as any).status) === 'paid') cuotasPagadas++
      else {
        cuotasPendientes++
        const dueStr = String((s as any).due_date || '')
        if (dueStr && todayGT.getTime() > parseYMD(dueStr.slice(0, 10)).getTime()) cuotasEnMora++
      }

      if (isActive) {
        totalInteresesEsperados += interest
        let rem = paidAmt
        rem -= Math.min(rem, mora)
        rem -= Math.min(rem, adminFees)
        const intPaid = Math.min(rem, interest); rem -= intPaid; totalInteresesRecuperados += intPaid
        totalCapitalRecuperado += Math.min(rem, principal)
      }
    }

    const saldoPendiente = totalPrestado - totalCapitalRecuperado
    const totalInteresesPorPagar = Math.max(0, totalInteresesEsperados - totalInteresesRecuperados)
    const recuperacionPct = totalPrestado > 0 ? (totalCapitalRecuperado / totalPrestado * 100) : 0
    const activos = activeLoansList.length
    const pagados = loans.filter((l: any) => l.status === 'paid').length
    const ticketPromedio = activos > 0 ? totalPrestado / activos : 0

    const clientsSet = new Set<string>()
    let mujeres = 0, hombres = 0
    for (const l of loans) {
      const cRaw: any = (l as any).client
      const c: any = Array.isArray(cRaw) ? cRaw[0] : cRaw
      const cid = String(c?.id || '')
      if (cid && !clientsSet.has(cid)) {
        clientsSet.add(cid)
        const g = String(c?.gender || '').toLowerCase()
        if (g === 'mujer') mujeres++
        else if (g === 'hombre') hombres++
      }
    }

    const logo = await getLogoDataUrl()
    const now = new Date()

    const row = (label: string, value: string) => `<div class="summary-row"><span class="summary-label">${label}</span><span>${value}</span></div>`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      .kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
      .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
      .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; }
      .kpi-value { font-size: 18px; font-weight: 800; color: #1e293b; }
    </style></head><body>
      <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div><div class="header-sub">Sistema de Gestión de Préstamos</div></div></div></div>
      <div class="divider"></div>
      <div class="meta"><strong>Total Cartera</strong> — ${dateRangeLabel(from, to)} — Generado: ${now.toLocaleDateString('es-GT')}</div>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Total Prestado (activos)</div><div class="kpi-value">${fmtQ(totalPrestado)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Capital Recuperado</div><div class="kpi-value">${fmtQ(totalCapitalRecuperado)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Saldo Pendiente</div><div class="kpi-value">${fmtQ(saldoPendiente)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Intereses Recuperados</div><div class="kpi-value">${fmtQ(totalInteresesRecuperados)}</div></div>
      </div>

      <div class="summary-box">DETALLE</div>
      <div style="padding:8px 0;">
        ${row('Intereses por pagar', fmtQ(totalInteresesPorPagar))}
        ${row('Total clientes', String(clientsSet.size))}
        ${row('Mujeres', String(mujeres))}
        ${row('Hombres', String(hombres))}
        ${row('Total préstamos', String(loans.length))}
        ${row('Activos', String(activos))}
        ${row('Pagados', String(pagados))}
        ${row('Cuotas totales', String(cuotasTotales))}
        ${row('Cuotas pagadas', String(cuotasPagadas))}
        ${row('Cuotas pendientes', String(cuotasPendientes))}
        ${row('Cuotas en mora', String(cuotasEnMora))}
        ${row('Recuperación', `${recuperacionPct.toFixed(2)}%`)}
        ${row('Ticket promedio', fmtQ(ticketPromedio))}
      </div>
      <div class="footer">Reporte generado por el sistema Acercate.</div>
    </body></html>`

    return htmlToPdfResponse(html, `Cooperativa_Total_Cartera_${now.toISOString().slice(0, 10)}.pdf`)
  } catch (e: any) {
    console.error('[portfolio-total PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function emptyPdf(from: string | null, to: string | null) {
  const logo = await getLogoDataUrl()
  return htmlToPdfResponse(`<html><head><style>${reportCSS}</style></head><body>
    <div class="header"><div class="header-left">${logo ? `<img src="${logo}" class="header-logo"/>` : ''}<div><div class="header-title">ACERCATE</div></div></div></div>
    <div class="divider"></div><div class="meta"><strong>Total Cartera</strong> — ${dateRangeLabel(from, to)}</div>
    <p>No hay datos disponibles.</p></body></html>`,
    `Cooperativa_Total_Cartera_${new Date().toISOString().slice(0, 10)}.pdf`)
}
