import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"
import path from "path"
import puppeteer from "puppeteer"

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (me.role !== 'admin' && me.role !== 'asesor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let clientIds: string[] = []
    if (me.role === 'asesor') {
      const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return generateEmptyExcel()
    }

    // Loans considered in portfolio (active + paid)
    let loansQuery = admin
      .from('loans')
      .select('id, amount, status, client:clients(*)')
      .in('status', ['active', 'paid'])
    if (me.role === 'asesor' && clientIds.length) {
      loansQuery = loansQuery.in('client_id', clientIds)
    }
    const { data: loans, error: loansError } = await loansQuery
    if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 })

    const loanIds = (loans || []).map((l: any) => String(l.id))
    if (!loanIds.length) return generateEmptyExcel()

    // Total recovered: sum of approved payments amounts tied to these loans
    let paymentsQuery = admin
      .from('payments')
      .select('amount, confirmation_status, loan_id')
      .eq('confirmation_status', 'aprobado')
      .in('loan_id', loanIds)
    const { data: payments, error: paymentsError } = await paymentsQuery
    if (paymentsError) return NextResponse.json({ error: paymentsError.message }, { status: 500 })

    // Outstanding debt and quotas info from schedules
    let schedulesQuery = admin
      .from('payment_schedule')
      .select('loan_id, amount, principal, interest, admin_fees, mora, paid_amount, status, due_date')
      .in('loan_id', loanIds)
    const { data: schedules, error: schedulesError } = await schedulesQuery
    if (schedulesError) return NextResponse.json({ error: schedulesError.message }, { status: 500 })

    // Compute GT timezone "today" (date-only) for overdue comparison
    const gtTodayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
    const parseYMD = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, (m - 1), d)
    }
    const todayGT = parseYMD(gtTodayYMD)

    // Aggregations
    const activeLoansList = (loans || []).filter((l: any) => l.status === 'active')
    const activeLoanIds = new Set(activeLoansList.map((l: any) => l.id))

    // 1. Total Prestado: Suma SOLO el monto (principal) de los préstamos ACTIVOS
    const totalPrestado = activeLoansList.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0)

    // Calculate Capital Recuperado, Interest Stats for ACTIVE loans
    let totalCapitalRecuperado = 0
    let totalInteresesEsperados = 0
    let totalInteresesRecuperados = 0

    // Global counters (keep including all loans for counts, as requested/implied by "Pagados" presence)
    let cuotasTotales = 0
    let cuotasPagadas = 0
    let cuotasPendientes = 0
    let cuotasEnMora = 0
    let saldoPendiente = 0 // Will be recalculated based on user formula for display, but let's track scheduled debt too if needed

    for (const s of (schedules || [])) {
      const loanId = String((s as any).loan_id)
      const isActive = activeLoanIds.has(loanId)

      // Schedule values
      // Note: 'amount' usually implies total or principal depending on usage, but we selected 'principal' and 'interest' explicitly.
      // Fallback to 0 if null.
      const principal = Number((s as any).principal || 0)
      const interest = Number((s as any).interest || 0)
      const adminFees = Number((s as any).admin_fees || 0)
      const mora = Number((s as any).mora || 0)
      const paidAmt = Number((s as any).paid_amount || 0)

      // Logic for counters (apply to all or active? User focused on monetary amounts being active only)
      // Let's keep counters for ALL loans to be consistent with "Total loans" count which includes paid.
      // But monetary sums for the top section are strictly Active per request.
      
      cuotasTotales++
      const st = String((s as any).status || '')
      if (st === 'paid') cuotasPagadas++
      else {
        cuotasPendientes++
        const dueStr = String((s as any).due_date || '')
        if (dueStr) {
          const dueDate = parseYMD(dueStr.slice(0, 10))
          if (todayGT.getTime() > dueDate.getTime()) cuotasEnMora++
        }
      }

      if (isActive) {
        totalInteresesEsperados += interest
        
        // Calculate split paid amount
        // Priority: Mora -> Fees -> Interest -> Principal
        let remainingPaid = paidAmt
        
        // 1. Mora
        const moraPaid = Math.min(remainingPaid, mora)
        remainingPaid -= moraPaid
        
        // 2. Admin Fees
        const feesPaid = Math.min(remainingPaid, adminFees)
        remainingPaid -= feesPaid
        
        // 3. Interest
        const interestPaid = Math.min(remainingPaid, interest)
        remainingPaid -= interestPaid
        totalInteresesRecuperados += interestPaid
        
        // 4. Principal
        const principalPaid = Math.min(remainingPaid, principal)
        // If the schedule is marked 'paid', we assume principal is fully paid even if math is slightly off due to rounding,
        // but using paid_amount is safer for partials. 
        // However, for 'paid' status, paid_amount should >= total due.
        // Let's stick to the math derived from paid_amount.
        totalCapitalRecuperado += principalPaid
      }
    }

    // 2. Saldo Pendiente: Resta entre Total Prestado - Total Recuperado (Capital)
    // "El saldo pendiente deberia ser la resta entre el total prestado - el total recuperado"
    saldoPendiente = totalPrestado - totalCapitalRecuperado

    const clientsSet = new Set<string>()
    let mujeres = 0
    let hombres = 0
    for (const l of (loans || [])) {
      const clientRaw: any = (l as any).client
      const clientObj: any = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
      const cid = String(clientObj?.id || '')
      if (cid) {
        if (!clientsSet.has(cid)) {
          clientsSet.add(cid)
          const g = String(clientObj?.gender || '').toLowerCase()
          if (g === 'mujer') mujeres++
          else if (g === 'hombre') hombres++
        }
      }
    }
    const totalClientes = clientsSet.size

    const totalPrestamos = (loans || []).length
    const activos = activeLoansList.length
    const pagados = (loans || []).filter((l: any) => String(l.status) === 'paid').length
    
    // Recalculate averages based on active portfolio or total? 
    // Usually Ticket Promedio = Total Prestado / Total Prestamos. 
    // Since Total Prestado is now Active Only, we should divide by Active Loans count.
    const ticketPromedio = activos > 0 ? totalPrestado / activos : 0
    const recuperacionPct = totalPrestado > 0 ? totalCapitalRecuperado / totalPrestado : 0

    // Generate Excel (style consistent with other reports)
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Total Cartera')

    const blue = '2563EB'
    const lightBlue = '3B82F6'
    const green = '059669'

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

    ws.mergeCells('A1:M1')
    ws.getCell('A1').value = 'Total Cartera'
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 200, height: 80 } })
    ws.getRow(1).height = 80
    ws.getCell('L3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
    ws.addRow([])

    const currencyFmt = '"Q"#,##0.00'
    const percentFmt = '0.00%'

    const resumenHeader = ws.addRow(['RESUMEN EJECUTIVO'])
    resumenHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green } }
    resumenHeader.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    ws.mergeCells(resumenHeader.number, 1, resumenHeader.number, 13)
    ws.addRow([])

    const resumenRows: Array<[string, number]> = [
      ['Total prestado (principal activo)', totalPrestado],
      ['Total recuperado (capital activo)', totalCapitalRecuperado],
      ['Saldo pendiente (capital activo)', saldoPendiente],
      ['Total intereses (programados activos)', totalInteresesEsperados],
      ['Intereses recuperados (cobrados activos)', totalInteresesRecuperados],
      ['Total clientes', totalClientes],
      ['Mujeres', mujeres],
      ['Hombres', hombres],
      ['Total préstamos', totalPrestamos],
      ['Activos', activos],
      ['Pagados', pagados],
      ['Cuotas totales', cuotasTotales],
      ['Cuotas pagadas', cuotasPagadas],
      ['Cuotas pendientes', cuotasPendientes],
      ['Cuotas en mora (pendientes y vencidas)', cuotasEnMora],
    ]
    for (let i = 0; i < resumenRows.length; i++) {
      const [label, value] = resumenRows[i]
      const r = ws.addRow([label, value])
      r.getCell(1).font = { bold: true }
      const isCurrency = i <= 4
      if (isCurrency) r.getCell(2).numFmt = currencyFmt
      else r.getCell(2).numFmt = '#,##0'
    }
    ws.addRow([])
    const rPct = ws.addRow(['Recuperación (%)', recuperacionPct])
    rPct.getCell(1).font = { bold: true }
    rPct.getCell(2).numFmt = percentFmt
    ws.addRow([])
    const rTicket = ws.addRow(['Ticket promedio', ticketPromedio])
    rTicket.getCell(1).font = { bold: true }
    rTicket.getCell(2).numFmt = currencyFmt
    const desc = ws.addRow(['Descripción del ticket: monto promedio por préstamo en cartera'])
    ws.mergeCells(desc.number, 1, desc.number, 13)
    desc.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    desc.getCell(1).font = { italic: true }

    async function createChartImage(
      type: 'bar' | 'doughnut',
      labels: string[],
      data: number[],
      title: string,
      width = 640,
      height = 360
    ): Promise<Buffer> {
      const browser = await puppeteer.launch({ headless: true })
      try {
        const page = await browser.newPage()
        const html = `<!doctype html>
          <html>
            <head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head>
            <body>
              <canvas id="c" width="${width}" height="${height}"></canvas>
              <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
              <script>
                const ctx = document.getElementById('c').getContext('2d');
                const chart = new Chart(ctx, {
                  type: '${type}',
                  data: {
                    labels: ${JSON.stringify(labels)},
                    datasets: [{
                      label: ${JSON.stringify(title)},
                      data: ${JSON.stringify(data)},
                      backgroundColor: ['#2563EB','#10B981','#F59E0B','#EF4444','#3B82F6','#6366F1'],
                      borderWidth: 0
                    }]
                  },
                  options: {
                    plugins: { legend: { display: ${type === 'doughnut' ? 'true' : 'false'} }, title: { display: true, text: ${JSON.stringify(title)} } },
                    scales: { y: { beginAtZero: true } }
                  }
                });
              </script>
            </body>
          </html>`
        await page.setContent(html, { waitUntil: 'networkidle0' })
        const buf = await page.screenshot({ type: 'png' })
        return buf as Buffer
      } finally {
        await browser.close()
      }
    }

    const topRow = Math.max(6, (resumenHeader.number || 6))
    try {
      const chart1 = await createChartImage(
        'bar',
        ['Prestado','Recuperado (Cap)','Pendiente'],
        [totalPrestado, totalCapitalRecuperado, saldoPendiente],
        'Montos de cartera'
      )
      const chart1Arr = new Uint8Array(chart1)
      const chart1Id = workbook.addImage({ buffer: chart1Arr.buffer, extension: 'png' })
      ws.addImage(chart1Id, { tl: { col: 8, row: topRow - 1 }, ext: { width: 400, height: 260 } })
    } catch {}

    try {
      const chart2 = await createChartImage(
        'doughnut',
        ['Mujeres','Hombres'],
        [mujeres, hombres],
        'Clientes por género'
      )
      const chart2Arr = new Uint8Array(chart2)
      const chart2Id = workbook.addImage({ buffer: chart2Arr.buffer, extension: 'png' })
      ws.addImage(chart2Id, { tl: { col: 8, row: topRow + 14 }, ext: { width: 320, height: 240 } })
    } catch {}

    ws.columns = [
      { width: 40 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 22 },
      { width: 22 },
      { width: 26 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const headers = new Headers()
    headers.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    headers.append('Content-Disposition', `attachment; filename="Cooperativa_Total_Cartera_${new Date().toISOString().slice(0,10)}.xlsx"`)
    return new NextResponse(new Uint8Array(buffer), { headers })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

async function generateEmptyExcel() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Total Cartera')
  const blue = '2563EB'
  const lightBlue = '3B82F6'
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
      logoImageId = wb.addImage({ filename: p, extension: ext as 'png' | 'jpeg' })
      break
    } catch {}
  }
  ws.mergeCells('A1:M1')
  ws.getCell('A1').value = 'Total Cartera'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
  if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 200, height: 80 } })
  ws.getRow(1).height = 80
  ws.getCell('L3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
  ws.addRow([])
  ws.addRow([])
  ws.mergeCells('A4:M4')
  ws.getCell('A4').value = 'No hay datos de cartera disponibles'
  ws.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A4').font = { bold: true }
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
  ws.columns = [
    { width: 12 }, { width: 28 }, { width: 18 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 },
  ]
  const buffer = await wb.xlsx.writeBuffer()
  const headers = new Headers()
  headers.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  headers.append('Content-Disposition', `attachment; filename="Cooperativa_Total_Cartera_${new Date().toISOString().slice(0,10)}.xlsx"`)
  return new NextResponse(new Uint8Array(buffer), { headers })
}
