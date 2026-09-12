"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { LoadingSpinner } from "@/components/loading-spinner"
import { formatYMDGT } from "@/lib/utils"

interface BitacoraEntry {
  id: string
  fechaAtraso: string
  diasAtraso: number
  capitalPendiente: number
  interesPerdido: number
  moraAcumulada: number
  notas: string | null
  createdAt: string
  schedule: {
    paymentNumber: number
    dueDate: string
  } | null
}

interface BitacoraSummary {
  totalRegistros: number
  maxDiasAtraso: number
  totalInteresPerdido: number
  totalMora: number
}

interface BitacoraTabProps {
  loanId: string
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(val)

export function BitacoraTab({ loanId }: BitacoraTabProps) {
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>([])
  const [summary, setSummary] = useState<BitacoraSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBitacora = async () => {
      try {
        const res = await fetch(`/api/loans/${loanId}/bitacora`, {
          credentials: "include",
        })
        if (!res.ok) {
          if (res.status === 404) {
            setBitacora([])
            setSummary(null)
            return
          }
          throw new Error("Error al cargar bitácora")
        }
        const data = await res.json()
        setBitacora(data.bitacora || [])
        setSummary(data.summary || null)
      } catch {
        setError("No se pudo cargar la bitácora de atrasos")
      } finally {
        setIsLoading(false)
      }
    }
    fetchBitacora()
  }, [loanId])

  if (isLoading) return <LoadingSpinner />
  if (error) return <p className="text-sm text-muted-foreground">{error}</p>

  return (
    <div className="space-y-4">
      {summary && summary.totalRegistros > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Total registros</p>
            <p className="text-lg font-bold">{summary.totalRegistros}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Máx. días atraso</p>
            <p className="text-lg font-bold text-red-600">{summary.maxDiasAtraso}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Interés perdido</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(summary.totalInteresPerdido)}</p>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Mora acumulada</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(summary.totalMora)}</p>
          </div>
        </div>
      )}

      {bitacora.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No hay registros de atrasos para este préstamo.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Fecha Atraso</th>
                <th className="pb-2 font-medium">Cuota</th>
                <th className="pb-2 font-medium">Días</th>
                <th className="pb-2 font-medium text-right">Capital Pendiente</th>
                <th className="pb-2 font-medium text-right">Interés Perdido</th>
                <th className="pb-2 font-medium text-right">Mora</th>
                <th className="pb-2 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {bitacora.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="py-2">{formatYMDGT(entry.fechaAtraso)}</td>
                  <td className="py-2">
                    {entry.schedule ? `#${entry.schedule.paymentNumber}` : "—"}
                  </td>
                  <td className="py-2">
                    <Badge variant={entry.diasAtraso > 30 ? "destructive" : "secondary"}>
                      {entry.diasAtraso} días
                    </Badge>
                  </td>
                  <td className="py-2 text-right">{formatCurrency(entry.capitalPendiente)}</td>
                  <td className="py-2 text-right text-orange-600">{formatCurrency(entry.interesPerdido)}</td>
                  <td className="py-2 text-right text-red-600">{formatCurrency(entry.moraAcumulada)}</td>
                  <td className="py-2 text-muted-foreground max-w-[200px] truncate">{entry.notas || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
