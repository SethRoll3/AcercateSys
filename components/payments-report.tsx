"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Download, Calendar, FileSpreadsheet } from "lucide-react"
import * as XLSX from "xlsx-js-style"

interface PaymentData {
  paymentId: string
  paymentDate: string
  paymentMethod: string
  loanNumber: string
  loanAmount: number
  scheduledAmount: number
  capital: number
  paidAmount: number
  mora: number
  paymentStatus: string
  dueDate: string
  notes: string
}

interface ClientData {
  clientId: string
  clientName: string
  clientEmail: string
  clientPhone: string
  payments: PaymentData[]
}

interface ReportData {
  dateRange: {
    startDate: string
    endDate: string
  }
  clients: ClientData[]
  totals: {
    totalPaidAmount: number
    totalMora: number
    totalScheduledAmount: number
    totalCapital: number
    totalPayments: number
    totalClients: number
  }
}

export function PaymentsReport() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Set default dates to current month
  const getCurrentMonthDates = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    setStartDate(firstDay.toISOString().split('T')[0])
    setEndDate(lastDay.toISOString().split('T')[0])
  }

  const fetchReportData = async (): Promise<ReportData | null> => {
    try {
      const response = await fetch(
        `/api/reports/payments?startDate=${startDate}&endDate=${endDate}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al obtener los datos del reporte")
      }

      return await response.json()
    } catch (error) {
      console.error("Error fetching report data:", error)
      toast.error("Error al obtener los datos del reporte")
      return null
    }
  }

  const generateExcelReport = async () => {
    if (!startDate || !endDate) {
      toast.error("Por favor selecciona un rango de fechas")
      return
    }

    if (new Date(startDate) > new Date(endDate)) {
      toast.error("La fecha de inicio debe ser anterior a la fecha de fin")
      return
    }

    setIsLoading(true)

    try {
      const reportData = await fetchReportData()
      if (!reportData) return

      if (reportData.clients.length === 0) {
        toast.warning("No se encontraron pagos en el rango de fechas seleccionado")
        setIsLoading(false)
        return
      }

      // Create workbook (cliente)
      const workbook = XLSX.utils.book_new()

      // Professional color scheme
      const colors = {
        primaryBlue: "2563EB",
        lightBlue: "3B82F6", 
        darkBlue: "1E40AF",
        green: "059669",
        lightGray: "F3F4F6",
        darkGray: "6B7280",
        white: "FFFFFF",
        alternateRow: "F8FAFC"
      }

      // Professional styles
      const styles = {
        mainTitle: {
          font: { bold: true, sz: 18, color: { rgb: colors.white } },
          fill: { patternType: "solid", fgColor: { rgb: colors.primaryBlue } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: colors.darkBlue } },
            bottom: { style: "medium", color: { rgb: colors.darkBlue } },
            left: { style: "medium", color: { rgb: colors.darkBlue } },
            right: { style: "medium", color: { rgb: colors.darkBlue } }
          }
        },
        subTitle: {
          font: { bold: true, sz: 12, color: { rgb: colors.darkGray } },
          fill: { patternType: "solid", fgColor: { rgb: colors.lightGray } },
          alignment: { horizontal: "left", vertical: "center" }
        },
        columnHeader: {
          font: { bold: true, sz: 11, color: { rgb: colors.white } },
          fill: { patternType: "solid", fgColor: { rgb: colors.lightBlue } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: colors.darkBlue } },
            bottom: { style: "thin", color: { rgb: colors.darkBlue } },
            left: { style: "thin", color: { rgb: colors.darkBlue } },
            right: { style: "thin", color: { rgb: colors.darkBlue } }
          }
        },
        dataCell: {
          font: { sz: 10 },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        dataCellAlternate: {
          font: { sz: 10 },
          fill: { patternType: "solid", fgColor: { rgb: colors.alternateRow } },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        currencyCell: {
          font: { sz: 10 },
          alignment: { horizontal: "right", vertical: "center" },
          numFmt: '"Q"#,##0.00',
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        currencyCellAlternate: {
          font: { sz: 10 },
          fill: { patternType: "solid", fgColor: { rgb: colors.alternateRow } },
          alignment: { horizontal: "right", vertical: "center" },
          numFmt: '"Q"#,##0.00',
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        dateCell: {
          font: { sz: 10 },
          alignment: { horizontal: "center", vertical: "center" },
          numFmt: "dd/mm/yyyy",
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        dateCellAlternate: {
          font: { sz: 10 },
          fill: { patternType: "solid", fgColor: { rgb: colors.alternateRow } },
          alignment: { horizontal: "center", vertical: "center" },
          numFmt: "dd/mm/yyyy",
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        summaryHeader: {
          font: { bold: true, sz: 14, color: { rgb: colors.white } },
          fill: { patternType: "solid", fgColor: { rgb: colors.green } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: colors.green } },
            bottom: { style: "medium", color: { rgb: colors.green } },
            left: { style: "medium", color: { rgb: colors.green } },
            right: { style: "medium", color: { rgb: colors.green } }
          }
        },
        summaryLabel: {
          font: { bold: true, sz: 11 },
          fill: { patternType: "solid", fgColor: { rgb: colors.lightGray } },
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        },
        summaryValue: {
          font: { bold: true, sz: 11 },
          fill: { patternType: "solid", fgColor: { rgb: colors.lightGray } },
          alignment: { horizontal: "right", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: colors.darkGray } },
            bottom: { style: "thin", color: { rgb: colors.darkGray } },
            left: { style: "thin", color: { rgb: colors.darkGray } },
            right: { style: "thin", color: { rgb: colors.darkGray } }
          }
        }
      }

      // Prepare data for Excel
      const excelData: any[] = []

      // Add header information
      excelData.push([
        "COOPERATIVA - REPORTE GENERAL DE PAGOS",
        "", "", "", "", "", "", "", "", "", "", "", "", ""
      ])
      excelData.push([
        `Período: ${new Date(startDate).toLocaleDateString("es-GT")} - ${new Date(endDate).toLocaleDateString("es-GT")}`,
        "", "", "", "", "", "", "", "", "", "", "", "", ""
      ])
      excelData.push([
        `Generado el: ${new Date().toLocaleDateString("es-GT")} a las ${new Date().toLocaleTimeString("es-GT")}`,
        "", "", "", "", "", "", "", "", "", "", "", "", ""
      ])
      // El logo se inserta vía servidor; no añadimos enlace aquí
      excelData.push([]) // Empty row
      excelData.push([]) // Empty row

      // Add column headers
      const headers = [
        "Cliente", "Email", "Teléfono", "Número de Préstamo", "Monto del Préstamo",
        "Fecha de Pago", "Método de Pago", "Monto Programado", "Capital", "Monto Pagado",
        "Estado del Pago", "Mora", "Fecha de Vencimiento", "Notas"
      ]
      excelData.push(headers)

      // Add client data
      let dataRowIndex = 6 // Starting after headers
      reportData.clients.forEach(client => {
        client.payments.forEach((payment, index) => {
          excelData.push([
            index === 0 ? client.clientName : "",
            index === 0 ? client.clientEmail : "",
            index === 0 ? client.clientPhone : "",
            payment.loanNumber,
            payment.loanAmount,
            new Date(payment.paymentDate),
            payment.paymentMethod,
            payment.scheduledAmount,
            payment.capital,
            payment.paidAmount,
            payment.paymentStatus,
            payment.mora,
            new Date(payment.dueDate),
            payment.notes || ""
          ])
          dataRowIndex++
        })
        excelData.push([]) // Empty row between clients
        dataRowIndex++
      })

      // Add summary section
      excelData.push([]) // Empty row
      excelData.push(["RESUMEN EJECUTIVO", "", "", "", "", "", "", "", "", "", "", "", "", ""])
      const summaryHeaderRowIndex = excelData.length - 1
      excelData.push([]) // Empty row
      excelData.push(["Total de Clientes:", String(reportData.totals.totalClients), "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push(["Total de Pagos:", String(reportData.totals.totalPayments), "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push(["Total Monto Programado:", reportData.totals.totalScheduledAmount, "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push(["Total Capital:", reportData.totals.totalCapital, "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push(["Total Monto Pagado:", reportData.totals.totalPaidAmount, "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push(["Total Mora:", reportData.totals.totalMora, "", "", "", "", "", "", "", "", "", "", "", ""])

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(excelData)

      // Set column widths
      worksheet['!cols'] = [
        { wch: 25 }, // Cliente
        { wch: 30 }, // Email
        { wch: 15 }, // Teléfono
        { wch: 18 }, // Número de Préstamo
        { wch: 18 }, // Monto del Préstamo
        { wch: 15 }, // Fecha de Pago
        { wch: 18 }, // Método de Pago
        { wch: 18 }, // Monto Programado
        { wch: 15 }, // Capital
        { wch: 15 }, // Monto Pagado
        { wch: 18 }, // Estado del Pago
        { wch: 12 }, // Mora
        { wch: 18 }, // Fecha de Vencimiento
        { wch: 25 }  // Notas
      ]

      // Apply styles to cells
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')

      // Style main title (row 1)
      for (let col = 0; col <= 13; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col })
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = styles.mainTitle
        }
      }

      // Style subtitle rows (rows 2-3)
      for (let row = 1; row <= 2; row++) {
        for (let col = 0; col <= 13; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
          if (worksheet[cellRef]) {
            worksheet[cellRef].s = styles.subTitle
          }
        }
      }

      // Style column headers (row 6)
      for (let col = 0; col <= 13; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: 5, c: col })
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = styles.columnHeader
        }
      }

      // Style data rows with alternating colors (exclude summary section)
      for (let row = 6; row < summaryHeaderRowIndex; row++) {
        const isAlternate = (row - 6) % 2 === 1
        
        for (let col = 0; col <= 13; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
          if (worksheet[cellRef]) {
            // Currency columns: 4, 7, 8, 9, 11 (Monto del Préstamo, Monto Programado, Capital, Monto Pagado, Mora)
            if ([4, 7, 8, 9, 11].includes(col)) {
              worksheet[cellRef].s = isAlternate ? styles.currencyCellAlternate : styles.currencyCell
            }
            // Date columns: 5, 12 (Fecha de Pago, Fecha de Vencimiento)
            else if ([5, 12].includes(col)) {
              worksheet[cellRef].s = isAlternate ? styles.dateCellAlternate : styles.dateCell
            }
            // Regular data columns
            else {
              worksheet[cellRef].s = isAlternate ? styles.dataCellAlternate : styles.dataCell
            }
          }
        }
      }

      // Find and style summary section
      for (let row = summaryHeaderRowIndex; row <= range.e.r; row++) {
        const cellA = XLSX.utils.encode_cell({ r: row, c: 0 })
        if (worksheet[cellA] && worksheet[cellA].v === "RESUMEN EJECUTIVO") {
          // Style summary header
          for (let col = 0; col <= 13; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
            if (worksheet[cellRef]) {
              worksheet[cellRef].s = styles.summaryHeader
            }
          }
          
          // Style summary rows
           for (let summaryRow = row + 2; summaryRow <= row + 7; summaryRow++) {
             const labelCell = XLSX.utils.encode_cell({ r: summaryRow, c: 0 })
             const valueCell = XLSX.utils.encode_cell({ r: summaryRow, c: 1 })
             
             if (worksheet[labelCell]) {
               worksheet[labelCell].s = styles.summaryLabel
             }
             if (worksheet[valueCell]) {
               worksheet[valueCell].s = styles.summaryValue
               if ([row + 4, row + 5, row + 6, row + 7].includes(summaryRow)) {
                 worksheet[valueCell].s.numFmt = '"Q"#,##0.00'
               } else {
                 worksheet[valueCell].s.numFmt = 'General'
               }
             }
           }
          break
        }
      }

      // Merge cells for titles
      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } }
      ]

      // Find summary header and merge it
      for (let row = 0; row <= range.e.r; row++) {
        const cellA = XLSX.utils.encode_cell({ r: row, c: 0 })
        if (worksheet[cellA] && worksheet[cellA].v === "RESUMEN EJECUTIVO") {
          worksheet['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 13 } })
          break
        }
      }

      // Set row heights for better appearance
      worksheet['!rows'] = [
        { hpt: 30 }, // Main title
        { hpt: 20 }, // Period
        { hpt: 20 }, // Generated date
        { hpt: 15 }, // Empty
        { hpt: 15 }, // Empty
        { hpt: 25 }  // Headers
      ]

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte de Pagos")

      // Generate professional filename
      const startDateFormatted = new Date(startDate).toLocaleDateString("es-GT").replace(/\//g, '-')
      const endDateFormatted = new Date(endDate).toLocaleDateString("es-GT").replace(/\//g, '-')
      const timestamp = new Date().toISOString().slice(0, 10)
      const filename = `Cooperativa_Reporte_Pagos_${startDateFormatted}_${endDateFormatted}_${timestamp}.xlsx`

      // Download file
      XLSX.writeFile(workbook, filename)

      toast.success(`Reporte profesional generado exitosamente: ${filename}`)
    } catch (error) {
      console.error("Error generating Excel report:", error)
      toast.error("Error al generar el reporte Excel")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Reporte General de Pagos
        </CardTitle>
        <CardDescription>
          Genera un reporte en Excel con el detalle de pagos por cliente, incluyendo información del préstamo, montos, estado y fechas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fecha de Inicio
            </Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fecha de Fin
            </Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={getCurrentMonthDates}
            variant="outline"
            className="flex-1"
          >
            Mes Actual
          </Button>
          <Button
            onClick={generateExcelReport}
            disabled={isLoading || !startDate || !endDate}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
          >
            {isLoading ? (
              "Generando..."
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Descargar Reporte
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}