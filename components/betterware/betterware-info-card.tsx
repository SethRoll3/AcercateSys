'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShoppingBag, User, MapPin, Phone, CreditCard, FileCheck, AlertTriangle } from "lucide-react"

interface Props {
  solicitud: any
  docsCompleteness: { total_required: number; uploaded: number; complete: boolean; missing: string[] }
}

export function BetterwareInfoCard({ solicitud, docsCompleteness }: Props) {
  const cliente = solicitud?.cliente
  const formatCurrency = (n: number) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n)

  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    pendiente: { variant: "outline", label: "Pendiente" },
    aprobado: { variant: "default", label: "Aprobado" },
    rechazado: { variant: "destructive", label: "Rechazado" },
  }
  const estadoConfig: Record<string, { className: string; label: string }> = {
    habilitado: { className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", label: "Habilitado" },
    despacho_detenido: { className: "bg-amber-500/15 text-amber-500 border-amber-500/30", label: "Despacho Detenido" },
    bloqueado: { className: "bg-rose-500/15 text-rose-500 border-rose-500/30", label: "Bloqueado" },
  }

  const sc = statusConfig[solicitud.status] || { variant: "outline", label: solicitud.status }
  const ec = estadoConfig[solicitud.estado_asociado] || { className: "", label: solicitud.estado_asociado }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Solicitud {solicitud.numero_solicitud}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={sc.variant}>{sc.label}</Badge>
            <Badge variant="outline" className={ec.className}>{ec.label}</Badge>
            {docsCompleteness.complete ? (
              <Badge variant="secondary" className="gap-1"><FileCheck className="h-3 w-3" />Expediente Completo</Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/30">
                <AlertTriangle className="h-3 w-3" />Docs {docsCompleteness.uploaded}/{docsCompleteness.total_required}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cliente info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><User className="h-3.5 w-3.5" />Datos del Cliente</h4>
            <div className="text-sm space-y-1">
              <p className="font-medium text-foreground">{cliente?.nombres} {cliente?.apellidos}</p>
              <p className="text-muted-foreground">DPI: {cliente?.dpi}</p>
              {cliente?.nit && <p className="text-muted-foreground">NIT: {cliente.nit}</p>}
              {cliente?.fecha_nacimiento && <p className="text-muted-foreground">Nacimiento: {cliente.fecha_nacimiento}</p>}
              {cliente?.email && <p className="text-muted-foreground">Email: {cliente.email}</p>}
            </div>
          </div>
          {/* Contact info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Phone className="h-3.5 w-3.5" />Contacto</h4>
            <div className="text-sm space-y-1">
              {cliente?.telefono && <p className="text-muted-foreground">Tel: {cliente.telefono}</p>}
              {cliente?.direccion && <p className="text-muted-foreground flex items-start gap-1"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />{cliente.direccion}</p>}
              {cliente?.gerente_zona && <p className="text-muted-foreground">Gerente Zona: {cliente.gerente_zona}</p>}
              {solicitud.id_referencia && <p className="text-muted-foreground">Ref: {solicitud.id_referencia}</p>}
            </div>
          </div>
          {/* Financial info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Datos Financieros</h4>
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Monto Solicitado</span><span className="font-medium text-foreground">{formatCurrency(solicitud.monto_solicitado)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Monto Autorizado</span><span className="font-medium text-foreground">{formatCurrency(solicitud.monto_autorizado)}</span></div>
              {solicitud.score_credito && <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="font-medium text-foreground">{solicitud.score_credito}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha Solicitud</span><span className="font-medium text-foreground">{solicitud.fecha_solicitud}</span></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
