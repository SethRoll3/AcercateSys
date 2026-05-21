'use client'

import { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  FileText, TrendingUp, DollarSign, Users, ShoppingBag,
  CheckCircle2, AlertTriangle, XCircle, Shield, ShieldAlert, ShieldOff, BarChart3
} from "lucide-react"

export default function BetterwareReportesPage() {
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const inFlightRef = useRef(false)

  const loadData = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const [solRes, clientRes] = await Promise.all([
        fetch('/api/betterware'),
        fetch('/api/betterware/clientes'),
      ])
      if (solRes.ok) {
        const data = await solRes.json()
        setSolicitudes(data || [])
      }
      if (clientRes.ok) {
        const data = await clientRes.json()
        setClientes(data || [])
      }
    } catch (e) {
      console.error('[bw-reportes] error:', e)
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (isLoading) return <LoadingSpinner />

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  // Stats
  const totalSolicitudes = solicitudes.length
  const totalClientes = clientes.length
  const aprobadas = solicitudes.filter(s => s.status === 'aprobado')
  const pendientes = solicitudes.filter(s => s.status === 'pendiente')
  const rechazadas = solicitudes.filter(s => s.status === 'rechazado')
  const habilitados = solicitudes.filter(s => s.estado_asociado === 'habilitado')
  const detenidos = solicitudes.filter(s => s.estado_asociado === 'despacho_detenido')
  const bloqueados = solicitudes.filter(s => s.estado_asociado === 'bloqueado')
  const totalSolicitado = solicitudes.reduce((s, sol) => s + Number(sol.monto_solicitado || 0), 0)
  const totalAutorizado = aprobadas.reduce((s, sol) => s + Number(sol.monto_autorizado || 0), 0)
  const expedientesCompletos = solicitudes.filter(s => s.expediente_completo).length
  const tasaAprobacion = totalSolicitudes > 0 ? ((aprobadas.length / totalSolicitudes) * 100).toFixed(1) : '0'

  // Recent solicitudes
  const recentSolicitudes = solicitudes.slice(0, 10)

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-primary" />
          Reportes Betterware
        </h2>
        <p className="text-muted-foreground text-sm">
          Resumen y estadísticas del módulo Betterware
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card className="border-border/50 bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Solicitudes</CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-foreground">{totalSolicitudes}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-cyan-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-cyan-500">{totalClientes}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Tasa Aprobación</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-emerald-500">{tasaAprobacion}%</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-amber-500/10 to-amber-500/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Expedientes Completos</CardTitle>
            <FileText className="h-4 w-4 text-amber-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-amber-500">{expedientesCompletos} / {totalSolicitudes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Montos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monto Total Solicitado</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">{formatCurrency(totalSolicitado)}</div>
            <div className="text-xs text-muted-foreground mt-1">De {totalSolicitudes} solicitudes</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monto Total Autorizado</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-emerald-500">{formatCurrency(totalAutorizado)}</div>
            <div className="text-xs text-muted-foreground mt-1">De {aprobadas.length} solicitudes aprobadas</div>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Solicitud status */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Estado de Solicitudes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm">Aprobadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-emerald-500">{aprobadas.length}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalSolicitudes ? (aprobadas.length / totalSolicitudes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Pendientes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-amber-500">{pendientes.length}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${totalSolicitudes ? (pendientes.length / totalSolicitudes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-500" />
                  <span className="text-sm">Rechazadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-rose-500">{rechazadas.length}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${totalSolicitudes ? (rechazadas.length / totalSolicitudes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado del asociado */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Estado de Asociados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm">Habilitados</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-emerald-500">{habilitados.length}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalSolicitudes ? (habilitados.length / totalSolicitudes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Despacho Detenido</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-amber-500">{detenidos.length}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${totalSolicitudes ? (detenidos.length / totalSolicitudes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldOff className="h-4 w-4 text-rose-500" />
                  <span className="text-sm">Bloqueados</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-rose-500">{bloqueados.length}</span>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${totalSolicitudes ? (bloqueados.length / totalSolicitudes) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Solicitudes Recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">N° Solicitud</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Monto Solicitado</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Monto Autorizado</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Estado</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Asociado</th>
                </tr>
              </thead>
              <tbody>
                {recentSolicitudes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay solicitudes registradas
                    </td>
                  </tr>
                ) : (
                  recentSolicitudes.map(sol => (
                    <tr key={sol.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-foreground">{sol.numero_solicitud}</td>
                      <td className="py-3 px-4 text-foreground">
                        {sol.cliente ? `${sol.cliente.nombres} ${sol.cliente.apellidos}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-foreground">{formatCurrency(Number(sol.monto_solicitado || 0))}</td>
                      <td className="py-3 px-4 text-foreground">{formatCurrency(Number(sol.monto_autorizado || 0))}</td>
                      <td className="py-3 px-4">
                        <Badge variant={sol.status === 'aprobado' ? 'default' : sol.status === 'rechazado' ? 'destructive' : 'secondary'}
                          className={sol.status === 'aprobado' ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : sol.status === 'rechazado' ? 'bg-rose-500/20 text-rose-500 border-rose-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'}
                        >
                          {sol.status === 'aprobado' ? 'Aprobada' : sol.status === 'rechazado' ? 'Rechazada' : 'Pendiente'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary"
                          className={sol.estado_asociado === 'habilitado' ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : sol.estado_asociado === 'bloqueado' ? 'bg-rose-500/20 text-rose-500 border-rose-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'}
                        >
                          {sol.estado_asociado === 'habilitado' ? 'Habilitado' : sol.estado_asociado === 'bloqueado' ? 'Bloqueado' : 'Detenido'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
