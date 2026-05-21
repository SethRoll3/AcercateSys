'use client'

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { BetterwareTable } from "@/components/betterware/betterware-table"
import { CreateBetterwareDialog } from "@/components/betterware/create-betterware-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ShoppingBag, FileText, CheckCircle2, AlertTriangle, XCircle,
  Users, Shield, ShieldOff, ShieldAlert, Loader2
} from "lucide-react"

// ── Cache utilities (same pattern as dashboard) ──────────────
const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER
const readCache = (key: string) => {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj.ts !== 'number') return null
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null
    return obj.data ?? null
  } catch { }
  return null
}
const writeCache = (key: string, data: any) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch { }
}
const K = {
  user: 'bw:user',
  userData: 'bw:userData',
  solicitudes: 'bw:solicitudes',
  clientes: 'bw:clientes',
}

export default function BetterwarePage() {
  const [isLoading, setIsLoading] = useState(true)
  const [userData, setUserData] = useState<any>(null)
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [estadoFilter, setEstadoFilter] = useState<string>('all')

  const inFlightRef = useRef(false)
  const abortControllersRef = useRef<AbortController[]>([])

  const fetchWithTimeout = async (input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) => {
    const { timeoutMs = 12000, ...rest } = init
    const controller = new AbortController()
    abortControllersRef.current.push(controller)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(input, { ...rest, signal: controller.signal })
      return res
    } finally {
      clearTimeout(timeout)
      abortControllersRef.current = abortControllersRef.current.filter(c => c !== controller)
    }
  }

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const getUserWithRetry = async () => {
    try {
      const udc = readCache(K.userData)
      if (udc && udc.id) return udc
    } catch { }
    const supabase = createClient()
    for (const ms of [200, 400, 800]) {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user) return data.user
      } catch { }
      await delay(ms)
    }
    return null
  }

  const loadData = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    try {
      const supabase = createClient()
      const u = await getUserWithRetry()
      if (!u) {
        window.location.href = '/auth/login'
        return
      }

      // Get user data
      let currentUserData = readCache(K.userData)
      if (!currentUserData || !currentUserData.id) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', u.id)
          .maybeSingle()
        if (profile) {
          currentUserData = profile
          writeCache(K.userData, profile)
        }
      }
      setUserData(currentUserData)

      // Load solicitudes and clientes in parallel
      const [solRes, clientRes] = await Promise.all([
        fetchWithTimeout('/api/betterware', { timeoutMs: 12000 }),
        fetchWithTimeout('/api/betterware/clientes', { timeoutMs: 12000 }),
      ])

      if (solRes.ok) {
        const data = await solRes.json()
        setSolicitudes(data || [])
        writeCache(K.solicitudes, data || [])
      }

      if (clientRes.ok) {
        const data = await clientRes.json()
        setClientes(data || [])
        writeCache(K.clientes, data || [])
      }
    } catch (e) {
      console.error('[betterware] loadData error:', e)
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [])

  const refreshAfterCreation = useCallback(async () => {
    await delay(1000)
    try {
      const [solRes, clientRes] = await Promise.all([
        fetchWithTimeout('/api/betterware', { timeoutMs: 12000 }),
        fetchWithTimeout('/api/betterware/clientes', { timeoutMs: 12000 }),
      ])
      if (solRes.ok) {
        const data = await solRes.json()
        setSolicitudes(data || [])
        writeCache(K.solicitudes, data || [])
      }
      if (clientRes.ok) {
        const data = await clientRes.json()
        setClientes(data || [])
        writeCache(K.clientes, data || [])
      }
    } catch { }
  }, [])

  useEffect(() => {
    // Load from cache first
    try {
      const udc = readCache(K.userData)
      const sc = readCache(K.solicitudes)
      const cc = readCache(K.clientes)
      if (udc) setUserData(udc)
      if (Array.isArray(sc)) setSolicitudes(sc)
      if (Array.isArray(cc)) setClientes(cc)
      if (udc) setIsLoading(false)
    } catch { }
    loadData()
    return () => {
      const arr = abortControllersRef.current.splice(0)
      for (const c of arr) {
        try { if (!c.signal?.aborted) c.abort('cleanup') } catch { }
      }
      inFlightRef.current = false
    }
  }, [loadData])

  // Revalidate on focus/visibility
  useEffect(() => {
    const onFocus = () => { loadData().catch(() => { }) }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadData().catch(() => { })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadData])

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">No se pudieron cargar tus datos. Intenta nuevamente.</p>
          <Button variant="outline" onClick={() => {
            inFlightRef.current = false
            window.location.reload()
          }}>Reintentar</Button>
        </div>
      </div>
    )
  }

  // ── Stats ──────────────────────────────────────────────────
  const totalSolicitudes = solicitudes.length
  const aprobadas = solicitudes.filter(s => s.status === 'aprobado').length
  const pendientes = solicitudes.filter(s => s.status === 'pendiente').length
  const rechazadas = solicitudes.filter(s => s.status === 'rechazado').length
  const habilitados = solicitudes.filter(s => s.estado_asociado === 'habilitado').length
  const detenidos = solicitudes.filter(s => s.estado_asociado === 'despacho_detenido').length
  const bloqueados = solicitudes.filter(s => s.estado_asociado === 'bloqueado').length
  const totalMontoSolicitado = solicitudes.reduce((s, sol) => s + Number(sol.monto_solicitado || 0), 0)
  const totalMontoAutorizado = solicitudes.filter(s => s.status === 'aprobado').reduce((s, sol) => s + Number(sol.monto_autorizado || 0), 0)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  // Filter solicitudes
  const filteredSolicitudes = solicitudes.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (estadoFilter !== 'all' && s.estado_asociado !== estadoFilter) return false
    return true
  })

  const canManage = ['admin', 'asesor', 'betterware_supervisor'].includes(userData.role)

  return (
    <>
      {/* HEADER */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
            <ShoppingBag className="h-7 w-7 text-primary" />
            Betterware
          </h2>
          <p className="text-muted-foreground text-sm">
            Administración de solicitudes de crédito Betterware
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManage && (
            <CreateBetterwareDialog
              clientes={clientes}
              onCreated={refreshAfterCreation}
              onClientCreated={refreshAfterCreation}
            />
          )}
        </div>
      </div>

      {/* STATS CARDS - ROW 1: Montos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <Card className="border-border/50 bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Solicitudes</CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-foreground">{totalSolicitudes}</div>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(totalMontoSolicitado)} solicitado</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Aprobadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-emerald-500">{aprobadas}</div>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(totalMontoAutorizado)} autorizado</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-amber-500/10 to-amber-500/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Pendientes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-amber-500">{pendientes}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-rose-500/10 to-rose-500/5 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Rechazadas</CardTitle>
            <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-2xl font-bold text-rose-500">{rechazadas}</div>
          </CardContent>
        </Card>
      </div>

      {/* STATS CARDS - ROW 2: Estados del asociado */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Habilitados</CardTitle>
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold text-emerald-500">{habilitados}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Despacho Detenido</CardTitle>
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold text-amber-500">{detenidos}</div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Bloqueados</CardTitle>
            <ShieldOff className="h-3.5 w-3.5 text-rose-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold text-rose-500">{bloqueados}</div>
          </CardContent>
        </Card>
      </div>

      {/* FILTERS + TABLE */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Filtrar por:</span>
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'Todos' },
              { value: 'pendiente', label: 'Pendientes' },
              { value: 'aprobado', label: 'Aprobadas' },
              { value: 'rechazado', label: 'Rechazadas' },
            ].map(f => (
              <Button
                key={f.value}
                variant={statusFilter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
                className={statusFilter !== f.value ? "bg-transparent" : ""}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <span className="text-muted-foreground">|</span>
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'Todos Estados' },
              { value: 'habilitado', label: 'Habilitados' },
              { value: 'despacho_detenido', label: 'Detenidos' },
              { value: 'bloqueado', label: 'Bloqueados' },
            ].map(f => (
              <Button
                key={f.value}
                variant={estadoFilter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setEstadoFilter(f.value)}
                className={estadoFilter !== f.value ? "bg-transparent" : ""}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Mostrando {filteredSolicitudes.length} de {totalSolicitudes} solicitudes
        </div>

        <BetterwareTable
          solicitudes={filteredSolicitudes}
          userRole={userData.role}
        />
      </div>
    </>
  )
}
