import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"
import path from "path"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await supabase.from('users').select('role, email, id').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    if (!startDate || !endDate) return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })

    let paymentsQuery = admin
      .from("payments")
      .select(`
        *,
        loan:loans!payments_loan_id_fkey (
          id, loan_number, amount,
          client:clients!loans_client_id_fkey (id, first_name, last_name, phone, email)
        ),
        schedule:payment_schedule!payments_schedule_id_fkey (
          id, amount, due_date, status, mora, admin_fees, principal
        )
      `)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .eq('confirmation_status', 'aprobado')
      .order("payment_date", { ascending: true })

    if (me.role === 'cliente') {
      paymentsQuery = paymentsQuery.eq('loan.client.email', me.email)
    } else if (me.role === 'asesor') {
      const { data: assigned } = await admin.from('clients').select('email').eq('advisor_id', me.id)
      const emails = (assigned || []).map((c: any) => c.email).filter(Boolean)
      if (emails.length) paymentsQuery = paymentsQuery.in('loan.client.email', emails)
      else return NextResponse.json({ error: 'No clients' }, { status: 200 })
    }

    const { data: payments, error } = await paymentsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Reporte de Pagos')

    const blue = '2563EB'
    const lightBlue = '3B82F6'
    const green = '059669'

    // Try to embed logo from /public
    const publicDir = path.join(process.cwd(), 'public')
    const logoCandidates = [
      'logoCooperativaSinTexto.jpg',
      'logoCooperativaSinTextoSinFondo.jpg',
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

    ws.mergeCells('A1:P1')
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) {
      ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 40 } })
    }
    ws.getRow(1).height = 30

    ws.mergeCells('A2:P2')
    ws.getCell('A2').value = `Período: ${new Date(startDate).toLocaleDateString('es-GT')} - ${new Date(endDate).toLocaleDateString('es-GT')}`
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
    ws.mergeCells('A3:P3')
    ws.getCell('A3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')} a las ${new Date().toLocaleTimeString('es-GT')}`
    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }

    const headers = [
      'Cliente', 'Email', 'Teléfono', 'Número de Préstamo', 'Monto del Préstamo',
      'Fecha de Pago', 'Método de Pago', 'Monto Programado', 'Capital', 'Intereses', 'Monto Pagado',
      'Estado del Pago', 'Mora', 'Gastos Administrativos', 'Fecha de Vencimiento', 'Notas'
    ]
    ws.addRow([])
    const headerRow = ws.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    const currencyFmt = '"Q"#,##0.00'
    const dateFmt = 'dd/mm/yyyy'

    let totalClients = 0
    let totalPayments = 0
    let totalProgramado = 0
    let totalCapital = 0
    let totalIntereses = 0
    let totalPagado = 0
    let totalMora = 0

    const clientsSeen = new Set<string>()
    payments?.forEach((p: any) => {
      const clientName = `${p.loan?.client?.first_name || ''} ${p.loan?.client?.last_name || ''}`.trim()
      const clientId = p.loan?.client?.id
      if (clientId && !clientsSeen.has(clientId)) {
        clientsSeen.add(clientId)
        totalClients++
      }
      totalPayments++

      const scheduled = Number(p.schedule?.amount || 0) + Number(p.schedule?.admin_fees || 0) + Number(p.schedule?.mora || 0)
      const capital = Number(p.schedule?.principal || 0)
      const intereses = Math.max(0, Number(p.schedule?.amount || 0) - capital)
      const mora = Number(p.schedule?.mora || 0)
      const adminFees = Number(p.schedule?.admin_fees || 0)
      const paid = Number(p.amount || 0)

      totalProgramado += scheduled
      totalCapital += capital
      totalIntereses += intereses
      totalPagado += paid
      totalMora += mora

      const row = ws.addRow([
        clientName,
        p.loan?.client?.email || '',
        p.loan?.client?.phone || '',
        p.loan?.loan_number || '',
        Number(p.loan?.amount || 0),
        new Date(p.payment_date),
        p.payment_method || '',
        scheduled,
        capital,
        intereses,
        paid,
        p.schedule?.status === 'partially_paid' ? 'Parcial' : 'Completo',
        mora,
        adminFees,
        p.schedule?.due_date ? new Date(p.schedule?.due_date) : null,
        p.notes || ''
      ])
      ;[6,15].forEach((idx) => { const c = row.getCell(idx); c.numFmt = dateFmt })
      ;[5,8,9,10,11,13,14].forEach((idx) => { const c = row.getCell(idx); c.numFmt = currencyFmt })
    })

    ws.addRow([])
    const summaryHeader = ws.addRow(['RESUMEN EJECUTIVO'])
    summaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green } }
    summaryHeader.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    ws.mergeCells(summaryHeader.number, 1, summaryHeader.number, 16)

    ws.addRow([])
    const summaryRows = [
      ['Total de Clientes:', totalClients],
      ['Total de Pagos:', totalPayments],
      ['Total Monto Programado:', totalProgramado],
      ['Total Capital:', totalCapital],
      ['Total Intereses:', totalIntereses],
      ['Total Monto Pagado:', totalPagado],
      ['Total Mora:', totalMora],
    ]
    summaryRows.forEach((arr, idx) => {
      const r = ws.addRow(arr)
      r.getCell(1).font = { bold: true }
      if (idx >= 2) r.getCell(2).numFmt = currencyFmt
      else r.getCell(2).numFmt = '#,##0'
    })

    ws.columns = [
      { width: 25 }, { width: 30 }, { width: 15 }, { width: 18 }, { width: 18 },
      { width: 15 }, { width: 18 }, { width: 18 }, { width: 15 }, { width: 15 },
      { width: 15 }, { width: 18 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 25 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const respHeaders = new Headers()
    respHeaders.append("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    const startFmt = new Date(startDate).toLocaleDateString('es-GT').replace(/\//g, '-')
    const endFmt = new Date(endDate).toLocaleDateString('es-GT').replace(/\//g, '-')
    const ts = new Date().toISOString().slice(0,10)
    respHeaders.append("Content-Disposition", `attachment; filename="Cooperativa_Reporte_Pagos_${startFmt}_${endFmt}_${ts}.xlsx"`)
    return new NextResponse(new Uint8Array(buffer), { headers: respHeaders })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
