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

    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    if (me.role !== 'admin' && me.role !== 'asesor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Filter by advisor if needed
    let loanIdsForAdvisor: string[] = []
    if (me.role === 'asesor') {
      const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      const clientIds = (assignedClients || []).map((c: any) => String(c.id))
      if (!clientIds.length) return generateEmptyExcel()
      
      const { data: advisorLoans } = await admin
        .from('loans')
        .select('id')
        .in('client_id', clientIds)
      loanIdsForAdvisor = (advisorLoans || []).map((l: any) => String(l.id))
      if (!loanIdsForAdvisor.length) return generateEmptyExcel()
    }

    // Fetch ALL unpaid schedules
    let scheduleQuery = admin
      .from('payment_schedule')
      .select('id, loan_id, due_date, amount, principal, interest, mora, admin_fees, paid_amount, status')
      .neq('status', 'paid')

    if (me.role === 'asesor' && loanIdsForAdvisor.length) {
      scheduleQuery = scheduleQuery.in('loan_id', loanIdsForAdvisor)
    }

    const { data: schedules, error: schedulesError } = await scheduleQuery
    if (schedulesError) return NextResponse.json({ error: schedulesError.message }, { status: 500 })

    if (!schedules || !schedules.length) return generateEmptyExcel()

    // Fetch Loans and Clients info
    const loanIds = Array.from(new Set(schedules.map((s: any) => s.loan_id)))
    const { data: loans, error: loansError } = await admin
      .from('loans')
      .select('id, loan_number, client:clients(first_name, last_name)')
      .in('id', loanIds)
    
    if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 })

    const loanMap = new Map(loans?.map((l: any) => [l.id, l]))

    // Aggregate Data
    const reportData: Record<string, {
      clientName: string,
      loanNumber: string,
      totalDue: number,
      current: number,
      days1_30: number,
      days31_60: number,
      days61_90: number,
      days90plus: number
    }> = {}

    const now = new Date()
    // Reset time part to compare dates correctly
    now.setHours(0, 0, 0, 0)

    schedules.forEach((s: any) => {
      const loan = loanMap.get(s.loan_id)
      if (!loan) return

      const dueDate = new Date(s.due_date)
      // Adjust dueDate to midnight for comparison
      const dueTime = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime()
      const nowTime = now.getTime()
      
      const diffTime = nowTime - dueTime
      const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      // Calculate debt
      const amount = Number(s.amount || 0)
      const mora = Number(s.mora || 0)
      const fees = Number(s.admin_fees || 0)
      const paid = Number(s.paid_amount || 0)
      const debt = (amount + mora + fees) - paid

      if (debt <= 0.01) return // Skip negligible amounts

      if (!reportData[s.loan_id]) {
        reportData[s.loan_id] = {
          clientName: `${loan.client?.first_name || ''} ${loan.client?.last_name || ''}`.trim(),
          loanNumber: loan.loan_number || 'N/A',
          totalDue: 0,
          current: 0,
          days1_30: 0,
          days31_60: 0,
          days61_90: 0,
          days90plus: 0
        }
      }

      const entry = reportData[s.loan_id]
      entry.totalDue += debt

      if (daysOverdue <= 0) {
        entry.current += debt
      } else if (daysOverdue <= 30) {
        entry.days1_30 += debt
      } else if (daysOverdue <= 60) {
        entry.days31_60 += debt
      } else if (daysOverdue <= 90) {
        entry.days61_90 += debt
      } else {
        entry.days90plus += debt
      }
    })

    // Generate Excel
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Antigüedad de Saldos')

    // Styles and Logo (Copied from other reports)
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
        logoImageId = workbook.addImage({ filename: p, extension: ext as 'png' | 'jpeg' })
        break
      } catch {}
    }

    ws.mergeCells('A1:H1')
    ws.getCell('A1').value = 'Reporte de Antigüedad de Saldos'
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
    if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 65 } })
    ws.getRow(1).height = 60

    ws.getCell('H3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
    ws.addRow([])

    const headers = [
      'Cliente',
      'No. Préstamo',
      'Saldo Total',
      'Corriente',
      '1-30 Días',
      '31-60 Días',
      '61-90 Días',
      '+90 Días'
    ]

    const headerRow = ws.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    const currencyFmt = '"Q"#,##0.00'
    
    Object.values(reportData).forEach(row => {
      const r = ws.addRow([
        row.clientName,
        row.loanNumber,
        row.totalDue,
        row.current,
        row.days1_30,
        row.days31_60,
        row.days61_90,
        row.days90plus
      ])
      // Apply currency format to amount columns
      ;[3, 4, 5, 6, 7, 8].forEach(idx => {
        r.getCell(idx).numFmt = currencyFmt
      })
    })

    // Column widths
    ws.columns = [
      { width: 30 }, // Client
      { width: 15 }, // Loan
      { width: 15 }, // Total
      { width: 15 }, // Current
      { width: 15 }, // 1-30
      { width: 15 }, // 31-60
      { width: 15 }, // 61-90
      { width: 15 }, // 90+
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const respHeaders = new Headers()
    respHeaders.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const ts = new Date().toISOString().slice(0,10)
    respHeaders.append('Content-Disposition', `attachment; filename="Cooperativa_Antiguedad_Saldos_${ts}.xlsx"`)
    
    return new NextResponse(new Uint8Array(buffer), { headers: respHeaders })

  } catch (e: any) {
    console.error("Error generating report:", e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

async function generateEmptyExcel() {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Antigüedad de Saldos')
  const buf = await wb.xlsx.writeBuffer()
  const headers = new Headers()
  headers.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  headers.append('Content-Disposition', `attachment; filename="Cooperativa_Antiguedad_Saldos_${new Date().toISOString().slice(0,10)}.xlsx"`)
  return new NextResponse(new Uint8Array(buf), { headers })
}
