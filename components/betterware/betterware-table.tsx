"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, FileCheck, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"

interface BetterwareSolicitud {
  id: string
  numero_solicitud: string
  cliente?: {
    id: string
    dpi: string
    nombres: string
    apellidos: string
    telefono?: string
    gerente_zona?: string
  }
  monto_solicitado: number
  monto_autorizado: number
  score_credito?: number
  status: string
  estado_asociado: string
  fecha_solicitud: string
  documentos_count: number
  expediente_completo: boolean
}

interface BetterwareTableProps {
  solicitudes: BetterwareSolicitud[]
  userRole: string
}

export function BetterwareTable({ solicitudes, userRole }: BetterwareTableProps) {
  const router = useRouter()

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      pendiente: { variant: "outline", label: "Pendiente" },
      aprobado: { variant: "default", label: "Aprobado" },
      rechazado: { variant: "destructive", label: "Rechazado" },
    }
    const c = config[status] || { variant: "outline", label: status }
    return <Badge variant={c.variant}>{c.label}</Badge>
  }

  const getEstadoBadge = (estado: string) => {
    const config: Record<string, { className: string; label: string }> = {
      habilitado: { className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", label: "Habilitado" },
      despacho_detenido: { className: "bg-amber-500/15 text-amber-500 border-amber-500/30", label: "Despacho Detenido" },
      bloqueado: { className: "bg-rose-500/15 text-rose-500 border-rose-500/30", label: "Bloqueado" },
    }
    const c = config[estado] || { className: "", label: estado }
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-muted-foreground">N° Solicitud</TableHead>
            <TableHead className="text-muted-foreground">Cliente</TableHead>
            <TableHead className="text-muted-foreground">DPI</TableHead>
            <TableHead className="text-muted-foreground">Monto Solicitado</TableHead>
            <TableHead className="text-muted-foreground">Monto Autorizado</TableHead>
            <TableHead className="text-muted-foreground">Score</TableHead>
            <TableHead className="text-muted-foreground">Expediente</TableHead>
            <TableHead className="text-muted-foreground">Estado Solicitud</TableHead>
            <TableHead className="text-muted-foreground">Estado Asociado</TableHead>
            <TableHead className="text-muted-foreground">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {solicitudes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                No hay solicitudes Betterware registradas
              </TableCell>
            </TableRow>
          ) : (
            solicitudes.map((sol) => (
              <TableRow key={sol.id} className="border-border/50">
                <TableCell className="font-medium text-foreground">{sol.numero_solicitud}</TableCell>
                <TableCell className="text-foreground">
                  {sol.cliente ? `${sol.cliente.nombres} ${sol.cliente.apellidos}` : 'N/A'}
                </TableCell>
                <TableCell className="text-foreground text-sm">
                  {sol.cliente?.dpi || 'N/A'}
                </TableCell>
                <TableCell className="text-foreground">{formatCurrency(sol.monto_solicitado)}</TableCell>
                <TableCell className="text-foreground">{formatCurrency(sol.monto_autorizado)}</TableCell>
                <TableCell className="text-foreground">{sol.score_credito ?? '—'}</TableCell>
                <TableCell>
                  {sol.expediente_completo ? (
                    <Badge variant="secondary" className="gap-1">
                      <FileCheck className="h-3 w-3" />
                      Completo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/30">
                      <AlertTriangle className="h-3 w-3" />
                      {sol.documentos_count}/4
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{getStatusBadge(sol.status)}</TableCell>
                <TableCell>{getEstadoBadge(sol.estado_asociado)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/dashboard/betterware/${sol.id}`)}
                    className="gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
