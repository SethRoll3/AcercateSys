"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, FileText, Calendar, Download } from "lucide-react"
import { LoadingSpinner } from "@/components/loading-spinner"
import { toast } from "@/hooks/use-toast"
import { useEffect } from "react"

type ReportKey = "payments_general" | "delinquent_portfolio" | "aged_receivables" | "portfolio_total" | "client_payments" | "loans_granted" | "interest_receivable" | "loan_statement" | null

const REPORTS: { key: Exclude<ReportKey, null>; title: string; description: string; excelUrl: string; pdfUrl: string; dateField: string; }[] = [
  {
    key: "payments_general",
    title: "General de Pagos",
    description: "Detalle consolidado de pagos por cliente y préstamo.",
    excelUrl: "/api/reports/payments",
    pdfUrl: "/api/reports/payments/pdf",
    dateField: "payment_date",
  },
  {
    key: "delinquent_portfolio",
    title: "Cartera en Mora",
    description: "Cuotas en mora por préstamos individuales y de grupo.",
    excelUrl: "/api/reports/delinquent/excel",
    pdfUrl: "/api/reports/delinquent/pdf",
    dateField: "due_date",
  },
  {
    key: "aged_receivables",
    title: "Antigüedad de Saldos",
    description: "Clasificación de saldos por días de vencimiento (Corriente, 1-30, 31-60, 61-90, +90).",
    excelUrl: "/api/reports/aged-receivables/excel",
    pdfUrl: "/api/reports/aged-receivables/pdf",
    dateField: "due_date",
  },
  {
    key: "portfolio_total",
    title: "Total Cartera",
    description: "Resumen ejecutivo: prestado, recuperado, pendiente y clientes por género.",
    excelUrl: "/api/reports/portfolio-total/excel",
    pdfUrl: "/api/reports/portfolio-total/pdf",
    dateField: "start_date",
  },
  // DESACTIVADO TEMPORALMENTE — descomentar cuando lo pidan
  // {
  //   key: "client_payments",
  //   title: "Pagos por Cliente",
  //   description: "Todos los pagos aprobados agrupados por cliente y préstamo, con links a boletas.",
  //   excelUrl: "/api/reports/client-payments/excel",
  //   pdfUrl: "/api/reports/client-payments/pdf",
  //   dateField: "payment_date",
  // },
  {
    key: "loans_granted",
    title: "Préstamos Otorgados",
    description: "Reporte mensual de todos los préstamos otorgados en el período seleccionado.",
    excelUrl: "/api/reports/loans-granted/excel",
    pdfUrl: "/api/reports/loans-granted/pdf",
    dateField: "start_date",
  },
  {
    key: "interest_receivable",
    title: "Intereses por Cobrar",
    description: "Detalle de intereses generados, cobrados y pendientes por cada préstamo activo.",
    excelUrl: "/api/reports/interest-receivable/excel",
    pdfUrl: "/api/reports/interest-receivable/pdf",
    dateField: "due_date",
  },
  {
    key: "loan_statement",
    title: "Estado de Cuenta de Préstamos",
    description: "Saldo inicial, pagos a capital, intereses, gastos administrativos y saldo actual por préstamo.",
    excelUrl: "/api/reports/loan-statement/excel",
    pdfUrl: "/api/reports/loan-statement/pdf",
    dateField: "start_date",
  },
]

export default function ReporteriaPage() {
  const [selected, setSelected] = useState<ReportKey>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState<"excel" | "pdf" | null>(null)
  const [useDateRange, setUseDateRange] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(t)
  }, [])

  if (isLoading) return <LoadingSpinner />

  const selectedReport = REPORTS.find((r) => r.key === selected)

  const buildUrl = (baseUrl: string, format: "excel" | "pdf") => {
    const params = new URLSearchParams()
    if (useDateRange && startDate && endDate) {
      // For the payments_general Excel endpoint, use startDate/endDate params
      if (selected === "payments_general" && format === "excel") {
        params.set("startDate", startDate)
        params.set("endDate", endDate)
      } else {
        params.set("from", startDate)
        params.set("to", endDate)
      }
    }
    // For payments_general Excel, we also need params even without dates (it returns JSON)
    if (selected === "payments_general" && format === "excel" && !useDateRange) {
      // no params = all data
    }
    const qs = params.toString()
    return qs ? `${baseUrl}?${qs}` : baseUrl
  }

  const handleDownloadExcel = async () => {
    if (!selectedReport) return
    if (useDateRange && (!startDate || !endDate)) {
      toast({ title: "Error", description: "Por favor selecciona ambas fechas.", variant: "destructive" })
      return
    }
    if (useDateRange && new Date(startDate) > new Date(endDate)) {
      toast({ title: "Error", description: "La fecha de inicio debe ser anterior a la fecha de fin.", variant: "destructive" })
      return
    }

    setIsDownloading("excel")
    try {
      // For payments_general, it returns JSON → build Excel client-side
      if (selected === "payments_general") {
        await downloadPaymentsGeneralExcel()
        return
      }

      const url = buildUrl(selectedReport.excelUrl, "excel")
      const response = await fetch(url)
      if (!response.ok) {
        let errorMsg = "Error al descargar el reporte"
        try { const d = await response.json(); errorMsg = d?.error || errorMsg } catch {}
        throw new Error(errorMsg)
      }
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `Cooperativa_${selectedReport.title.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
      toast({ title: "✅ Reporte descargado", description: "El Excel se descargó exitosamente." })
    } catch (error: any) {
      console.error("Error:", error)
      toast({ title: "❌ Error al descargar", description: String(error?.message || "Hubo un error."), variant: "destructive" })
    } finally {
      setIsDownloading(null)
    }
  }

  const handleDownloadPdf = async () => {
    if (!selectedReport) return
    if (useDateRange && (!startDate || !endDate)) {
      toast({ title: "Error", description: "Por favor selecciona ambas fechas.", variant: "destructive" })
      return
    }
    if (useDateRange && new Date(startDate) > new Date(endDate)) {
      toast({ title: "Error", description: "La fecha de inicio debe ser anterior a la fecha de fin.", variant: "destructive" })
      return
    }

    setIsDownloading("pdf")
    try {
      const url = buildUrl(selectedReport.pdfUrl, "pdf")
      const response = await fetch(url)

      // Check content-type to detect JSON error responses before trying to blob
      const contentType = response.headers.get("content-type") || ""
      if (!response.ok || contentType.includes("application/json")) {
        let errorMsg = `Error ${response.status} al generar el PDF`
        try { const d = await response.json(); errorMsg = d?.error || errorMsg } catch {}
        throw new Error(errorMsg)
      }

      const blob = await response.blob()
      if (blob.size === 0) throw new Error("El servidor devolvió un PDF vacío.")

      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `Cooperativa_${selectedReport.title.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
      toast({ title: "✅ Reporte descargado", description: "El PDF se descargó exitosamente." })
    } catch (error: any) {
      console.error("Error PDF:", error)
      toast({ title: "❌ Error al descargar PDF", description: String(error?.message || "Hubo un error al generar el PDF."), variant: "destructive" })
    } finally {
      setIsDownloading(null)
    }
  }

  // General Payments Excel (client-side generation via JSON API + xlsx-js-style)
  const downloadPaymentsGeneralExcel = async () => {
    try {
      const XLSX = (await import("xlsx-js-style")).default
      const params = new URLSearchParams()
      if (useDateRange && startDate && endDate) {
        params.set("startDate", startDate)
        params.set("endDate", endDate)
      }
      const url = `/api/reports/payments${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Error al obtener datos")
      const reportData = await res.json()
      if (!reportData.clients?.length) {
        toast({ title: "⚠️ Sin datos", description: "No se encontraron pagos en el rango seleccionado." })
        return
      }

      const workbook = XLSX.utils.book_new()
      const colors = { primaryBlue: "2563EB", lightBlue: "3B82F6", green: "059669", lightGray: "F3F4F6", darkGray: "6B7280", white: "FFFFFF", alternateRow: "F8FAFC" }

      const styles = {
        mainTitle: { font: { bold: true, sz: 18, color: { rgb: colors.white } }, fill: { patternType: "solid", fgColor: { rgb: colors.primaryBlue } }, alignment: { horizontal: "center", vertical: "center" } },
        subTitle: { font: { bold: true, sz: 12, color: { rgb: colors.darkGray } }, fill: { patternType: "solid", fgColor: { rgb: colors.lightGray } }, alignment: { horizontal: "left", vertical: "center" } },
        columnHeader: { font: { bold: true, sz: 11, color: { rgb: colors.white } }, fill: { patternType: "solid", fgColor: { rgb: colors.lightBlue } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } },
        summaryHeader: { font: { bold: true, sz: 14, color: { rgb: colors.white } }, fill: { patternType: "solid", fgColor: { rgb: colors.green } }, alignment: { horizontal: "center", vertical: "center" } },
        summaryLabel: { font: { bold: true, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: colors.lightGray } }, alignment: { horizontal: "left", vertical: "center" } },
        summaryValue: { font: { bold: true, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: colors.lightGray } }, alignment: { horizontal: "right", vertical: "center" } },
      }

      const excelData: any[] = []
      const rangeLabel = useDateRange && startDate && endDate
        ? `Período: ${new Date(startDate).toLocaleDateString('es-GT')} - ${new Date(endDate).toLocaleDateString('es-GT')}`
        : 'Todos los datos (sin filtro de fecha)'

      excelData.push(["COOPERATIVA - REPORTE GENERAL DE PAGOS", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push([rangeLabel, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push([`Generado el: ${new Date().toLocaleDateString("es-GT")} a las ${new Date().toLocaleTimeString("es-GT")}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push([])
      excelData.push([])
      const headers = ["Cliente", "Email", "Teléfono", "Préstamo", "Monto Préstamo", "Fecha Pago", "Método", "Programado", "Capital", "Intereses", "Pagado", "Estado", "Mora", "Gastos Admin.", "Vencimiento", "Notas"]
      excelData.push(headers)

      let dataRowIndex = 6
      reportData.clients.forEach((client: any) => {
        client.payments.forEach((p: any, i: number) => {
          const interest = typeof p.interest === 'number' ? p.interest : Math.max(0, Number(p.scheduledAmount || 0) - Number(p.capital || 0) - Number(p.mora || 0) - Number(p.adminFees || 0))
          excelData.push([
            i === 0 ? client.clientName : "", i === 0 ? client.clientEmail : "", i === 0 ? client.clientPhone : "",
            p.loanNumber, p.loanAmount, new Date(p.paymentDate), p.paymentMethod,
            p.scheduledAmount, p.capital, interest, p.paidAmount, p.paymentStatus, p.mora, Number(p.adminFees || 0), new Date(p.dueDate), p.notes || ""
          ])
          dataRowIndex++
        })
        excelData.push([])
        dataRowIndex++
      })

      excelData.push([])
      const summaryHeaderRowIndex = excelData.length
      excelData.push(["RESUMEN EJECUTIVO", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""])
      excelData.push([])
      const totalIntereses = reportData.clients.reduce((sum: number, c: any) => sum + c.payments.reduce((s: number, p: any) => s + (typeof p.interest === 'number' ? p.interest : Math.max(0, Number(p.scheduledAmount || 0) - Number(p.capital || 0) - Number(p.mora || 0) - Number(p.adminFees || 0))), 0), 0)
      excelData.push(["Total de Clientes:", String(reportData.totals.totalClients)])
      excelData.push(["Total de Pagos:", String(reportData.totals.totalPayments)])
      excelData.push(["Total Monto Programado:", reportData.totals.totalScheduledAmount])
      excelData.push(["Total Capital:", reportData.totals.totalCapital])
      excelData.push(["Total Intereses:", totalIntereses])
      excelData.push(["Total Monto Pagado:", reportData.totals.totalPaidAmount])
      excelData.push(["Total Mora:", reportData.totals.totalMora])

      const worksheet = XLSX.utils.aoa_to_sheet(excelData)
      worksheet['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 25 }]

      // Styles
      for (let col = 0; col <= 15; col++) {
        const c0 = XLSX.utils.encode_cell({ r: 0, c: col }); if (worksheet[c0]) worksheet[c0].s = styles.mainTitle
        for (let row = 1; row <= 2; row++) { const cr = XLSX.utils.encode_cell({ r: row, c: col }); if (worksheet[cr]) worksheet[cr].s = styles.subTitle }
        const c5 = XLSX.utils.encode_cell({ r: 5, c: col }); if (worksheet[c5]) worksheet[c5].s = styles.columnHeader
      }
      for (let row = summaryHeaderRowIndex; row <= summaryHeaderRowIndex; row++) {
        for (let col = 0; col <= 15; col++) {
          const cr = XLSX.utils.encode_cell({ r: row, c: col }); if (worksheet[cr]) worksheet[cr].s = styles.summaryHeader
        }
      }
      for (let row = summaryHeaderRowIndex + 2; row <= summaryHeaderRowIndex + 8; row++) {
        const lc = XLSX.utils.encode_cell({ r: row, c: 0 }); if (worksheet[lc]) worksheet[lc].s = styles.summaryLabel
        const vc = XLSX.utils.encode_cell({ r: row, c: 1 }); if (worksheet[vc]) { worksheet[vc].s = { ...styles.summaryValue }; if (row >= summaryHeaderRowIndex + 4) worksheet[vc].s.numFmt = '"Q"#,##0.00' }
      }

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 15 } },
        { s: { r: summaryHeaderRowIndex, c: 0 }, e: { r: summaryHeaderRowIndex, c: 15 } },
      ]
      worksheet['!rows'] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 20 }, { hpt: 15 }, { hpt: 15 }, { hpt: 25 }]

      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte de Pagos")
      const ts = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `Cooperativa_Reporte_Pagos_${ts}.xlsx`)
      toast({ title: "✅ Reporte descargado", description: "El Excel se descargó exitosamente." })
    } catch (error: any) {
      console.error("Error:", error)
      toast({ title: "❌ Error", description: String(error?.message || "Error al generar el reporte."), variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Reportería</h1>
        <p className="text-muted-foreground">Elige un reporte, configura el rango de fechas y descárgalo en Excel o PDF.</p>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => (
          <Card
            key={report.key}
            role="button"
            aria-label={`Reporte ${report.title}`}
            onClick={() => { setSelected(report.key); setUseDateRange(false); setStartDate(""); setEndDate("") }}
            className={`cursor-pointer border bg-card/50 backdrop-blur-sm transition-all ${selected === report.key ? "ring-2 ring-primary shadow-lg" : "hover:bg-muted/40"}`}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                {report.title}
              </CardTitle>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Selected Report Panel */}
      {selectedReport && (
        <div className="flex justify-center">
          <Card className="w-full max-w-2xl bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                {selectedReport.title}
              </CardTitle>
              <CardDescription>{selectedReport.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Date Range Toggle */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useDateRange}
                      onChange={(e) => setUseDateRange(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">Filtrar por rango de fechas</span>
                  </label>
                  {!useDateRange && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      Sin fecha = Todos los datos
                    </span>
                  )}
                </div>

                {useDateRange && (
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
                )}
              </div>

              {/* Download Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleDownloadExcel}
                  disabled={isDownloading !== null}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  {isDownloading === "excel" ? (
                    "Descargando..."
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      Descargar Excel
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDownloadPdf}
                  disabled={isDownloading !== null}
                  className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                >
                  {isDownloading === "pdf" ? (
                    "Descargando..."
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      <FileText className="h-4 w-4 mr-1" />
                      Descargar PDF
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
