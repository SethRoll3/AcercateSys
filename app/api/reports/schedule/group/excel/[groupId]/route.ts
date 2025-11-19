import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"
import path from "path"
import fs from "fs"

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { groupId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id, role, email').eq('auth_id', user.id).single()
    if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 })

    // Fetch loans in group
    const { data: lgRows, error } = await admin
      .from('loans_groups')
      .select('group_id, group:grupos(nombre), loans')
      .eq('group_id', groupId)
      .limit(1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const row = Array.isArray(lgRows) ? lgRows[0] : null
    const loanIds = (row?.loans || []).map((e: any) => e.loan_id)
    if (!loanIds.length) return NextResponse.json({ error: 'No loans in group' }, { status: 404 })

    // Load loans and schedules
    const { data: loans } = await admin
      .from('loans')
      .select('id, loan_number, amount, client:clients(id, first_name, last_name)')
      .in('id', loanIds)
    const { data: schedules } = await admin
      .from('payment_schedule')
      .select('loan_id, payment_number, due_date, amount, principal, interest, mora, admin_fees, status')
      .in('loan_id', loanIds)

    const wb = new ExcelJS.Workbook()
    const blue = '2563EB'
    const lightBlue = '3B82F6'
    const publicDir = path.join(process.cwd(), 'public')
    const logoCandidates = [
      'logoCooperativaSinTextoSinFondo.png',
      'logoCooperativaTextoSinFondo.png',
      'logoCooperativaSinTexto.jpg',
      'logoCooperativaConTexto.jpg',
      'logoCooperativaSinTexto.png',
      'logoCooperativa.png',
    ]
    let logoId: number | null = null
    const existing = logoCandidates.map((n) => ({ name: n, full: path.join(publicDir, n) })).find((c) => fs.existsSync(c.full))
    if (existing) {
      const ext = existing.name.endsWith('.png') ? 'png' : 'jpeg'
      logoId = wb.addImage({ filename: existing.full, extension: ext as any })
    }

    const currencyFmt = '"Q"#,##0.00'
    const dateFmt = 'dd/mm/yyyy'

    const groupTotal = (loans || []).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0)
    const getClientName = (client: any) => {
      const c = Array.isArray(client) ? client[0] : client
      return `${(c?.first_name || '')} ${(c?.last_name || '')}`.trim()
    }
    const getGroupName = (grp: any) => {
      const g = Array.isArray(grp) ? grp[0] : grp
      return g?.nombre || ''
    }
    for (const loan of loans || []) {
      const ws = wb.addWorksheet(getClientName(loan.client) || loan.loan_number)
      ws.getRow(1).height = 48
      if (logoId !== null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 40 } })
      ws.mergeCells('B1:J1')
      ws.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
      ws.mergeCells('A2:J2')
      ws.getCell('A2').value = `Acercate - Plan ${loan.loan_number}`
      ws.mergeCells('A3:J3')
      ws.getCell('A3').value = `Grupo: ${getGroupName(row?.group)}`
      ws.mergeCells('A4:J4')
      ws.getCell('A4').value = `Monto prestado: ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(loan.amount) || 0)} | Total prestado del grupo: ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(groupTotal)}`
      ws.addRow([])
      // Desglose por préstamo
      const rows = (schedules || []).filter((s: any) => s.loan_id === loan.id)
      const n = rows.length || 1
      const amount = Number(loan.amount || 0)
      const capitalMes = Math.round((amount / n) * 100) / 100
      const interesMes = Math.round((Number(rows[0]?.interest || 0)) * 100) / 100
      const adminFees = Number(rows[0]?.admin_fees ?? 20)
      const cuotaBase = Math.round((capitalMes + interesMes + adminFees) * 100) / 100
      const totalBase = Math.round((cuotaBase * n) * 100) / 100
      ws.addRow([`Capital mensual: Q ${capitalMes.toFixed(2)}`, `Interés mensual: Q ${interesMes.toFixed(2)}`, `Aporte: Q ${adminFees.toFixed(2)}`, `Cuota base mensual: Q ${cuotaBase.toFixed(2)}`])
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
      let remaining = Number(loan.amount || 0)
      let saldoTotal = totalBase
      for (const s of rows) {
        const totalDue = Number(s.amount || 0) + Number(s.mora || 0)
        remaining = Math.max(0, remaining - Number(s.principal || 0))
        saldoTotal = Math.max(0, Math.round((saldoTotal - (cuotaBase + Number(s.mora || 0))) * 100) / 100)
        const rowAdded = ws.addRow([
          s.payment_number,
          new Date(s.due_date),
          totalDue,
          Number(s.principal||0),
          Number(s.interest||0),
          Number(s.mora||0),
          Number(s.admin_fees||0),
          remaining,
          saldoTotal,
          s.status,
        ])
        rowAdded.getCell(2).numFmt = dateFmt
        ;[3,4,5,6,7,8,9].forEach((i) => { rowAdded.getCell(i).numFmt = currencyFmt })
      }
      ws.columns = [
        { width: 10 }, { width: 18 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 },
      ]
    }

    const buf = await wb.xlsx.writeBuffer()
    const h = new Headers()
    h.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const ts = new Date().toISOString().slice(0,10)
    h.append('Content-Disposition', `attachment; filename="Acercate_Plan_Grupo_${getGroupName(row?.group) || groupId}_${ts}.xlsx"`)
    return new NextResponse(new Uint8Array(buf), { headers: h })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}