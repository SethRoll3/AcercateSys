import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"
import path from "path"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (me.role !== 'admin' && me.role !== 'asesor' && me.role !== 'contador') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: ac } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (ac || []).map((c: any) => String(c.id))
      if (!clientIds.length) return generateEmptyExcel()
    }

    // Get active loans
    let loansQuery = admin.from('loans')
      .select('id, loan_number, amount, interest_rate, status, client:clients(id, first_name, last_name)')
      .eq('status', 'active')
    if (me.role === 'asesor' && clientIds.length) loansQuery = loansQuery.in('client_id', clientIds)
    const { data: loans, error: le } = await loansQuery
    if (le) return NextResponse.json({ error: le.message }, { status: 500 })
    if (!loans?.length) return generateEmptyExcel()

    const loanIds = loans.map((l: any) => String(l.id))

    // Get all schedule items for these loans
    let schedQuery = admin.from('payment_schedule')
      .select('loan_id, interest, paid_amount, principal, mora, admin_fees, status, due_date')
      .in('loan_id', loanIds)
    if (from) schedQuery = schedQuery.gte('due_date', from)
    if (to) schedQuery = schedQuery.lte('due_date', to)
    const { data: schedules, error: se } = await schedQuery
    if (se) return NextResponse.json({ error: se.message }, { status: 500 })

    // Aggregate per loan
    type LoanInterest = {
      loanNumber: string; clientName: string; loanAmount: number; interestRate: number;
      interestTotal: number; interestCollected: number; interestReceivable: number
    }
    const loanMap = new Map<string, LoanInterest>()
    for (const loan of loans) {
      const cr: any = loan.client; const c: any = Array.isArray(cr) ? cr[0] : cr
      const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim()
      loanMap.set(String(loan.id), {
        loanNumber: String(loan.loan_number),
        clientName: name,
        loanAmount: Number(loan.amount || 0),
        interestRate: Number(loan.interest_rate || 0),
        interestTotal: 0, interestCollected: 0, interestReceivable: 0
      })
    }

    for (const s of (schedules || [])) {
      const entry = loanMap.get(String((s as any).loan_id))
      if (!entry) continue
      const interest = Number((s as any).interest || 0)
      const paidAmt = Number((s as any).paid_amount || 0)
      const mora = Number((s as any).mora || 0)
      const adminFees = Number((s as any).admin_fees || 0)

      entry.interestTotal += interest

      // Calculate interest collected: paid_amount applied in order Mora → Admin → Interest → Principal
      if (String((s as any).status) === 'paid' || paidAmt > 0) {
        let rem = paidAmt
        rem -= Math.min(rem, mora)
        rem -= Math.min(rem, adminFees)
        const intPaid = Math.min(rem, interest)
        entry.interestCollected += intPaid
      }
    }

    // Calculate receivable
    for (const entry of loanMap.values()) {
      entry.interestReceivable = Math.max(0, entry.interestTotal - entry.interestCollected)
    }

    const entries = Array.from(loanMap.values()).filter(e => e.interestTotal > 0)
    if (!entries.length) return generateEmptyExcel()

    // Generate Excel
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Intereses por Cobrar')
    const blue = '2563EB'
    const lightBlue = '3B82F6'
    const green = '059669'

    // Logo
    const publicDir = path.join(process.cwd(), 'public')
    const logoCandidates = ['logoCooperativaConTexto.jpg','logoCooperativa.jpg','logoCooperativaSinTexto.png','logoCooperativaSinTextoSinFondo.png','logoCooperativa.png']
    let logoImageId: number | null = null
    for (const name of logoCandidates) {
      try { logoImageId = workbook.addImage({ filename: path.join(publicDir, name), extension: path.extname(name).toLowerCase() === '.png' ? 'png' : 'jpeg' }); break } catch {}
    }

    ws.mergeCells('A1:G1')
    ws.getCell('A1').value = 'Reporte Mensual de Intereses por Cobrar'
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 65 } })
    ws.getRow(1).height = 60

    const rangeLabel = from && to ? `Período: ${fmtDate(from)} — ${fmtDate(to)}` : 'Todos los datos (sin filtro de fecha)'
    ws.mergeCells('A2:G2')
    ws.getCell('A2').value = rangeLabel
    ws.getCell('A2').font = { italic: true, size: 11, color: { argb: '64748B' } }
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }

    ws.getCell('G3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
    ws.addRow([])

    const headers = ['No. Préstamo', 'Cliente', 'Monto Préstamo', 'Tasa Interés', 'Interés Total', 'Interés Cobrado', 'Interés por Cobrar']
    const hr = ws.addRow(headers)
    hr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    const currencyFmt = '"Q"#,##0.00'
    const percentFmt = '0.00%'

    let sumTotal = 0, sumCollected = 0, sumReceivable = 0
    for (const e of entries) {
      sumTotal += e.interestTotal; sumCollected += e.interestCollected; sumReceivable += e.interestReceivable
      const r = ws.addRow([e.loanNumber, e.clientName, e.loanAmount, e.interestRate / 100, e.interestTotal, e.interestCollected, e.interestReceivable])
      r.getCell(3).numFmt = currencyFmt
      r.getCell(4).numFmt = percentFmt
      r.getCell(5).numFmt = currencyFmt
      r.getCell(6).numFmt = currencyFmt
      r.getCell(7).numFmt = currencyFmt
    }

    // Summary
    ws.addRow([])
    const sh = ws.addRow(['RESUMEN'])
    sh.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green } }
    sh.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    ws.mergeCells(sh.number, 1, sh.number, 7)
    ws.addRow([])

    const sumRows: [string, number][] = [
      ['Total préstamos analizados', entries.length],
      ['Interés total programado', sumTotal],
      ['Interés cobrado', sumCollected],
      ['Interés por cobrar', sumReceivable],
    ]
    for (let i = 0; i < sumRows.length; i++) {
      const r = ws.addRow([sumRows[i][0], sumRows[i][1]])
      r.getCell(1).font = { bold: true }
      if (i >= 1) r.getCell(2).numFmt = currencyFmt
    }

    ws.columns = [{ width: 18 },{ width: 30 },{ width: 18 },{ width: 14 },{ width: 18 },{ width: 18 },{ width: 18 }]

    const buffer = await workbook.xlsx.writeBuffer()
    const rh = new Headers()
    rh.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    rh.append('Content-Disposition', `attachment; filename="Cooperativa_Intereses_Por_Cobrar_${new Date().toISOString().slice(0,10)}.xlsx"`)
    return new NextResponse(new Uint8Array(buffer), { headers: rh })
  } catch (e: any) {
    console.error('[interest-receivable excel]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

function fmtDate(ymd: string): string { const [y,m,d] = ymd.split('-'); return `${d}/${m}/${y}` }

async function generateEmptyExcel() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Intereses por Cobrar')
  ws.mergeCells('A1:G1')
  ws.getCell('A1').value = 'Reporte Mensual de Intereses por Cobrar'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } }
  ws.getRow(1).height = 60
  ws.addRow([])
  ws.mergeCells('A3:G3')
  ws.getCell('A3').value = 'No hay datos de intereses disponibles'
  ws.getCell('A3').alignment = { horizontal: 'center' }
  ws.getCell('A3').font = { bold: true, size: 12 }
  const buf = await wb.xlsx.writeBuffer()
  const h = new Headers()
  h.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  h.append('Content-Disposition', `attachment; filename="Cooperativa_Intereses_Por_Cobrar_${new Date().toISOString().slice(0,10)}.xlsx"`)
  return new NextResponse(new Uint8Array(buf), { headers: h })
}
