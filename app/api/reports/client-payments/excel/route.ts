import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { translateStatus } from "@/lib/utils"
import ExcelJS from "exceljs"
import path from "path"

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await supabase.from('users').select('role, email, id').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (me.role !== 'admin' && me.role !== 'asesor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ─── 1. Obtener clientes según rol ───
    let clientsQuery = admin.from('clients').select('id, first_name, last_name, phone, email')
    if (me.role === 'asesor') {
      clientsQuery = clientsQuery.eq('advisor_id', me.id)
    }
    const { data: clients, error: clientsError } = await clientsQuery.order('first_name', { ascending: true })
    if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 })
    if (!clients || clients.length === 0) return generateEmptyExcel()

    const clientIds = clients.map((c: any) => String(c.id))
    const clientMap: Record<string, any> = {}
    for (const c of clients) clientMap[String(c.id)] = c

    // ─── 2. Obtener préstamos de estos clientes ───
    const { data: loans, error: loansError } = await admin
      .from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, status, start_date, client_id')
      .in('client_id', clientIds)
      .order('created_at', { ascending: true })
    if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 })

    const loanIds = (loans || []).map((l: any) => String(l.id))
    if (loanIds.length === 0) return generateEmptyExcel()

    // ─── 3. Obtener pagos APROBADOS con datos del schedule ───
    // Supabase limita IN queries, hacer chunks
    let allPayments: any[] = []
    for (let i = 0; i < loanIds.length; i += 200) {
      const chunk = loanIds.slice(i, i + 200)
      const { data: payments } = await admin
        .from('payments')
        .select(`
          id, amount, payment_date, payment_method, receipt_number, notes,
          confirmation_status, confirmed_by, confirmed_at, receipt_image_url,
          loan_id, schedule_id
        `)
        .in('loan_id', chunk)
        .eq('confirmation_status', 'aprobado')
        .order('payment_date', { ascending: true })
      allPayments = allPayments.concat(payments || [])
    }

    // ─── 4. Obtener schedules para datos extra (due_date, principal, interest, mora, etc) ───
    const scheduleIds = Array.from(new Set(allPayments.map(p => p.schedule_id).filter(Boolean)))
    const scheduleMap: Record<string, any> = {}
    for (let i = 0; i < scheduleIds.length; i += 500) {
      const chunk = scheduleIds.slice(i, i + 500) as string[]
      const { data: schedules } = await admin
        .from('payment_schedule')
        .select('id, payment_number, amount, principal, interest, mora, admin_fees, due_date, status')
        .in('id', chunk)
      for (const s of (schedules || [])) {
        scheduleMap[String(s.id)] = s
      }
    }

    // ─── 5. Obtener boletas vinculadas a los schedules ───
    const boletasBySchedule: Record<string, any[]> = {}
    if (scheduleIds.length > 0) {
      for (let i = 0; i < scheduleIds.length; i += 500) {
        const chunk = scheduleIds.slice(i, i + 500) as string[]
        const { data: cuotaBoletas } = await admin
          .from('cuota_boletas')
          .select(`
            payment_schedule_id,
            boletas (
              id, numero_boleta, forma_pago, fecha, referencia, banco, monto, observaciones, image_url
            )
          `)
          .in('payment_schedule_id', chunk)

        for (const cb of (cuotaBoletas || [])) {
          const sid = String(cb.payment_schedule_id)
          const boleta = (cb as any).boletas
          if (boleta) {
            if (!boletasBySchedule[sid]) boletasBySchedule[sid] = []
            boletasBySchedule[sid].push(boleta)
          }
        }
      }
    }

    // ─── 6. Organizar datos: cliente → préstamos → pagos ───
    // Agrupar loans por client_id
    const loansByClient: Record<string, any[]> = {}
    for (const l of (loans || [])) {
      const cid = String(l.client_id)
      if (!loansByClient[cid]) loansByClient[cid] = []
      loansByClient[cid].push(l)
    }

    // Agrupar payments por loan_id
    const paymentsByLoan: Record<string, any[]> = {}
    for (const p of allPayments) {
      const lid = String(p.loan_id)
      if (!paymentsByLoan[lid]) paymentsByLoan[lid] = []
      paymentsByLoan[lid].push(p)
    }

    // ─── 7. Generar Excel ───
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Pagos por Cliente')

    const blue = '2563EB'
    const lightBlue = '3B82F6'
    const green = '059669'
    const clientHeaderColor = '1E3A5F'
    const loanHeaderColor = '374151'

    // Logo
    const publicDir = path.join(process.cwd(), 'public')
    const logoCandidates = [
      'logoCooperativaConTexto.jpg',
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

    // Fila 1: Logo + Título
    const totalCols = 16
    ws.mergeCells(1, 1, 1, totalCols)
    ws.getCell('A1').value = '  Reporte de Pagos por Cliente'
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) {
      ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 50 } })
    }
    ws.getRow(1).height = 50

    // Fila 2: Fecha de generación
    ws.mergeCells(2, 1, 2, totalCols)
    ws.getCell('A2').value = `Generado el: ${new Date().toLocaleDateString('es-GT')} a las ${new Date().toLocaleTimeString('es-GT')}`
    ws.getCell('A2').font = { size: 10, italic: true }
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }

    ws.addRow([]) // fila 3 vacía

    const currencyFmt = '"Q"#,##0.00'
    const dateFmt = 'dd/mm/yyyy'

    let grandTotalPagado = 0
    let grandTotalPayments = 0
    let totalClientsWithPayments = 0

    // ─── Iterar por cliente ───
    for (const client of clients) {
      const cid = String(client.id)
      const clientLoans = loansByClient[cid] || []

      // Verificar si el cliente tiene al menos un pago aprobado
      let clientHasPayments = false
      for (const loan of clientLoans) {
        if ((paymentsByLoan[String(loan.id)] || []).length > 0) {
          clientHasPayments = true
          break
        }
      }
      if (!clientHasPayments) continue

      totalClientsWithPayments++
      const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim()

      // ── Barra de cliente ──
      const clientRow = ws.addRow([`CLIENTE: ${clientName}`, '', `Email: ${client.email || 'N/A'}`, '', `Tel: ${client.phone || 'N/A'}`])
      ws.mergeCells(clientRow.number, 1, clientRow.number, 2)
      ws.mergeCells(clientRow.number, 3, clientRow.number, 4)
      ws.mergeCells(clientRow.number, 5, clientRow.number, 6)
      ws.mergeCells(clientRow.number, 7, clientRow.number, totalCols)
      clientRow.eachCell((cell) => {
        cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: clientHeaderColor } }
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
      })
      clientRow.height = 28

      // ── Iterar préstamos del cliente ──
      for (const loan of clientLoans) {
        const lid = String(loan.id)
        const loanPayments = paymentsByLoan[lid] || []
        if (loanPayments.length === 0) continue

        const loanStatus = translateStatus(loan.status)

        // Sub-header del préstamo
        const loanRow = ws.addRow([
          `  Préstamo #${loan.loan_number || loan.id}`,
          '', '', '',
          `Monto: Q${Number(loan.amount || 0).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`,
          '', '',
          `Tasa: ${loan.interest_rate || 0}%`,
          '',
          `Plazo: ${loan.term_months || 0} meses`,
          '',
          `Estado: ${loanStatus}`,
        ])
        ws.mergeCells(loanRow.number, 1, loanRow.number, 4)
        ws.mergeCells(loanRow.number, 5, loanRow.number, 7)
        ws.mergeCells(loanRow.number, 10, loanRow.number, 11)
        ws.mergeCells(loanRow.number, 12, loanRow.number, totalCols)
        loanRow.eachCell((cell) => {
          cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: loanHeaderColor } }
          cell.alignment = { horizontal: 'left', vertical: 'middle' }
        })
        loanRow.height = 22

        // Headers de la tabla de pagos
        const headers = [
          'N° Cuota', 'Fecha Pago', 'Fecha Vencimiento', 'Método', 'N° Recibo',
          'Capital', 'Intereses', 'Mora', 'Gastos Admin.', 'Monto Cuota',
          'Monto Pagado', 'Estado Cuota', 'N° Boleta', 'Banco', 'Boleta Imagen', 'Notas'
        ]
        const headerRow = ws.addRow(headers)
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
          }
        })

        // Datos de cada pago
        let loanTotalPaid = 0
        for (const payment of loanPayments) {
          const sched = scheduleMap[String(payment.schedule_id)] || {}
          const principal = Number(sched.principal || 0)
          const interest = Number(sched.interest || 0)
          const mora = Number(sched.mora || 0)
          const adminFees = Number(sched.admin_fees || 0)
          const cuotaTotal = Number(sched.amount || 0) + mora + adminFees
          const montoPagado = Number(payment.amount || 0)
          loanTotalPaid += montoPagado
          grandTotalPagado += montoPagado
          grandTotalPayments++

          // Buscar boletas del schedule
          const boletas = boletasBySchedule[String(payment.schedule_id)] || []
          const primerBoleta = boletas.length > 0 ? boletas[0] : null

          // URL de imagen: primero del pago (receipt_image_url), luego de la boleta
          let imageUrl = payment.receipt_image_url || ''
          if (!imageUrl && primerBoleta) {
            imageUrl = primerBoleta.image_url || ''
          }

          const payRow = ws.addRow([
            sched.payment_number || '',
            payment.payment_date ? new Date(payment.payment_date) : '',
            sched.due_date ? new Date(sched.due_date) : '',
            payment.payment_method || '',
            payment.receipt_number || '',
            principal,
            interest,
            mora,
            adminFees,
            cuotaTotal,
            montoPagado,
            translateStatus(sched.status || ''),
            primerBoleta?.numero_boleta || '',
            primerBoleta?.banco || '',
            imageUrl ? 'Ver boleta' : '',
            payment.notes || ''
          ])

          // Formato de celdas
          const cellB = payRow.getCell(2); cellB.numFmt = dateFmt
          const cellC = payRow.getCell(3); cellC.numFmt = dateFmt
          ;[6, 7, 8, 9, 10, 11].forEach((idx) => {
            payRow.getCell(idx).numFmt = currencyFmt
          })

          // Hyperlink en la columna de imagen
          if (imageUrl) {
            const imgCell = payRow.getCell(15)
            imgCell.value = { text: 'Ver boleta', hyperlink: imageUrl }
            imgCell.font = { color: { argb: '2563EB' }, underline: true, size: 9 }
          }

          // Bordes
          payRow.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'E5E7EB' } },
              bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
              left: { style: 'thin', color: { argb: 'E5E7EB' } },
              right: { style: 'thin', color: { argb: 'E5E7EB' } },
            }
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
          })

          // Si hay más boletas, agregar filas extra
          for (let bi = 1; bi < boletas.length; bi++) {
            const bExtra = boletas[bi]
            const extraImageUrl = bExtra.image_url || ''
            const extraRow = ws.addRow([
              '', '', '', '', '',
              '', '', '', '', '',
              '', '',
              bExtra.numero_boleta || '',
              bExtra.banco || '',
              extraImageUrl ? 'Ver boleta' : '',
              ''
            ])
            if (extraImageUrl) {
              const imgC = extraRow.getCell(15)
              imgC.value = { text: 'Ver boleta', hyperlink: extraImageUrl }
              imgC.font = { color: { argb: '2563EB' }, underline: true, size: 9 }
            }
            extraRow.eachCell((cell) => {
              cell.border = {
                top: { style: 'thin', color: { argb: 'E5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
                left: { style: 'thin', color: { argb: 'E5E7EB' } },
                right: { style: 'thin', color: { argb: 'E5E7EB' } },
              }
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
            })
          }
        }

        // Subtotal del préstamo
        const subtotalRow = ws.addRow([
          '', '', '', '', '', '', '', '', '',
          'Subtotal Préstamo:',
          loanTotalPaid,
          '', '', '', '', ''
        ])
        subtotalRow.getCell(10).font = { bold: true, size: 9 }
        subtotalRow.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' }
        subtotalRow.getCell(11).numFmt = currencyFmt
        subtotalRow.getCell(11).font = { bold: true, size: 9 }

        ws.addRow([]) // Separación entre préstamos
      }

      // Separador entre clientes (fila con fondo más visible)
      const sepRow = ws.addRow([])
      sepRow.height = 8
    }

    // ─── RESUMEN EJECUTIVO ───
    ws.addRow([])
    const summaryHeader = ws.addRow(['RESUMEN EJECUTIVO'])
    summaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green } }
    summaryHeader.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    ws.mergeCells(summaryHeader.number, 1, summaryHeader.number, totalCols)

    ws.addRow([])
    const summaryRows = [
      ['Total de Clientes con pagos:', totalClientsWithPayments],
      ['Total de Pagos Aprobados:', grandTotalPayments],
      ['Total Monto Pagado:', grandTotalPagado],
    ]
    summaryRows.forEach((arr, idx) => {
      const r = ws.addRow(arr)
      r.getCell(1).font = { bold: true }
      if (idx >= 2) r.getCell(2).numFmt = currencyFmt
      else r.getCell(2).numFmt = '#,##0'
    })

    // Anchos de columna
    ws.columns = [
      { width: 10 },  // N° Cuota
      { width: 14 },  // Fecha Pago
      { width: 16 },  // Fecha Vencimiento
      { width: 14 },  // Método
      { width: 14 },  // N° Recibo
      { width: 13 },  // Capital
      { width: 13 },  // Intereses
      { width: 11 },  // Mora
      { width: 13 },  // Gastos Admin
      { width: 14 },  // Monto Cuota
      { width: 14 },  // Monto Pagado
      { width: 14 },  // Estado Cuota
      { width: 14 },  // N° Boleta
      { width: 14 },  // Banco
      { width: 16 },  // Boleta Imagen
      { width: 25 },  // Notas
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const respHeaders = new Headers()
    respHeaders.append("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    const ts = new Date().toISOString().slice(0, 10)
    respHeaders.append("Content-Disposition", `attachment; filename="Cooperativa_Pagos_Por_Cliente_${ts}.xlsx"`)
    return new NextResponse(new Uint8Array(buffer), { headers: respHeaders })
  } catch (e: any) {
    console.error('[client-payments report] Error:', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function generateEmptyExcel() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Pagos por Cliente')
  const blue = '2563EB'

  const publicDir = path.join(process.cwd(), 'public')
  const logoCandidates = [
    'logoCooperativaConTexto.jpg', 'logoCooperativa.jpg',
    'logoCooperativaSinTexto.png', 'logoCooperativaSinTextoSinFondo.png', 'logoCooperativa.png',
  ]
  let logoImageId: number | null = null
  for (const name of logoCandidates) {
    const p = path.join(publicDir, name)
    try {
      const ext = path.extname(p).toLowerCase() === '.png' ? 'png' : 'jpeg'
      logoImageId = wb.addImage({ filename: p, extension: ext as 'png' | 'jpeg' })
      break
    } catch {}
  }
  ws.mergeCells('A1:P1')
  ws.getCell('A1').value = '  Reporte de Pagos por Cliente'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
  if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 50 } })
  ws.getRow(1).height = 50

  ws.mergeCells('A2:P2')
  ws.getCell('A2').value = `Generado el: ${new Date().toLocaleDateString('es-GT')} a las ${new Date().toLocaleTimeString('es-GT')}`
  ws.getCell('A2').font = { size: 10, italic: true }
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
  ws.addRow([])
  ws.mergeCells('A4:P4')
  ws.getCell('A4').value = 'No hay datos de pagos disponibles'
  ws.getCell('A4').alignment = { horizontal: 'center' }
  ws.getCell('A4').font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  const headers = new Headers()
  headers.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  headers.append('Content-Disposition', `attachment; filename="Cooperativa_Pagos_Por_Cliente_${new Date().toISOString().slice(0, 10)}.xlsx"`)
  return new NextResponse(new Uint8Array(buffer), { headers })
}
