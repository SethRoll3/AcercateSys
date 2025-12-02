import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { translateStatus } from "@/lib/utils"
import ExcelJS from "exceljs"
import path from "path"
import fs from "fs"

export async function GET(_req: Request, { params }: { params: Promise<{ loanId: string }> }) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { loanId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    // Fetch loan with client
    const { data: loanRow, error: loanErr } = await admin
      .from('loans')
      .select('id, loan_number, amount, interest_rate, term_months, monthly_payment, status, start_date, end_date, client:clients(id, first_name, last_name, email, phone)')
      .eq('id', loanId)
      .single()
    if (loanErr || !loanRow) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

    // Role-based access quick check
    const clientObj = Array.isArray(loanRow.client) ? loanRow.client[0] : loanRow.client
    if (me.role === 'cliente' && clientObj?.email !== me.email) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    } else if (me.role === 'asesor') {
      const { data: advisorClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
      const ids = (advisorClients || []).map((c: any) => c.id)
      if (!ids.includes(clientObj?.id)) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch schedule for loan
    const { data: schedule, error: schErr } = await admin
      .from('payment_schedule')
      .select('payment_number, due_date, amount, principal, interest, mora, admin_fees, status')
      .eq('loan_id', loanId)
      .order('payment_number', { ascending: true })
    if (schErr) return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Plan de Pagos')

    const blue = '2563EB'
    const lightBlue = '3B82F6'

    // Header with logo
    const publicDir = path.join(process.cwd(), 'public')
    const logoCandidates = [
      'logoCooperativaSinTextoSinFondo.png',
      'logoCooperativaTextoSinFondo.png',
      'logoCooperativaSinTexto.jpg',
      'logoCooperativaConTexto.jpg',
      'logoCooperativaSinTexto.png',
      'logoCooperativa.png',
    ]
    const existing = logoCandidates.map((n) => ({ name: n, full: path.join(publicDir, n) })).find((c) => fs.existsSync(c.full))
    if (existing) {
      const ext = existing.name.endsWith('.png') ? 'png' : 'jpeg'
      const id = wb.addImage({ filename: existing.full, extension: ext as any })
      ws.getRow(1).height = 48
      ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 40 } })
    }
    ws.mergeCells('B1:I1')
    ws.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }

    ws.mergeCells('A2:J2')
    ws.getCell('A2').value = `Acercate - Plan ${loanRow.loan_number}`
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
    ws.mergeCells('A3:J3')
    ws.getCell('A3').value = `Cliente: ${(clientObj?.first_name || '')} ${(clientObj?.last_name || '')}`
    ws.mergeCells('A4:J4')
    ws.getCell('A4').value = `Monto prestado: ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(loanRow.amount) || 0)}`

    // Desglose
    const n = Number(loanRow.term_months || 0)
    const amount = Number(loanRow.amount || 0)
    const monthlyRate = Number(loanRow.interest_rate || 0) / 100
    const capitalMes = Math.round((n > 0 ? (amount / n) : 0) * 100) / 100
    const interesMes = Math.round((amount * monthlyRate) * 100) / 100
    const adminFees = Number(20)
    const firstRow = Array.isArray(schedule) && schedule.length ? schedule[0] : null
    const cuotaBase = firstRow ? Math.round(((Number(firstRow.principal||0)) + (Number(firstRow.interest||0)) + (Number(firstRow.admin_fees||0))) * 100) / 100 : Math.round((capitalMes + interesMes + adminFees) * 100) / 100
    const totalBase = Math.round(((cuotaBase * (schedule?.length || 0))) * 100) / 100
    const isQuincenal = (() => {
      if (!Array.isArray(schedule) || schedule.length < 2) return false
      const d1 = new Date(schedule[0].due_date as any)
      const d2 = new Date(schedule[1].due_date as any)
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000)
      return diffDays === 15
    })()
    ws.addRow([`Capital mensual: Q ${capitalMes.toFixed(2)}`, `Interés mensual: Q ${interesMes.toFixed(2)}`, `Aporte: Q ${adminFees.toFixed(2)}`, `Cuota base ${isQuincenal ? 'quincenal' : 'mensual'}: Q ${cuotaBase.toFixed(2)}`])
    ws.addRow([`Total del préstamo (sin mora): Q ${totalBase.toFixed(2)}`, `+ mora si aplica`])

    ws.addRow([])
    const headers = ['Cuota #','Fecha de Vencimiento','Monto a Pagar','Capital','Interés','Mora','Gastos Adm.','Saldo Préstamo','Saldo por Pagar','Estado']
    const headerRow = ws.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    const currencyFmt = '"Q"#,##0.00'
    const dateFmt = 'dd/mm/yyyy'

    let remaining = Number(loanRow.amount || 0)
    let saldoTotal = totalBase
    for (const s of (schedule || [])) {
      const totalDue = Number(s.amount || 0) + Number(s.mora || 0)
      remaining = Math.max(0, remaining - Number(s.principal || 0))
      saldoTotal = Math.max(0, Math.round((saldoTotal - (cuotaBase + Number(s.mora || 0))) * 100) / 100)
      const row = ws.addRow([
        s.payment_number,
        new Date(s.due_date),
        totalDue,
        Number(s.principal || 0),
        Number(s.interest || 0),
        Number(s.mora || 0),
        Number(s.admin_fees || 0),
        remaining,
        saldoTotal,
        translateStatus(s.status),
      ])
      row.getCell(2).numFmt = dateFmt
      ;[3,4,5,6,7,8,9].forEach((i) => { row.getCell(i).numFmt = currencyFmt })
    }

    ws.columns = [
      { width: 10 }, { width: 18 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 },
    ]

    const buf = await wb.xlsx.writeBuffer()
    const h = new Headers()
    h.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const ts = new Date().toISOString().slice(0,10)
    h.append('Content-Disposition', `attachment; filename="Acercate_Plan_${loanRow.loan_number}_${ts}.xlsx"`)
    return new NextResponse(new Uint8Array(buf), { headers: h })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
