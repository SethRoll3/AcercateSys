import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import puppeteer from "puppeteer"
import type { Browser } from "puppeteer"
import path from "path"
import { promises as fs } from "fs"

export async function GET(_req: Request, { params }: { params: Promise<{ loanId: string }> }) {
  let browser: Browser | null = null
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { loanId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const { data: loanRow } = await admin
      .from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, monthly_payment, status, start_date, end_date, client:clients(id, first_name, last_name, email, phone)')
      .eq('id', loanId)
      .single()
    if (!loanRow) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

    const clientObj = Array.isArray(loanRow.client) ? loanRow.client[0] : loanRow.client
    if (me.role === 'cliente' && clientObj?.email !== me.email) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    if (me.role === 'asesor') {
      const { data: advisorClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      const ids = (advisorClients || []).map((c: any) => c.id)
      if (!ids.includes(clientObj?.id)) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { data: schedule } = await admin
      .from('payment_schedule')
      .select('payment_number, due_date, amount, principal, interest, mora, admin_fees, status')
      .eq('loan_id', loanId)
      .order('payment_number', { ascending: true })

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

    const n = Number(loanRow.term_months || 0)
    const amount = Number(loanRow.amount || 0)
    const monthlyRate = Number(loanRow.interest_rate || 0) / 100
    const capitalMes = Math.round((amount / n) * 100) / 100
    const interesMes = Math.round((amount * monthlyRate) * 100) / 100
    const adminFees = 20
    const cuotaBase = Math.round((capitalMes + interesMes + adminFees) * 100) / 100
    const totalBase = Math.round((cuotaBase * n) * 100) / 100

    let saldoTotal = totalBase
    const rowsHtml = (schedule || []).map((s: any) => {
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

    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; }
          .header { display:flex; align-items:center; gap:16px; background:#2563EB; color:#fff; padding:12px 16px; }
          .title { font-size:18px; font-weight:bold; }
          .meta { padding:8px 16px; background:#F3F4F6; }
          .breakdown { padding:8px 16px; font-size:12px; }
          table { width:100%; border-collapse:collapse; margin-top:16px; }
          th, td { border:1px solid #CBD5E1; padding:8px; font-size:12px; }
          th { background:#3B82F6; color:#fff; }
      </style>
      </head>
      <body>
        <div class="header">
          ${logo ? `<img src="${logo}" alt="acercate" style="height:40px"/>` : ''}
          <div class="title">Acercate - Plan ${loanRow.loan_number}</div>
        </div>
        <div class="meta">Cliente: ${(clientObj?.first_name || '')} ${(clientObj?.last_name || '')}</div>
        <div class="meta">Monto prestado: ${currency(amount)}</div>
        <div class="breakdown">
          <div><strong>Capital mensual:</strong> ${currency(capitalMes)} | <strong>Interés mensual:</strong> ${currency(interesMes)} | <strong>Aporte:</strong> ${currency(adminFees)}</div>
          <div><strong>Cuota base mensual:</strong> ${currency(cuotaBase)} | <strong>Total del préstamo (sin mora):</strong> ${currency(totalBase)} | + mora si aplica</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cuota #</th><th>Fecha de Vencimiento</th><th>Monto a Pagar</th><th>Capital</th><th>Interés</th><th>Mora</th><th>Gastos Adm.</th><th>Saldo por Pagar</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
    </html>`

    browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' } })
    await browser.close()
    browser = null

    const ts = new Date().toISOString().slice(0,10)
    const h = new Headers()
    h.append('Content-Type','application/pdf')
    h.append('Content-Disposition', `attachment; filename="Acercate_Plan_${loanRow.loan_number}_${ts}.pdf"`)
    return new NextResponse(new Uint8Array(pdf), { headers: h })
  } catch (e: any) {
    if (browser) await browser.close()
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}