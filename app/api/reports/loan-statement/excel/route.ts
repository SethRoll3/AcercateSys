import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { translateStatus } from "@/lib/utils"
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

    // Get all active + paid loans
    let loansQ = admin.from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, status, start_date, end_date, client:clients(id, first_name, last_name, phone)')
      .in('status', ['active', 'paid'])
      .order('loan_number', { ascending: true })
    if (me.role === 'asesor' && clientIds.length) loansQ = loansQ.in('client_id', clientIds)
    if (from) loansQ = loansQ.gte('start_date', from)
    if (to) loansQ = loansQ.lte('start_date', to)
    const { data: loans, error: le } = await loansQ
    if (le) return NextResponse.json({ error: le.message }, { status: 500 })
    if (!loans?.length) return generateEmptyExcel()

    const loanIds = loans.map((l: any) => String(l.id))

    // Get all schedule items
    const { data: schedules } = await admin.from('payment_schedule')
      .select('loan_id, principal, interest, mora, admin_fees, paid_amount, status')
      .in('loan_id', loanIds)

    // Aggregate per loan
    type LoanStatement = {
      loanNumber: string; clientName: string; phone: string; status: string;
      saldoInicial: number; pagosCapital: number; interesesPagados: number;
      moraPagada: number; gastosAdmin: number; saldoActual: number; avance: number
    }
    const statementsMap = new Map<string, LoanStatement>()

    for (const loan of loans) {
      const cr: any = loan.client; const c: any = Array.isArray(cr) ? cr[0] : cr
      const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim()
      statementsMap.set(String(loan.id), {
        loanNumber: String(loan.loan_number),
        clientName: name,
        phone: c?.phone || '',
        status: loan.status,
        saldoInicial: Number(loan.amount || 0),
        pagosCapital: 0, interesesPagados: 0, moraPagada: 0, gastosAdmin: 0,
        saldoActual: Number(loan.amount || 0), avance: 0
      })
    }

    // Process each schedule entry using waterfall: Mora → Admin → Interest → Capital
    for (const s of (schedules || [])) {
      const entry = statementsMap.get(String((s as any).loan_id))
      if (!entry) continue

      const paidAmt = Number((s as any).paid_amount || 0)
      if (paidAmt <= 0) continue

      const mora = Number((s as any).mora || 0)
      const adminFees = Number((s as any).admin_fees || 0)
      const interest = Number((s as any).interest || 0)
      const principal = Number((s as any).principal || 0)

      let rem = paidAmt
      // 1. Mora
      const moraPaid = Math.min(rem, mora); rem -= moraPaid; entry.moraPagada += moraPaid
      // 2. Admin fees
      const feesPaid = Math.min(rem, adminFees); rem -= feesPaid; entry.gastosAdmin += feesPaid
      // 3. Interest
      const intPaid = Math.min(rem, interest); rem -= intPaid; entry.interesesPagados += intPaid
      // 4. Capital
      const capPaid = Math.min(rem, principal); entry.pagosCapital += capPaid
    }

    // Calculate final balances
    for (const entry of statementsMap.values()) {
      entry.saldoActual = Math.max(0, entry.saldoInicial - entry.pagosCapital)
      entry.avance = entry.saldoInicial > 0 ? entry.pagosCapital / entry.saldoInicial : 0
    }

    const entries = Array.from(statementsMap.values())

    // Generate Excel
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Estado de Cuenta')
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

    ws.mergeCells('A1:K1')
    ws.getCell('A1').value = 'Estado de Cuenta General de Préstamos'
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 65 } })
    ws.getRow(1).height = 60

    const rangeLabel = from && to ? `Período: ${fmtDate(from)} — ${fmtDate(to)}` : 'Todos los datos (sin filtro de fecha)'
    ws.mergeCells('A2:K2')
    ws.getCell('A2').value = rangeLabel
    ws.getCell('A2').font = { italic: true, size: 11, color: { argb: '64748B' } }
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }

    ws.getCell('K3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
    ws.addRow([])

    const headers = [
      'No. Préstamo', 'Cliente', 'Teléfono', 'Saldo Inicial',
      'Pagos Capital', 'Intereses', 'Mora', 'Gastos Admin.',
      'Saldo Actual', 'Estado', '% Avance'
    ]
    const hr = ws.addRow(headers)
    hr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    const currencyFmt = '"Q"#,##0.00'
    const percentFmt = '0.00%'

    let sumSaldoInicial = 0, sumCapital = 0, sumIntereses = 0, sumMora = 0, sumGastos = 0, sumSaldoActual = 0
    for (const e of entries) {
      sumSaldoInicial += e.saldoInicial; sumCapital += e.pagosCapital; sumIntereses += e.interesesPagados
      sumMora += e.moraPagada; sumGastos += e.gastosAdmin; sumSaldoActual += e.saldoActual

      const r = ws.addRow([
        e.loanNumber, e.clientName, e.phone,
        e.saldoInicial, e.pagosCapital, e.interesesPagados,
        e.moraPagada, e.gastosAdmin, e.saldoActual,
        translateStatus(e.status), e.avance
      ])
      ;[4,5,6,7,8,9].forEach(i => { r.getCell(i).numFmt = currencyFmt })
      r.getCell(11).numFmt = percentFmt
    }

    // Summary
    ws.addRow([])
    const sh = ws.addRow(['RESUMEN EJECUTIVO'])
    sh.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green } }
    sh.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    ws.mergeCells(sh.number, 1, sh.number, 11)
    ws.addRow([])

    const avanceGlobal = sumSaldoInicial > 0 ? sumCapital / sumSaldoInicial : 0
    const sumRows: [string, number, boolean][] = [
      ['Total préstamos', entries.length, false],
      ['Total saldo inicial', sumSaldoInicial, true],
      ['Total pagos a capital', sumCapital, true],
      ['Total intereses pagados', sumIntereses, true],
      ['Total mora pagada', sumMora, true],
      ['Total gastos administrativos', sumGastos, true],
      ['Total saldo actual', sumSaldoActual, true],
    ]
    for (const [label, value, isCurrency] of sumRows) {
      const r = ws.addRow([label, value])
      r.getCell(1).font = { bold: true }
      r.getCell(2).numFmt = isCurrency ? currencyFmt : '#,##0'
    }
    const avRow = ws.addRow(['Avance global de recuperación', avanceGlobal])
    avRow.getCell(1).font = { bold: true }
    avRow.getCell(2).numFmt = percentFmt

    ws.columns = [
      { width: 18 },{ width: 28 },{ width: 14 },{ width: 16 },
      { width: 16 },{ width: 16 },{ width: 14 },{ width: 16 },
      { width: 16 },{ width: 14 },{ width: 12 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const rh = new Headers()
    rh.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    rh.append('Content-Disposition', `attachment; filename="Cooperativa_Estado_Cuenta_${new Date().toISOString().slice(0,10)}.xlsx"`)
    return new NextResponse(new Uint8Array(buffer), { headers: rh })
  } catch (e: any) {
    console.error('[loan-statement excel]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

function fmtDate(ymd: string): string { const [y,m,d] = ymd.split('-'); return `${d}/${m}/${y}` }

async function generateEmptyExcel() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Estado de Cuenta')
  ws.mergeCells('A1:K1')
  ws.getCell('A1').value = 'Estado de Cuenta General de Préstamos'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } }
  ws.getRow(1).height = 60
  ws.addRow([])
  ws.mergeCells('A3:K3')
  ws.getCell('A3').value = 'No hay préstamos disponibles'
  ws.getCell('A3').alignment = { horizontal: 'center' }
  ws.getCell('A3').font = { bold: true, size: 12 }
  const buf = await wb.xlsx.writeBuffer()
  const h = new Headers()
  h.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  h.append('Content-Disposition', `attachment; filename="Cooperativa_Estado_Cuenta_${new Date().toISOString().slice(0,10)}.xlsx"`)
  return new NextResponse(new Uint8Array(buf), { headers: h })
}
