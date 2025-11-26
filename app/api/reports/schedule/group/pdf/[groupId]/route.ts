import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import puppeteer from "puppeteer"
import type { Browser } from "puppeteer"
import path from "path"
import { promises as fs } from "fs"

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  let browser: Browser | null = null
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { groupId } = await params
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const { data: lgRows } = await admin
      .from('loans_groups')
      .select('group_id, group:grupos(nombre), loans')
      .eq('group_id', groupId)
      .limit(1)
    const row = Array.isArray(lgRows) ? lgRows[0] : null
    const loanIds = (row?.loans || []).map((e: any) => e.loan_id)
    if (!loanIds.length) return NextResponse.json({ error: 'No loans in group' }, { status: 404 })

    const { data: loans } = await admin
      .from('loans')
      .select('id, loan_number, amount, term_months, interest_rate, client:clients(id, first_name, last_name)')
      .in('id', loanIds)
    const { data: schedules } = await admin
      .from('payment_schedule')
      .select('loan_id, payment_number, due_date, amount, principal, interest, mora, admin_fees, status')
      .in('loan_id', loanIds)

    async function fileToDataUrl(p: string): Promise<string | null> {
      try {
        const data = await fs.readFile(p)
        const base64 = Buffer.from(data).toString('base64')
        const ext = path.extname(p).toLowerCase()
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
        return `data:${mime};base64,${base64}`
      } catch { return null }
    }
    const publicDir = path.join(process.cwd(), 'public')
    const logo = await (async () => {
      for (const name of ['logoCooperativaSinTexto.png','logoCooperativaSinTexto.jpg','logoCooperativa.png','logoCooperativa.jpg']) {
        const p = path.join(publicDir, name)
        const url = await fileToDataUrl(p)
        if (url) return url
      }
      return null
    })()

    const currency = (n: number) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n)
    const date = (d: string) => new Date(d).toLocaleDateString('es-GT')

    function sectionHtml(loan: any, rows: any[]) {
      const termMonths = Number(loan.term_months || 0)
      const amount = Number(loan.amount || 0)
      const monthlyRate = Number(loan.interest_rate || 0) / 100
      const capitalMes = Math.round(((termMonths > 0 ? amount / termMonths : 0)) * 100) / 100
      const interesMes = Math.round((amount * monthlyRate) * 100) / 100
      const adminFees = Number(rows[0]?.admin_fees ?? 20)
      const firstRow = rows[0]
      const cuotaBase = firstRow ? Math.round(((Number(firstRow.principal||0)) + (Number(firstRow.interest||0)) + adminFees) * 100) / 100 : Math.round((capitalMes + interesMes + adminFees) * 100) / 100
      const isQuincenal = (() => {
        if (!rows || rows.length < 2) return false
        const d1 = new Date(rows[0].due_date as any)
        const d2 = new Date(rows[1].due_date as any)
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000)
        return diffDays === 15
      })()
      const totalBase = Math.round((cuotaBase * rows.length) * 100) / 100

      let saldoTotal = totalBase
      const trs = rows.map((s) => {
        const total = Number(s.amount || 0) + Number(s.mora || 0)
        saldoTotal = Math.max(0, Math.round((saldoTotal - (cuotaBase + Number(s.mora || 0))) * 100) / 100)
        return `<tr>
          <td>${s.payment_number}</td>
          <td>${date(s.due_date)}</td>
          <td>${currency(total)}</td>
          <td>${currency(Number(s.principal || 0))}</td>
          <td>${currency(Number(s.interest || 0))}</td>
          <td>${currency(Number(s.mora || 0))}</td>
          <td>${currency(Number(s.admin_fees || 0))}</td>
          <td>${currency(saldoTotal)}</td>
          <td>${s.status}</td>
        </tr>`
      }).join('')
      return `<div style="page-break-after:always"> 
        <div class="subheader">Cliente: ${(loan.client?.first_name || '')} ${(loan.client?.last_name || '')} — Plan ${loan.loan_number}</div>
        <div class="meta">Monto prestado: ${currency(amount)}</div>
        <div class="breakdown">
          <div><strong>Capital mensual:</strong> ${currency(capitalMes)} | <strong>Interés mensual:</strong> ${currency(interesMes)} | <strong>Aporte:</strong> ${currency(adminFees)}</div>
          <div><strong>Cuota base ${isQuincenal ? 'quincenal' : 'mensual'}:</strong> ${currency(cuotaBase)} | <strong>Total del préstamo (sin mora):</strong> ${currency(totalBase)} | + mora si aplica</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cuota #</th><th>Fecha de Vencimiento</th><th>Monto a Pagar</th><th>Capital</th><th>Interés</th><th>Mora</th><th>Gastos Adm.</th><th>Saldo por Pagar</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`
    }

    const bodySections = (loans || []).map((loan) => {
      const rows = (schedules || []).filter((s: any) => s.loan_id === loan.id)
      return sectionHtml(loan, rows)
    }).join('')

    const groupTotal = (loans || []).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0)
    const getGroupName = (grp: any) => {
      const g = Array.isArray(grp) ? grp[0] : grp
      return g?.nombre || ''
    }
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; }
        .header { display:flex; align-items:center; gap:16px; background:#2563EB; color:#fff; padding:12px 16px; }
        .title { font-size:18px; font-weight:bold; }
        .meta { padding:8px 16px; background:#F3F4F6; }
        .subheader { font-weight:bold; margin-top:12px; }
        .breakdown { padding:8px 16px; font-size:12px; }
        table { width:100%; border-collapse:collapse; margin-top:8px; }
        th, td { border:1px solid #CBD5E1; padding:6px; font-size:12px; }
        th { background:#3B82F6; color:#fff; }
      </style>
    </head>
    <body>
      <div class="header">${logo ? `<img src="${logo}" alt="acercate" style="height:40px"/>` : ''}<div class="title">Acercate - Planes del Grupo ${getGroupName(row?.group)}</div></div>
      <div class="meta">Total préstamos: ${(loans || []).length} | Total prestado del grupo: ${currency(groupTotal)}</div>
      ${bodySections}
    </body></html>`

    browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' } })
    await browser.close(); browser = null

    const h = new Headers()
    h.append('Content-Type','application/pdf')
    const ts = new Date().toISOString().slice(0,10)
    h.append('Content-Disposition', `attachment; filename="Acercate_Plan_Grupo_${getGroupName(row?.group) || groupId}_${ts}.pdf"`)
    return new NextResponse(new Uint8Array(pdf), { headers: h })
  } catch (e: any) {
    if (browser) await browser.close()
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
