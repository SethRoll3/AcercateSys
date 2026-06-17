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
    if (me.role !== 'admin' && me.role !== 'asesor' && me.role !== 'contador') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Filter by advisor if needed
    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return generateEmptyExcel(from, to)
    }

    // Query loans
    let loansQuery = admin
      .from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, monthly_payment, payment_frequency, status, start_date, end_date, client:clients(id, first_name, last_name, phone, email, gender)')
      .in('status', ['active', 'paid'])
      .order('start_date', { ascending: false })

    if (me.role === 'asesor' && clientIds.length) {
      loansQuery = loansQuery.in('client_id', clientIds)
    }
    if (from) loansQuery = loansQuery.gte('start_date', from)
    if (to) loansQuery = loansQuery.lte('start_date', to)

    const { data: loans, error: loansError } = await loansQuery
    if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 })
    if (!loans?.length) return generateEmptyExcel(from, to)

    // Generate Excel
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Préstamos Otorgados')

    const blue = '2563EB'
    const lightBlue = '3B82F6'
    const green = '059669'

    // Logo
    const publicDir = path.join(process.cwd(), 'public')
    const logoCandidates = [
      'logoCooperativaConTexto.jpg',
      'logoCooperativa.jpg',
      'logoCooperativaSinTexto.png',
      'logoCooperativaSinTextoSinFondo.png',
      'logoCooperativa.png',
    ]
    let logoImageId: number | null = null
    for (const name of logoCandidates) {
      const p = path.join(publicDir, name)
      try {
        const ext = path.extname(p).toLowerCase() === '.png' ? 'png' : 'jpeg'
        logoImageId = workbook.addImage({ filename: p, extension: ext as 'png' | 'jpeg' })
        break
      } catch {}
    }

    // Title row
    ws.mergeCells('A1:K1')
    ws.getCell('A1').value = 'Reporte Mensual de Préstamos Otorgados'
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 65 } })
    ws.getRow(1).height = 60

    // Date range info
    const rangeLabel = from && to
      ? `Período: ${fmtDate(from)} — ${fmtDate(to)}`
      : 'Todos los datos (sin filtro de fecha)'
    ws.mergeCells('A2:K2')
    ws.getCell('A2').value = rangeLabel
    ws.getCell('A2').font = { italic: true, size: 11, color: { argb: '64748B' } }
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }

    ws.getCell('K3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
    ws.addRow([])

    // Headers
    const headers = [
      'No. Préstamo', 'Cliente', 'Teléfono', 'Monto', 'Tasa Interés',
      'Plazo (meses)', 'Frecuencia', 'Cuota', 'Estado', 'Fecha Inicio', 'Fecha Fin'
    ]
    const headerRow = ws.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    const currencyFmt = '"Q"#,##0.00'
    const percentFmt = '0.00%'
    const dateFmt = 'dd/mm/yyyy'

    let totalMonto = 0
    let countActive = 0
    let countPaid = 0

    for (const loan of loans) {
      const clientRaw: any = loan.client
      const client: any = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
      const clientName = `${client?.first_name || ''} ${client?.last_name || ''}`.trim()
      const amount = Number(loan.amount || 0)
      totalMonto += amount

      if (loan.status === 'active') countActive++
      else if (loan.status === 'paid') countPaid++

      const freq = loan.payment_frequency === 'quincenal' ? 'Quincenal' : 'Mensual'

      const r = ws.addRow([
        loan.loan_number,
        clientName,
        client?.phone || '',
        amount,
        Number(loan.interest_rate || 0) / 100,
        loan.term_months,
        freq,
        Number(loan.monthly_payment || 0),
        translateStatus(loan.status),
        loan.start_date ? new Date(loan.start_date + 'T12:00:00Z') : '',
        loan.end_date ? new Date(loan.end_date + 'T12:00:00Z') : '',
      ])
      r.getCell(4).numFmt = currencyFmt
      r.getCell(5).numFmt = percentFmt
      r.getCell(8).numFmt = currencyFmt
      r.getCell(10).numFmt = dateFmt
      r.getCell(11).numFmt = dateFmt
    }

    // Summary section
    ws.addRow([])
    const summaryHeader = ws.addRow(['RESUMEN EJECUTIVO'])
    summaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green } }
    summaryHeader.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    ws.mergeCells(summaryHeader.number, 1, summaryHeader.number, 11)
    ws.addRow([])

    const totalPrestamos = loans.length
    const ticketPromedio = totalPrestamos > 0 ? totalMonto / totalPrestamos : 0

    const summaryRows: [string, number | string, string?][] = [
      ['Total préstamos otorgados', totalPrestamos],
      ['Préstamos activos', countActive],
      ['Préstamos pagados', countPaid],
      ['Monto total otorgado', totalMonto],
      ['Monto promedio por préstamo', ticketPromedio],
    ]

    for (let i = 0; i < summaryRows.length; i++) {
      const [label, value] = summaryRows[i]
      const r = ws.addRow([label, value])
      r.getCell(1).font = { bold: true }
      if (i >= 3) r.getCell(2).numFmt = currencyFmt
      else r.getCell(2).numFmt = '#,##0'
    }

    // Column widths
    ws.columns = [
      { width: 18 }, { width: 30 }, { width: 15 }, { width: 16 }, { width: 14 },
      { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const respHeaders = new Headers()
    respHeaders.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const ts = new Date().toISOString().slice(0, 10)
    respHeaders.append('Content-Disposition', `attachment; filename="Cooperativa_Prestamos_Otorgados_${ts}.xlsx"`)
    return new NextResponse(new Uint8Array(buffer), { headers: respHeaders })
  } catch (e: any) {
    console.error('[loans-granted excel]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

async function generateEmptyExcel(from: string | null, to: string | null) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Préstamos Otorgados')
  const blue = '2563EB'

  ws.mergeCells('A1:K1')
  ws.getCell('A1').value = 'Reporte Mensual de Préstamos Otorgados'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
  ws.getRow(1).height = 60
  ws.addRow([])
  ws.mergeCells('A3:K3')
  ws.getCell('A3').value = 'No hay préstamos otorgados en el período seleccionado'
  ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A3').font = { bold: true, size: 12 }

  const buffer = await wb.xlsx.writeBuffer()
  const headers = new Headers()
  headers.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  headers.append('Content-Disposition', `attachment; filename="Cooperativa_Prestamos_Otorgados_${new Date().toISOString().slice(0, 10)}.xlsx"`)
  return new NextResponse(new Uint8Array(buffer), { headers })
}
