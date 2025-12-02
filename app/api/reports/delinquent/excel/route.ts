  import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { translateStatus } from "@/lib/utils"
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

      const { searchParams } = new URL(request.url)
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')

      let loanIdsForAdvisor: string[] = []
      if (me.role === 'asesor') {
        const { data: assignedClients } = await admin.from('clients').select('id').eq('advisor_id', me.id)
        const clientIds = (assignedClients || []).map((c: any) => String(c.id))
        if (!clientIds.length) {
          const wb = new ExcelJS.Workbook()
          wb.addWorksheet('Cartera en Mora')
          const buf = await wb.xlsx.writeBuffer()
          const headers = new Headers()
          headers.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          headers.append('Content-Disposition', `attachment; filename="Cooperativa_Cartera_Mora_${new Date().toISOString().slice(0,10)}.xlsx"`)
          return new NextResponse(new Uint8Array(buf), { headers })
        }
        const { data: advisorLoans } = await admin
          .from('loans')
          .select('id')
          .in('client_id', clientIds)
        loanIdsForAdvisor = (advisorLoans || []).map((l: any) => String(l.id))
        if (!loanIdsForAdvisor.length) {
          const wb = new ExcelJS.Workbook()
          wb.addWorksheet('Cartera en Mora')
          const buf = await wb.xlsx.writeBuffer()
          const headers = new Headers()
          headers.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          headers.append('Content-Disposition', `attachment; filename="Cooperativa_Cartera_Mora_${new Date().toISOString().slice(0,10)}.xlsx"`)
          return new NextResponse(new Uint8Array(buf), { headers })
        }
      }

      let scheduleQuery = admin
        .from('payment_schedule')
        .select('id, loan_id, payment_number, due_date, amount, principal, interest, mora, admin_fees, status')
        .or('status.eq.overdue,mora.gt.0')
        .order('due_date', { ascending: true })

      if (startDate) {
        scheduleQuery = scheduleQuery.gte('due_date', startDate)
      }
      if (endDate) {
        scheduleQuery = scheduleQuery.lte('due_date', endDate)
      }

      if (me.role === 'asesor' && loanIdsForAdvisor.length) {
        scheduleQuery = scheduleQuery.in('loan_id', loanIdsForAdvisor)
      }

      const { data: schedules, error: schedulesError } = await scheduleQuery
      if (schedulesError) return NextResponse.json({ error: schedulesError.message }, { status: 500 })

      const loanIds = Array.from(new Set((schedules || []).map((s: any) => String(s.loan_id)).filter(Boolean)))
      if (!loanIds.length) {
        const wb = new ExcelJS.Workbook()
        wb.addWorksheet('Cartera en Mora')
        const buf = await wb.xlsx.writeBuffer()
        const headers = new Headers()
        headers.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        headers.append('Content-Disposition', `attachment; filename="Cooperativa_Cartera_Mora_${new Date().toISOString().slice(0,10)}.xlsx"`)
        return new NextResponse(new Uint8Array(buf), { headers })
      }

      const { data: loans, error: loansError } = await admin
        .from('loans')
        .select('id, loan_number, amount, client:clients(id, first_name, last_name, email)')
        .in('id', loanIds)
      if (loansError) return NextResponse.json({ error: loansError.message }, { status: 500 })

      const loansMap: Record<string, any> = {}
      for (const l of (loans || [])) loansMap[String(l.id)] = l

      const { data: groupRows } = await admin
        .from('loans_groups')
        .select('group_id, group:grupos(nombre), loans, total_amount')

      const loanToGroup: Record<string, { groupId: string, groupName: string, groupTotal: number }> = {}
      for (const gr of (groupRows || [])) {
        const g = Array.isArray((gr as any).group) ? (gr as any).group[0] : (gr as any).group
        const groupName = g?.nombre || ''
        const totalAmount = Number((gr as any).total_amount || 0)
        for (const entry of ((gr as any).loans || [])) {
          const k = String(entry.loan_id)
          loanToGroup[k] = { groupId: String((gr as any).group_id), groupName, groupTotal: totalAmount }
        }
      }

      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('Cartera en Mora')

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

      ws.mergeCells('A1:M1')
      ws.getCell('A1').value = 'Cartera en Mora'
      ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
      if (logoImageId !== null) ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 65 } })
      ws.getRow(1).height = 60

      // Set the date in the top right corner
      ws.getCell('L3').value = `Generado el: ${new Date().toLocaleDateString('es-GT')}`
      // Remove previous A2 date setup
      ws.unMergeCells('A2:M2')
      //ws.getCell('A2').value = null
      //ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }

      ws.addRow([])

      const headers = [
        'Tipo', 'Cliente/Grupo', 'Número de Préstamo', 'Monto del Préstamo', 'Cuota #', 'Fecha de Vencimiento', 'Estado',
        'Monto Programado', 'Capital', 'Interés', 'Mora', 'Gastos Adm.', 'Total a Pagar'
      ]
      const currencyFmt = '"Q"#,##0.00'
      const dateFmt = 'dd/mm/yyyy'

      const filteredSchedules = (schedules || []).filter((s: any) => Number(s.mora) > 0)
      const individuals = filteredSchedules.filter((s: any) => !loanToGroup[String(s.loan_id)])
      const grouped = filteredSchedules.filter((s: any) => loanToGroup[String(s.loan_id)])

      const addRows = (rows: any[], tipo: 'Individual' | 'Grupo') => {
        for (const s of rows) {
          const loan = loansMap[String((s as any).loan_id)]
          const client = loan?.client
          const nombre = tipo === 'Individual'
            ? `${client?.first_name || ''} ${client?.last_name || ''}`.trim()
            : (loanToGroup[String((s as any).loan_id)]?.groupName || '')
          const montoPrestamo = Number(loan?.amount || 0)
        const programado = Number((s as any).amount || 0)
        const capital = Number((s as any).principal || 0)
        const interes = Number((s as any).interest || 0)
        const mora = Number((s as any).mora || 0)
        const gastos = Number((s as any).admin_fees || 0)
        const totalPagar = programado + mora
          const translatedStatus = translateStatus(String((s as any).status || ''))
          const row = ws.addRow([
            tipo,
            nombre || (tipo === 'Individual' ? 'N/A' : 'Grupo sin nombre'),
            loan?.loan_number || '',
            montoPrestamo,
            (s as any).payment_number,
            new Date((s as any).due_date),
            translatedStatus,
            programado,
            capital,
            interes,
            mora,
            gastos,
            totalPagar,
          ])
          row.getCell(6).numFmt = dateFmt
          ;[4,8,9,10,11,13].forEach((i) => { row.getCell(i).numFmt = currencyFmt })
        }
        ws.addRow([])
      }

      const sectionTitle = (text: string) => {
        const r = ws.addRow([text])
        r.getCell(1).font = { bold: true }
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
        ws.addRow([])
        const hr = ws.addRow(headers)
        hr.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
        })
      }

      sectionTitle('Sección: Préstamos Individuales')
      addRows(individuals, 'Individual')

      const groupsById: Record<string, any[]> = {}
      for (const s of grouped) {
        const g = loanToGroup[String((s as any).loan_id)]
        if (!g) continue
        ;(groupsById[g.groupId] ||= []).push(s)
      }
      for (const gid of Object.keys(groupsById)) {
        const meta = Object.values(loanToGroup).find((v) => v.groupId === gid)
        const title = `Sección: Préstamos de Grupo — ${meta?.groupName || gid} — Total prestado: ${new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(meta?.groupTotal || 0))}`
        sectionTitle(title)
        addRows(groupsById[gid], 'Grupo')
      }

      ws.columns = [
        { width: 12 }, { width: 28 }, { width: 18 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 },
      ]

      const buffer = await workbook.xlsx.writeBuffer()
      const respHeaders = new Headers()
      respHeaders.append('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      const ts = new Date().toISOString().slice(0,10)
      respHeaders.append('Content-Disposition', `attachment; filename="Cooperativa_Cartera_Mora_${ts}.xlsx"`)
      return new NextResponse(new Uint8Array(buffer), { headers: respHeaders })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
    }
  }

