/**
 * Script standalone para generar un Excel con el resumen de pagos por cliente.
 *
 * Muestra:
 *  - Nombre del cliente (barra de encabezado)
 *  - Debajo, sus pagos: N° de pago + link "Ver aquí" a la boleta en Supabase
 *
 * Ejecución:
 *   npx ts-node --skip-project scripts/generate-payments-excel.ts
 *
 * El archivo se guarda en la raíz del proyecto como:
 *   Cooperativa_Resumen_Pagos_YYYY-MM-DD.xlsx
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'

// ─── Supabase ───
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Main ───
async function main() {
  console.log('🔄 Conectando a Supabase y obteniendo datos...')

  // 1. Clientes
  const { data: clients, error: clientsErr } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .order('first_name', { ascending: true })

  if (clientsErr) { console.error('❌ Error cargando clientes:', clientsErr.message); process.exit(1) }
  if (!clients || clients.length === 0) { console.log('⚠️ No hay clientes.'); process.exit(0) }

  const clientIds = clients.map(c => String(c.id))
  const clientMap: Record<string, any> = {}
  for (const c of clients) clientMap[String(c.id)] = c

  // 2. Préstamos
  const { data: loans, error: loansErr } = await supabase
    .from('loans')
    .select('id, client_id')
    .in('client_id', clientIds)

  if (loansErr) { console.error('❌ Error cargando préstamos:', loansErr.message); process.exit(1) }
  if (!loans || loans.length === 0) { console.log('⚠️ No hay préstamos.'); process.exit(0) }

  const loanIds = loans.map(l => String(l.id))

  // Agrupar loans por client_id
  const loansByClient: Record<string, any[]> = {}
  for (const l of loans) {
    const cid = String(l.client_id)
    if (!loansByClient[cid]) loansByClient[cid] = []
    loansByClient[cid].push(l)
  }

  // 3. Pagos aprobados (en chunks de 200)
  console.log('📦 Obteniendo pagos aprobados...')
  let allPayments: any[] = []
  for (let i = 0; i < loanIds.length; i += 200) {
    const chunk = loanIds.slice(i, i + 200)
    const { data: payments } = await supabase
      .from('payments')
      .select('id, amount, loan_id, schedule_id, receipt_image_url')
      .in('loan_id', chunk)
      .eq('confirmation_status', 'aprobado')
      .order('payment_date', { ascending: true })
    allPayments = allPayments.concat(payments || [])
  }

  // 4. Schedules (para obtener payment_number)
  const scheduleIds = Array.from(new Set(allPayments.map(p => p.schedule_id).filter(Boolean)))
  const scheduleMap: Record<string, any> = {}
  for (let i = 0; i < scheduleIds.length; i += 500) {
    const chunk = scheduleIds.slice(i, i + 500) as string[]
    const { data: schedules } = await supabase
      .from('payment_schedule')
      .select('id, payment_number')
      .in('id', chunk)
    for (const s of (schedules || [])) scheduleMap[String(s.id)] = s
  }

  // 5. Boletas vinculadas a los schedules (para image_url)
  const boletasBySchedule: Record<string, any[]> = {}
  if (scheduleIds.length > 0) {
    for (let i = 0; i < scheduleIds.length; i += 500) {
      const chunk = scheduleIds.slice(i, i + 500) as string[]
      const { data: cuotaBoletas } = await supabase
        .from('cuota_boletas')
        .select(`
          payment_schedule_id,
          boletas (
            id, numero_boleta, image_url, observaciones
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

  // Agrupar payments por loan_id
  const paymentsByLoan: Record<string, any[]> = {}
  for (const p of allPayments) {
    const lid = String(p.loan_id)
    if (!paymentsByLoan[lid]) paymentsByLoan[lid] = []
    paymentsByLoan[lid].push(p)
  }

  // ─── 6. Generar Excel ───
  console.log('📊 Generando Excel...')

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Resumen Pagos')

  // Colores (mismos que el reporte existente)
  const blue = '2563EB'
  const lightBlue = '3B82F6'
  const clientHeaderColor = '1E3A5F'

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
    if (fs.existsSync(p)) {
      try {
        const ext = path.extname(p).toLowerCase() === '.png' ? 'png' : 'jpeg'
        logoImageId = workbook.addImage({ filename: p, extension: ext as 'png' | 'jpeg' })
        break
      } catch {}
    }
  }

  const totalCols = 3

  // ── Fila 1: Título + Logo ──
  ws.mergeCells(1, 1, 1, totalCols)
  ws.getCell('A1').value = '  Resumen de Pagos - Boletas'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }
  if (logoImageId !== null) {
    ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 100, height: 45 } })
  }
  ws.getRow(1).height = 50

  // ── Fila 2: Fecha de generación ──
  ws.mergeCells(2, 1, 2, totalCols)
  const now = new Date()
  ws.getCell('A2').value = `Generado el: ${now.toLocaleDateString('es-GT')} a las ${now.toLocaleTimeString('es-GT')}`
  ws.getCell('A2').font = { size: 10, italic: true }
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }

  // Fila 3: vacía
  ws.addRow([])

  // ── Anchos de columna ──
  ws.getColumn(1).width = 18  // N° Pago
  ws.getColumn(2).width = 22  // Ver Boleta
  ws.getColumn(3).width = 40  // Notas

  let totalClientes = 0
  let totalPagos = 0

  // ── Iterar por cliente ──
  for (const client of clients) {
    const cid = String(client.id)
    const clientLoans = loansByClient[cid] || []

    // Verificar si tiene al menos un pago
    let hasPayments = false
    for (const loan of clientLoans) {
      if ((paymentsByLoan[String(loan.id)] || []).length > 0) {
        hasPayments = true
        break
      }
    }
    if (!hasPayments) continue

    totalClientes++
    const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim()

    // ── Barra de cliente ──
    const clientRow = ws.addRow([`CLIENTE: ${clientName}`])
    ws.mergeCells(clientRow.number, 1, clientRow.number, totalCols)
    clientRow.eachCell((cell) => {
      cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: clientHeaderColor } }
      cell.alignment = { horizontal: 'left', vertical: 'middle' }
    })
    clientRow.height = 28

    // ── Encabezados de tabla ──
    const headerRow = ws.addRow(['N° Pago', 'Ver Boleta', 'Notas'])
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBlue } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      }
    })

    // ── Filas de pagos ──
    for (const loan of clientLoans) {
      const lid = String(loan.id)
      const loanPayments = paymentsByLoan[lid] || []

      for (const payment of loanPayments) {
        totalPagos++
        const sched = scheduleMap[String(payment.schedule_id)] || {}
        const paymentNumber = sched.payment_number || '—'

        // Buscar URL de boleta y observaciones
        const boletas = boletasBySchedule[String(payment.schedule_id)] || []
        let imageUrl = payment.receipt_image_url || ''
        let observaciones = ''
        if (boletas.length > 0) {
          if (!imageUrl) imageUrl = boletas[0].image_url || ''
          observaciones = boletas[0].observaciones || ''
        }

        const dataRow = ws.addRow([paymentNumber, imageUrl ? 'Ver aquí' : '(sin boleta)', observaciones])

        // Centrar número de pago
        dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
        dataRow.getCell(1).font = { size: 10 }

        // Hyperlink en "Ver aquí"
        if (imageUrl) {
          const linkCell = dataRow.getCell(2)
          linkCell.value = { text: 'Ver aquí', hyperlink: imageUrl }
          linkCell.font = { color: { argb: '2563EB' }, underline: true, size: 10 }
          linkCell.alignment = { horizontal: 'center', vertical: 'middle' }
        } else {
          dataRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }
          dataRow.getCell(2).font = { size: 10, italic: true, color: { argb: '9CA3AF' } }
        }

        // Notas / Observaciones
        dataRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        dataRow.getCell(3).font = { size: 9 }

        // Bordes
        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
            left: { style: 'thin', color: { argb: 'E5E7EB' } },
            right: { style: 'thin', color: { argb: 'E5E7EB' } },
          }
        })
      }
    }

    // Separador entre clientes
    const sepRow = ws.addRow([])
    sepRow.height = 8
  }

  // ── Resumen al final ──
  ws.addRow([])
  const summaryHeader = ws.addRow(['RESUMEN'])
  ws.mergeCells(summaryHeader.number, 1, summaryHeader.number, totalCols)
  summaryHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } }
  summaryHeader.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  summaryHeader.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  ws.addRow([])
  const r1 = ws.addRow(['Total Clientes con pagos:', totalClientes])
  r1.getCell(1).font = { bold: true }
  const r2 = ws.addRow(['Total Pagos:', totalPagos])
  r2.getCell(1).font = { bold: true }

  // ── Guardar archivo ──
  const dateStr = now.toISOString().slice(0, 10)
  const filename = `Cooperativa_Resumen_Pagos_${dateStr}.xlsx`
  const outputPath = path.join(process.cwd(), filename)

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n✅ Excel generado exitosamente: ${filename}`)
  console.log(`📁 Ubicación: ${outputPath}`)
  console.log(`👤 Clientes con pagos: ${totalClientes}`)
  console.log(`💳 Total pagos: ${totalPagos}`)
}

main().catch((err) => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})
