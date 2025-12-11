"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PaymentsReport } from "@/components/payments-report"
import { FileSpreadsheet } from "lucide-react"
import { LoadingSpinner } from "@/components/loading-spinner"
import { format, toZonedTime } from 'date-fns-tz'

type ReportKey = "payments_general" | "delinquent_portfolio" | "aged_receivables" | null

export default function ReporteriaPage() {
  const [selected, setSelected] = useState<ReportKey>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const GUATEMALA_TIMEZONE = 'America/Guatemala'

  const getCurrentMonthDates = () => {
    const now = toZonedTime(new Date(), GUATEMALA_TIMEZONE)
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setStartDate(format(start, 'yyyy-MM-dd', { timeZone: GUATEMALA_TIMEZONE }))
    setEndDate(format(end, 'yyyy-MM-dd', { timeZone: GUATEMALA_TIMEZONE }))
  }

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(t)
  }, [])

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Reportería</h1>
        <p className="text-muted-foreground">Elige un reporte para ver sus opciones y descargarlo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          role="button"
          aria-label="Reporte General de Pagos"
          onClick={() => setSelected("payments_general")}
          className={`cursor-pointer border bg-card/50 backdrop-blur-sm ${selected === "payments_general" ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              General de Pagos
            </CardTitle>
            <CardDescription>Detalle consolidado de pagos por cliente y préstamo.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Requiere seleccionar rango de fechas.
          </CardContent>
        </Card>

        <Card
          role="button"
          aria-label="Reporte de Cartera en Mora"
          onClick={() => setSelected("delinquent_portfolio")}
          className={`cursor-pointer border bg-card/50 backdrop-blur-sm ${selected === "delinquent_portfolio" ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Cartera en Mora
            </CardTitle>
            <CardDescription>Excel con cuotas en mora, separado por individual y grupo.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Disponible para asesores y administradores.
          </CardContent>
        </Card>

        <Card
          role="button"
          aria-label="Reporte de Antigüedad de Saldos"
          onClick={() => setSelected("aged_receivables")}
          className={`cursor-pointer border bg-card/50 backdrop-blur-sm ${selected === "aged_receivables" ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Antigüedad de Saldos
            </CardTitle>
            <CardDescription>Clasificación de saldos por tiempo de vencimiento.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Disponible para asesores y administradores.
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-2xl">
          {selected === "payments_general" && <PaymentsReport />}
          {selected === "aged_receivables" && (
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Reporte de Antigüedad de Saldos</CardTitle>
                <CardDescription>Descarga el reporte clasificado por días de atraso (Corriente, 1-30, 31-60, 61-90, +90).</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={async () => {
                    setIsDownloading(true)
                    try {
                      const response = await fetch(`/api/reports/aged-receivables/excel`)
                      if (!response.ok) {
                        throw new Error("Error al descargar el reporte")
                      }
                      const blob = await response.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `Cooperativa_Antiguedad_Saldos_${new Date().toISOString().slice(0, 10)}.xlsx`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      window.URL.revokeObjectURL(url)
                    } catch (error) {
                      console.error("Error al descargar el reporte:", error)
                      alert("Hubo un error al descargar el reporte.")
                    } finally {
                      setIsDownloading(false)
                    }
                  }}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                  disabled={isDownloading}
                >
                  {isDownloading ? "Descargando..." : "Descargar Excel"}
                </Button>
              </CardContent>
            </Card>
          )}
          {selected === "delinquent_portfolio" && (
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Reporte de Cartera en Mora</CardTitle>
                <CardDescription>Descarga el Excel con las cuotas en mora.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1">
                    <label htmlFor="start-date" className="text-sm font-medium">Fecha de Inicio</label>
                    <input
                      type="date"
                      id="start-date"
                      value={startDate || ""}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="flex flex-col space-y-1">
                    <label htmlFor="end-date" className="text-sm font-medium">Fecha de Fin</label>
                    <input
                      type="date"
                      id="end-date"
                      value={endDate || ""}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
                <Button
                  onClick={getCurrentMonthDates}
                  variant="outline"
                  className="w-full"
                >
                  Mes Actual
                </Button>
                <Button
                  onClick={async () => {
                    setIsDownloading(true)
                    try {
                      const params = new URLSearchParams()
                      if (startDate) params.append("startDate", startDate)
                      if (endDate) params.append("endDate", endDate)
                      const response = await fetch(`/api/reports/delinquent/excel?${params.toString()}`)
                      if (!response.ok) {
                        throw new Error("Error al descargar el reporte")
                      }
                      const blob = await response.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `Cooperativ-Cartera_Mora_${new Date().toISOString().slice(0, 10)}.xlsx`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      window.URL.revokeObjectURL(url)
                    } catch (error) {
                      console.error("Error al descargar el reporte:", error)
                      alert("Hubo un error al descargar el reporte.")
                    } finally {
                      setIsDownloading(false)
                    }
                  }}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                  disabled={!startDate || !endDate || isDownloading}
                >
                  {isDownloading ? "Descargando..." : "Descargar Excel"}
                </Button>
              </CardContent>
            </Card>
          )}
      </div>
      </div>
    </div>
  )
}
