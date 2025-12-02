'use client'

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { StatsCard } from "@/components/stats-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner";
import { LoansTable } from "@/components/loans-table"
import { GroupLoansTable } from "@/components/group-loans-table"
import { CreateLoanDialog } from "@/components/create-loan-dialog"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, TrendingUp, FileText, Download, Calculator } from "lucide-react"
import { LoanCalculatorModal } from "@/components/loan-calculator-modal"
const QuetzalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <text x="12" y="16" textAnchor="middle" fontSize="16" fill="currentColor" fontWeight="bold">Q</text>
  </svg>
)
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER
const readCache = (key: string) => {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj.ts !== 'number') return null
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null
    return obj.data ?? null
  } catch {}
  return null
}
const writeCache = (key: string, data: any) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}
const K = {
  user: 'dashboard:user',
  userData: 'dashboard:userData',
  loans: 'dashboard:loans',
  clients: 'dashboard:clients',
  groupLoans: 'dashboard:groupLoans',
  loanGroupMap: 'dashboard:loanGroupMap',
  activeLoanDetails: 'dashboard:activeLoanDetails',
  selectedLoanId: 'dashboard:selectedLoanId',
  paymentsAgg: 'dashboard:paymentsAgg',
  advisorSelectedView: 'dashboard:advisorSelectedView',
  advisorLoansViewPrefix: 'dashboard:advisorLoansView:',
  advisors: 'dashboard:advisors'
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null)
  const [userData, setUserData] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [groupLoans, setGroupLoans] = useState<any[]>([])
  const [loanGroupMap, setLoanGroupMap] = useState<Record<string, { groupName: string }>>({})
  const [userDataError, setUserDataError] = useState<string | null>(null)
  const [loansError, setLoansError] = useState<string | null>(null)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [activeLoanDetails, setActiveLoanDetails] = useState<Record<string, any>>({})
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)
  const [advisorFilter, setAdvisorFilter] = useState<'all'|'aldia'|'mora'>('all')
  const [paymentsAgg, setPaymentsAgg] = useState<Record<string, number>>({})
  const [paymentsConfirmedCounts, setPaymentsConfirmedCounts] = useState<Record<string, number>>({})
  const [advisorSelectedView, setAdvisorSelectedView] = useState<'all'|'active'|'aldia'|'mora'|'pending'|'paid'|'asesores_stats'|null>(null)
  const [groupsTabVisited, setGroupsTabVisited] = useState(false)
  const [advisors, setAdvisors] = useState<any[]>([])
  const [advisorClientsView, setAdvisorClientsView] = useState<{ id: string, name: string, email: string } | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)

  const fetchLoans = useCallback(async () => {
    try {
      const response = await fetch('/api/loans');
      if (!response.ok) {
        throw new Error('Failed to fetch loans');
      }
      const loansData = await response.json();
      setLoans(loansData || []);
      writeCache(K.loans, loansData || [])
    } catch (error) {
      console.error("Failed to fetch loans:", error);
      setLoans([]);
    }
  }, []);

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
      const uc = readCache(K.user)
      if (uc && uc.id) return uc
      const udc = readCache(K.userData)
      if (udc && udc.id) return { id: udc.id, email: udc.email }
    } catch {}
    const supabase = createClient()
    for (const ms of [200, 400, 800]) {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user) return data.user
      } catch {}
      await delay(ms)
    }
    return null
  }

  useEffect(() => {
    try {
      const uc = readCache(K.user)
      const udc = readCache(K.userData)
      const lc = readCache(K.loans)
      const cc = readCache(K.clients)
      const gc = readCache(K.groupLoans)
      const lgm = readCache(K.loanGroupMap)
      const pa = readCache(K.paymentsAgg)
      const ad = readCache(K.activeLoanDetails)
      const sid = readCache(K.selectedLoanId)
      const asv = readCache(K.advisorSelectedView)
      if (uc) setUser(uc)
      if (udc) setUserData(udc)
      if (Array.isArray(lc)) setLoans(lc)
      if (Array.isArray(cc)) setClients(cc)
      if (Array.isArray(gc)) setGroupLoans(gc)
      if (lgm && typeof lgm === 'object') setLoanGroupMap(lgm)
      if (ad && typeof ad === 'object') setActiveLoanDetails(ad)
      if (typeof sid === 'string') setSelectedLoanId(sid)
      if (pa && typeof pa === 'object') setPaymentsAgg(pa)
      if (typeof asv === 'string') setAdvisorSelectedView(asv as any)
      if (udc) setIsLoading(false)
    } catch {}
    if (inFlightRef.current) return
    inFlightRef.current = true
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const user = await getUserWithRetry()
        setUser(user);
        if (user) writeCache(K.user, user)

        // 1. Garantizar que tenemos userData (perfil) para saber el rol
        let currentUserData = readCache(K.userData)
        if (!currentUserData || !currentUserData.id) {
          if (user) {
            const { data: profile } = await supabase
              .from('users')
              .select('*')
              .eq('auth_id', user.id)
              .maybeSingle()
            if (profile) {
              currentUserData = profile
              setUserData(profile)
              writeCache(K.userData, profile)
              setUserDataError(null)
            }
          }
        } else {
          setUserData(currentUserData)
          setUserDataError(null)
        }

        if (!currentUserData && !user) {
          window.location.href = '/auth/login'
          return
        }

        const role = currentUserData?.role

        // 2. Carga condicional de recursos basada en caché y rol
        const promises: Promise<any>[] = []
        const keys: string[] = []

        // Loans
        if (!readCache(K.loans)) {
          promises.push(fetchWithTimeout('/api/loans', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
          keys.push('loans')
        } else {
          setLoans(readCache(K.loans))
        }

        // Clients
        if (!readCache(K.clients)) {
          promises.push(fetchWithTimeout('/api/clients', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
          keys.push('clients')
        } else {
          setClients(readCache(K.clients))
        }

        // Group Loans
        if (!readCache(K.groupLoans)) {
          promises.push(fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
          keys.push('groupLoans')
        } else {
          const gl = readCache(K.groupLoans)
          setGroupLoans(gl)
          // Reconstruir mapa si existe en cache
          const map = readCache(K.loanGroupMap)
          if (map) setLoanGroupMap(map)
          else {
             // Si falta el mapa pero tenemos grupos, reconstruirlo
             const newMap: Record<string, { groupName: string }> = {};
             for (const g of gl || []) {
               const name = g.group?.nombre || 'Grupo';
               for (const item of g.loans || []) {
                 if (item.loan_id) newMap[item.loan_id] = { groupName: name };
               }
             }
             setLoanGroupMap(newMap)
             writeCache(K.loanGroupMap, newMap)
          }
        }

        // Payments
        if (!readCache(K.paymentsAgg)) {
           promises.push(fetchWithTimeout('/api/payments', { timeoutMs: 12000, cache: 'no-store' as any }).then(r => r.ok ? r.json() : null))
           keys.push('payments')
        } else {
           setPaymentsAgg(readCache(K.paymentsAgg))
        }

        // Advisors (Solo admin/asesor)
        if (['admin', 'asesor'].includes(role)) {
          if (!readCache(K.advisors)) {
            promises.push(fetchWithTimeout('/api/advisors', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
            keys.push('advisors')
          } else {
            setAdvisors(readCache(K.advisors))
          }
        }

        // Ejecutar llamadas faltantes
        if (promises.length > 0) {
          const results = await Promise.all(promises)
          
          results.forEach((data, index) => {
            const key = keys[index]
            
            if (key === 'loans') {
              if (data) {
                setLoans(data)
                writeCache(K.loans, data)
                setLoansError(null)
              } else {
                setLoansError('No se pudieron cargar los préstamos')
              }
            }
            
            if (key === 'clients') {
              if (data) {
                setClients(data)
                writeCache(K.clients, data)
              }
            }

            if (key === 'groupLoans') {
              if (data) {
                setGroupLoans(data)
                writeCache(K.groupLoans, data)
                const map: Record<string, { groupName: string }> = {};
                for (const g of data) {
                  const name = g.group?.nombre || 'Grupo';
                  for (const item of g.loans || []) {
                    if (item.loan_id) map[item.loan_id] = { groupName: name };
                  }
                }
                setLoanGroupMap(map)
                writeCache(K.loanGroupMap, map)
                setGroupsError(null)
              } else {
                setGroupsError('No se pudieron cargar los préstamos por grupo')
              }
            }

            if (key === 'payments') {
               if (data) {
                  const agg: Record<string, number> = {};
                  const confirmedByLoan: Record<string, Set<string>> = {}
                  for (const p of data) {
                    const status = String(p.confirmationStatus || p.confirmation_status || '').toLowerCase()
                    if (status !== 'confirmado' && status !== 'aprobado') continue
                    const k = String(p.loanId || p.loan_id)
                    const amt = Number(p.amount || 0)
                    if (!k) continue
                    agg[k] = (agg[k] || 0) + amt
                    const sid = String(p.scheduleId || p.schedule_id || '')
                    if (sid) (confirmedByLoan[k] ||= new Set()).add(sid)
                  }
                  setPaymentsAgg(agg)
                  writeCache(K.paymentsAgg, agg)
                  const counts: Record<string, number> = {}
                  for (const [k, set] of Object.entries(confirmedByLoan)) counts[k] = set.size
                  setPaymentsConfirmedCounts(counts)
               }
            }

            if (key === 'advisors') {
               if (data) {
                 setAdvisors(data)
                 writeCache(K.advisors, data)
               }
            }
          })
        }

      } catch (e) {
        console.error("Dashboard load error:", e)
      } finally {
        setIsLoading(false);
        inFlightRef.current = false
      }
    }
    fetchData();
    return () => {
      const arr = abortControllersRef.current.splice(0)
      for (const c of arr) {
        try { if (!c.signal?.aborted) c.abort('cleanup') } catch {}
      }
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (userData?.role === 'cliente' && loans.length > 0) {
      const activeLoans = (loans || []).filter((l: any) => l.status === 'active');
      if (activeLoans.length > 0) {
        if (selectedLoanId && !activeLoans.some(l => l.id === selectedLoanId)) {
          const newSelected = activeLoans[0]?.id || null
          setSelectedLoanId(newSelected);
          if (newSelected) writeCache(K.selectedLoanId, newSelected)
        }
        // Seleccionar el primer préstamo activo si no hay ninguno seleccionado
        if (!selectedLoanId && activeLoans[0]?.id) {
          setSelectedLoanId(activeLoans[0].id);
        }
        
        const loanToFetch = selectedLoanId ? activeLoans.find(l => l.id === selectedLoanId) : activeLoans[0];

        if (loanToFetch?.id && !activeLoanDetails[loanToFetch.id]) {
          ;(async () => {
            try {
              const res = await fetch(`/api/loans?id=${loanToFetch.id}`, { credentials: 'include' as any })
              if (res.ok) {
                const data = await res.json()
                setActiveLoanDetails(prev => {
                  const next = { ...prev, [loanToFetch.id]: data }
                  writeCache(K.activeLoanDetails, next)
                  return next
                })
              }
            } catch {}
          })()
        }
      } else {
        setSelectedLoanId(null);
      }
    }
  }, [userData?.role, loans, selectedLoanId, activeLoanDetails])

  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (!userData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">No se pudieron cargar tus datos. Intenta nuevamente.</p>
          <Button variant="outline" onClick={() => {
            inFlightRef.current = false
            // Reintentar cargando
            const evt = new Event('retry-load')
            // Simplemente forzar re-montaje
            window.location.reload()
          }}>Reintentar</Button>
        </div>
      </div>
    )
  }

  const transformedClients = clients.map((c: any) => ({
    id: c.id,
    fullName: `${c.first_name} ${c.last_name}`,
  }))

  const displayLoans = (userData.role === 'asesor') ? (
    (loans || []).filter((l: any) => {
      const hasOverdue = Boolean((l as any).hasOverdue)
      if (advisorFilter === 'aldia') return !hasOverdue
      if (advisorFilter === 'mora') return hasOverdue
      return true
    })
  ) : loans;

  const totalLoanAmount = displayLoans.reduce((sum: any, loan: any) => sum + loan.amount, 0)
  const activeLoans = displayLoans.filter((loan: any) => loan.status === "active").length
  const pendingLoans = displayLoans.filter((loan: any) => loan.status === 'pending').length
  const paidLoans = displayLoans.filter((loan: any) => loan.status === 'paid').length
  const totalClients = clients.length

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getProgressColor = (paid: number, total: number) => {
    if (total === 0) return '#e5e7eb';
    const percentage = (paid / total) * 100;
    if (percentage <= 33) return '#ef4444'; // red
    if (percentage <= 66) return '#facc15'; // yellow
    return '#22c55e'; // green
  };

  const advisorSelectedLoans = (() => {
    if (!(userData.role === 'asesor' || userData.role === 'admin')) return displayLoans
    const list = (loans || [])
    if (!advisorSelectedView) return []
    let filtered: any[] = []
    if (advisorSelectedView === 'all') {
      filtered = list
    } else
    if (advisorSelectedView === 'active') {
      filtered = list.filter((l: any) => l.status === 'active')
    } else if (advisorSelectedView === 'pending') {
      filtered = list.filter((l: any) => l.status === 'pending')
    } else if (advisorSelectedView === 'paid') {
      filtered = list.filter((l: any) => l.status === 'paid')
    } else if (advisorSelectedView === 'aldia') {
      filtered = list.filter((l: any) => !(l as any).hasOverdue)
    } else if (advisorSelectedView === 'mora') {
      filtered = list.filter((l: any) => Boolean((l as any).hasOverdue))
    }
    try { writeCache(K.advisorLoansViewPrefix + advisorSelectedView, filtered) } catch {}
    return filtered
  })()

  const scopeLoans = ((userData.role === 'asesor') || (userData.role === 'admin')) ? (advisorSelectedView ? advisorSelectedLoans : (loans || [])) : displayLoans
  const advisorGlobalProgress = ((userData.role === 'asesor') || (userData.role === 'admin')) ? (() => {
    const paid = (scopeLoans || []).reduce((s: number, l: any) => s + Number((l as any).progressPaid || 0), 0)
    const total = (scopeLoans || []).reduce((s: number, l: any) => s + Number((l as any).progressTotal || 0), 0)
    return { paid, total }
  })() : { paid: 0, total: 0 }

  const advisorTotals = ((userData.role === 'asesor') || (userData.role === 'admin')) ? (() => {
    const installments = (l: any) => {
      const months = Number(l?.termMonths || 0)
      const freq = String(l?.paymentFrequency || '')
      return freq === 'quincenal' ? months * 2 : months
    }
    const totalRepayable = (scopeLoans || []).reduce((s: number, l: any) => {
      return s + Number(l?.monthlyPayment || 0) * installments(l)
    }, 0)
    const paidRecovered = (scopeLoans || []).reduce((s: number, l: any) => {
      const k = String(l?.id)
      return s + Number(paymentsAgg[k] || 0)
    }, 0)
    return { totalRepayable, paidRecovered }
  })() : { totalRepayable: 0, paidRecovered: 0 }

  const advisorGroupTotals = ((userData.role === 'asesor') || (userData.role === 'admin')) ? (() => {
    const ids = new Set((scopeLoans || []).map((l: any) => String(l.id)))
    const byId: Record<string, any> = {}
    for (const l of (scopeLoans || [])) byId[String(l.id)] = l
    let totalRepayable = 0
    let paidRecovered = 0
    for (const g of (groupLoans || [])) {
      const groupLoanIds = ((g.loans || []).map((it: any) => String(it.loan_id))).filter((id: string) => ids.has(id))
      if (!groupLoanIds.length) continue
      for (const id of groupLoanIds) {
        const l = byId[id]
        if (!l) continue
        const months = Number(l?.termMonths || 0)
        const freq = String(l?.paymentFrequency || '')
        const installments = freq === 'quincenal' ? months * 2 : months
        totalRepayable += Number(l?.monthlyPayment || 0) * installments
        paidRecovered += Number(paymentsAgg[id] || 0)
      }
    }
    return { totalRepayable, paidRecovered }
  })() : { totalRepayable: 0, paidRecovered: 0 }



  const handleAdvisorCardClick = (view: 'all'|'active'|'aldia'|'mora'|'pending'|'paid'|'asesores_stats') => {
    setAdvisorSelectedView(view)
    writeCache(K.advisorSelectedView, view)
  }

  return (
    <>
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold text-foreground mb-2 truncate">
            {userData.role === "admin" ? "Panel de Administración" : "Mis Préstamos"}
          </h2>
          <p className="text-muted-foreground">
            {userData.role === "admin"
              ? "Resumen general del sistema de préstamos"
              : "Gestiona y revisa tus préstamos activos"}
          </p>
        </div>
        {userData.role === "admin" && (
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" asChild>
              <a href="/api/reports/loans-excel" target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
                Exportar Excel
              </a>
            </Button>
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => setCalcOpen(true)}>
              <Calculator className="h-4 w-4" />
              Calculadora
            </Button>
            <CreateLoanDialog clients={transformedClients} onLoanCreated={fetchLoans} />
          </div>
        )}
        {userData.role === 'asesor' && (
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => setCalcOpen(true)}>
              <Calculator className="h-4 w-4" />
              Calculadora
            </Button>
            <CreateLoanDialog clients={transformedClients} onLoanCreated={fetchLoans} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {userData.role === 'asesor' || userData.role === 'admin' ? (
          <>
            <StatsCard
              title="Todos"
              value={(loans || []).length}
              description="Todos los estados"
              icon={TrendingUp}
              onClick={() => handleAdvisorCardClick('all')}
              className="ring-1 ring-transparent hover:ring-primary/20"
            />
            <StatsCard
              title="Préstamos Activos"
              value={activeLoans}
              description="Préstamos en curso"
              icon={TrendingUp}
              onClick={() => handleAdvisorCardClick('active')}
              className="ring-1 ring-transparent hover:ring-primary/20"
            />
            <StatsCard
              title="Al día"
              value={(loans || []).filter((l: any) => !(l as any).hasOverdue).length}
              description="Sin cuotas vencidas"
              icon={TrendingUp}
              onClick={() => handleAdvisorCardClick('aldia')}
              className="ring-1 ring-transparent hover:ring-primary/20"
            />
            <StatsCard
              title="Con mora"
              value={(loans || []).filter((l: any) => (l as any).hasOverdue).length}
              description="Con cuotas vencidas"
              icon={TrendingUp}
              onClick={() => handleAdvisorCardClick('mora')}
              className="ring-1 ring-transparent hover:ring-primary/20"
            />
            <StatsCard
              title="Pendientes"
              value={pendingLoans}
              description="Aún sin activar"
              icon={TrendingUp}
              onClick={() => handleAdvisorCardClick('pending')}
              className="ring-1 ring-transparent hover:ring-primary/20"
            />
            <StatsCard
              title="Pagados"
              value={paidLoans}
              description="Préstamos finalizados"
              icon={TrendingUp}
              onClick={() => handleAdvisorCardClick('paid')}
              className="ring-1 ring-transparent hover:ring-primary/20"
            />
            {userData.role === 'admin' && (
              <StatsCard
                title="Estadísticas de asesores"
                value={Array.from(new Set((clients || []).map((c: any) => String(c.advisor_id)).filter(Boolean))).length}
                description="Progreso global de cuotas"
                icon={TrendingUp}
                onClick={() => handleAdvisorCardClick('asesores_stats')}
                className="ring-1 ring-transparent hover:ring-primary/20"
              />
            )}
          </>
        ) : (
          <StatsCard
            title="Total en Préstamos"
            value={formatCurrency(totalLoanAmount)}
            description="Monto total prestado"
            icon={QuetzalIcon}
          />
        )}
        {userData.role === 'cliente' && (
          <StatsCard title="Préstamos Activos" value={activeLoans} description="Préstamos en curso" icon={TrendingUp} />
        )}
        
      </div>

      {userData.role === 'asesor' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total en Préstamos (Individuales)</CardTitle>
              <QuetzalIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-2xl font-bold text-foreground">{formatCurrency(advisorTotals.totalRepayable)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total a pagar con intereses y aportes</p>
                </div>
                <div className="w-28 h-28 md:w-32 md:h-32 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" data={[{ name: 'Recuperado', value: Math.min(advisorTotals.paidRecovered, advisorTotals.totalRepayable) }, { name: 'Pendiente', value: Math.max(0, advisorTotals.totalRepayable - advisorTotals.paidRecovered) }]} innerRadius={44} outerRadius={58} paddingAngle={2}>
                        <Cell fill={getProgressColor(advisorTotals.paidRecovered, advisorTotals.totalRepayable)} />
                        <Cell fill="#e5e7eb" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-sm font-semibold">{formatCurrency(advisorTotals.paidRecovered)}</div>
                    <div className="text-[10px] text-muted-foreground">recuperado</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total en Préstamos de Grupo</CardTitle>
              <QuetzalIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-2xl font-bold text-foreground">{formatCurrency(advisorGroupTotals.totalRepayable)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total a pagar con intereses y aportes</p>
                </div>
                <div className="w-28 h-28 md:w-32 md:h-32 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" data={[{ name: 'Recuperado', value: Math.min(advisorGroupTotals.paidRecovered, advisorGroupTotals.totalRepayable) }, { name: 'Pendiente', value: Math.max(0, advisorGroupTotals.totalRepayable - advisorGroupTotals.paidRecovered) }]} innerRadius={44} outerRadius={58} paddingAngle={2}>
                        <Cell fill={getProgressColor(advisorGroupTotals.paidRecovered, advisorGroupTotals.totalRepayable)} />
                        <Cell fill="#e5e7eb" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-sm font-semibold">{formatCurrency(advisorGroupTotals.paidRecovered)}</div>
                    <div className="text-[10px] text-muted-foreground">recuperado</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}



      <div className="mb-6">
        {userData.role === 'cliente' ? (
          <Tabs value={selectedLoanId || ''} onValueChange={(v) => { setSelectedLoanId(v); writeCache(K.selectedLoanId, v) }} className="w-full">
            <TabsList className="flex w-full max-w-full gap-2 overflow-x-auto bg-muted/50 whitespace-nowrap">
              {(loans || []).filter((l: any) => l.status === 'active').map((loan: any) => (
                <TabsTrigger key={loan.id} value={loan.id} className="shrink-0 px-3 text-xs sm:text-sm truncate max-w-[70vw] sm:max-w-none">
                  Préstamo {loan.loanNumber || loan.loan_number}
                </TabsTrigger>
              ))}
            </TabsList>
            {(loans || []).filter((l: any) => l.status === 'active').map((loan: any) => (
              <TabsContent key={loan.id} value={loan.id}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card progreso préstamo */}
                  <div
                    className="rounded-lg border bg-card/50 backdrop-blur-sm p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                    onClick={() => {
                      if (loan?.id) {
                        window.location.href = `/dashboard/loans/${loan.id}`
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-lg font-semibold">Mi Préstamo</div>
                      <div className="text-sm text-muted-foreground">{loan.loanNumber || loan.loan_number || ''}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-40 h-40 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie dataKey="value" data={[{ name: 'Pagadas', value: (activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length }, { name: 'Restantes', value: Math.max(0, (activeLoanDetails[loan.id]?.schedule || []).length - (activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length) }]} innerRadius={50} outerRadius={75} paddingAngle={2}>
                              <Cell fill={getProgressColor((activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length, (activeLoanDetails[loan.id]?.schedule || []).length)} />
                              <Cell fill="#e5e7eb" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="text-2xl font-bold">{(activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length}/{(activeLoanDetails[loan.id]?.schedule || []).length}</div>
                          <div className="text-xs text-muted-foreground">cuotas pagadas</div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-sm text-muted-foreground">Monto</div>
                        <div className="text-xl font-semibold">{formatCurrency(loan.amount || 0)}</div>
                        <div className="text-sm text-muted-foreground">Toque para ver detalle</div>
                      </div>
                    </div>
                  </div>

                  {/* Card registrar pago */}
                  <div
                    className="rounded-lg border bg-card/50 backdrop-blur-sm p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                    onClick={() => {
                      const schedule: any[] = (activeLoanDetails[loan.id]?.schedule || [])
                      const next = schedule.find((s: any) => s.status !== 'paid')
                      if (loan?.id && next?.id) {
                        window.location.href = `/dashboard/loans/${loan.id}/payment?scheduleId=${next.id}`
                      }
                    }}
                  >
                    <div className="text-lg font-semibold mb-2">Registrar Pago</div>
                    <div className="text-sm text-muted-foreground mb-3">Para el préstamo {loan.loanNumber || loan.loan_number || ''}</div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      {(() => {
                        const schedule: any[] = (activeLoanDetails[loan.id]?.schedule || [])
                        const next = schedule.find((s: any) => s.status !== 'paid')
                        const label = next ? `Cuota siguiente a pagar: #${next.payment_number}` : 'No hay cuotas pendientes'
                        return (
                          <div className="flex items-center justify-between">
                            <div className="text-sm">{label}</div>
                            <div className="text-sm text-muted-foreground">Préstamo {loan.loanNumber || loan.loan_number || ''}</div>
                          </div>
                        )
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">Toque para ir a registrar el pago</div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Tabs defaultValue="clients" onValueChange={(v) => { if (v === 'groups') setGroupsTabVisited(true) }} className="w-full">
            <TabsList className="grid w-full max-w-full grid-cols-2 bg-muted/50">
              <TabsTrigger value="clients">Clientes</TabsTrigger>
              <TabsTrigger value="groups">Grupos</TabsTrigger>
            </TabsList>
            <TabsContent value="clients">
              <h3 className="text-xl font-semibold text-foreground mb-4">
                {userData.role === "admin" ? "Todos los Préstamos" : "Mis Préstamos"}
              </h3>
              {(userData.role === 'asesor' || userData.role === 'admin') && !advisorSelectedView && (
                <div className="mb-2 text-sm text-muted-foreground">Seleccione una card superior para ver la tabla de préstamos</div>
              )}
              {loansError && (
                <div className="mb-3 text-sm text-muted-foreground flex items-center gap-2">
                  <span>{loansError}</span>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const res = await fetchWithTimeout('/api/loans', { timeoutMs: 12000 })
                      if (res.ok) {
                        const data = await res.json()
                        setLoans(data || [])
                        setLoansError(null)
                      }
                    } catch {}
                  }}>Reintentar</Button>
              </div>
            )}
              {(userData.role === 'asesor' || userData.role === 'admin') && advisorSelectedView !== 'asesores_stats' && (
                <div className="mb-2 text-sm text-muted-foreground">
                  {(() => {
                    const labelMap: Record<string, string> = { all: 'Todos', active: 'Activos', aldia: 'Al día', mora: 'Con mora', pending: 'Pendientes', paid: 'Pagados', asesores_stats: 'Estadísticas de asesores' }
                    const sel = advisorSelectedView ? labelMap[String(advisorSelectedView)] : ''
                    const label = sel ? ` (${sel})` : ''
                    return `Progreso global${label}: ${advisorGlobalProgress.paid}/${advisorGlobalProgress.total} cuotas`
                  })()}
                </div>
              )}
              {(userData.role === 'asesor' || userData.role === 'admin') ? (
                advisorSelectedView ? (
                  advisorSelectedView === 'asesores_stats' ? (
                    (() => {
                      const clientAdvisor: Record<string, string> = {}
                      for (const c of (clients || [])) { if (c?.id) clientAdvisor[String(c.id)] = String(c.advisor_id || '') }
                      const activeAdvisorLoans = (loans || []).filter((l: any) => l.status === 'active' && clientAdvisor[String(l.clientId)])
                      const paidCount = activeAdvisorLoans.reduce((s: number, l: any) => s + Number((l as any).progressPaid || 0), 0)
                      const totalCount = activeAdvisorLoans.reduce((s: number, l: any) => s + Number((l as any).progressTotal || 0), 0)
                      const data = [
                        { name: 'Pagadas', value: paidCount },
                        { name: 'Restantes', value: Math.max(0, totalCount - paidCount) }
                      ]
                      const installments = (l: any) => {
                        const months = Number(l?.termMonths || 0)
                        const freq = String(l?.paymentFrequency || '')
                        return freq === 'quincenal' ? months * 2 : months
                      }
                      const totalRepayableMoney = activeAdvisorLoans.reduce((s: number, l: any) => s + Number(l?.monthlyPayment || 0) * installments(l), 0)
                      const paidRecoveredMoney = activeAdvisorLoans.reduce((s: number, l: any) => {
                        const k = String(l?.id)
                        return s + Number(paymentsAgg[k] || 0)
                      }, 0)
                      const moneyData = [
                        { name: 'Recuperado', value: Math.min(paidRecoveredMoney, totalRepayableMoney) },
                        { name: 'Pendiente', value: Math.max(0, totalRepayableMoney - paidRecoveredMoney) }
                      ]
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">Progreso global de asesores</CardTitle>
                              <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                                <div>
                                  <div className="text-2xl font-bold text-foreground">{totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0}%</div>
                                  <p className="text-xs text-muted-foreground mt-1">Cuotas pagadas sobre el total</p>
                                </div>
                                <div className="w-32 h-32 sm:w-36 sm:h-36 min-w-[8rem] relative mx-auto md:mx-0">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie dataKey="value" data={data} innerRadius={44} outerRadius={58} paddingAngle={2}>
                                        <Cell fill={getProgressColor(paidCount, totalCount)} />
                                        <Cell fill="#e5e7eb" />
                                      </Pie>
                                    </PieChart>
                                  </ResponsiveContainer>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <div className="text-sm font-semibold">{paidCount}/{totalCount}</div>
                                    <div className="text-[10px] text-muted-foreground">cuotas</div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">Recuperación de dinero de asesores</CardTitle>
                              <QuetzalIcon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                                <div>
                                  <div className="text-2xl font-bold text-foreground">{totalRepayableMoney > 0 ? Math.round((paidRecoveredMoney / totalRepayableMoney) * 100) : 0}%</div>
                                  <p className="text-xs text-muted-foreground mt-1">Dinero recuperado sobre el total</p>
                                  <div className="text-xs text-muted-foreground mt-2">Total: {formatCurrency(totalRepayableMoney)}</div>
                                </div>
                                <div className="w-32 h-32 sm:w-36 sm:h-36 min-w-[8rem] relative mx-auto md:mx-0">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie dataKey="value" data={moneyData} innerRadius={44} outerRadius={58} paddingAngle={2}>
                                        <Cell fill={getProgressColor(paidRecoveredMoney, totalRepayableMoney)} />
                                        <Cell fill="#e5e7eb" />
                                      </Pie>
                                    </PieChart>
                                  </ResponsiveContainer>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <div className="text-sm font-semibold">{formatCurrency(paidRecoveredMoney)}</div>
                                    <div className="text-[10px] text-muted-foreground">recuperado</div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                          <div className="sm:col-span-2">
                            {(() => {
                              const advisorItems = (() => {
                                const byAdvisor: Record<string, { id: string, email: string, name: string, clients: any[] }> = {}
                                for (const a of advisors || []) {
                                  const id = String(a.id)
                                  byAdvisor[id] = { id, email: String(a.email || ''), name: String(a.full_name || ''), clients: [] }
                                }
                                for (const c of (clients || [])) {
                                  const aid = String(c.advisor_id || '')
                                  if (!aid) continue
                                  if (!byAdvisor[aid]) {
                                    byAdvisor[aid] = { id: aid, email: String(c.advisor_email || ''), name: '', clients: [] }
                                  }
                                  byAdvisor[aid].clients.push(c)
                                }
                                return Object.values(byAdvisor).filter(it => (it.clients || []).length > 0)
                              })()
                              if (advisorClientsView) {
                                const target = advisorItems.find(it => it.id === advisorClientsView.id) || { id: advisorClientsView.id, name: advisorClientsView.name, email: advisorClientsView.email, clients: [] }
                                const titleName = advisorClientsView.name || target.name || advisorClientsView.email || 'Asesor'
                                const titleEmail = advisorClientsView.email || target.email || '-'
                                return (
                                  <div className="mt-4 space-y-3">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                      <div>
                                        <div className="text-sm text-muted-foreground">Clientes del asesor</div>
                                        <div className="text-lg font-semibold text-foreground">{titleName} · {titleEmail}</div>
                                      </div>
                                      <Button variant="outline" size="sm" onClick={() => setAdvisorClientsView(null)}>Volver a tabla</Button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {(target.clients || []).map((c: any, i: number) => {
                                        const clientId = String(c.id)
                                        const clientName = `${String(c.first_name || '')} ${String(c.last_name || '')}`.trim() || String(c.email || 'Cliente')
                                        const activeLoans = (loans || []).filter((l: any) => l.status === 'active' && String((l?.client || {}).id) === clientId)
                                        const totalInstallments = activeLoans.reduce((s: number, l: any) => s + Number((l as any).progressTotal || 0), 0)
                                        const confirmedInstallments = activeLoans.reduce((s: number, l: any) => s + Number(paymentsConfirmedCounts[String(l.id)] || 0), 0)
                                        const clientLoans = (loans || []).filter((l: any) => String((l?.client || {}).id) === clientId)
                                        return (
                                          <Card key={i} className="border-border/50 bg-card/50 backdrop-blur-sm">
                                            <CardHeader className="pb-2">
                                              <CardTitle className="text-sm font-medium text-foreground truncate">{clientName}</CardTitle>
                                              <div className="text-xs text-muted-foreground truncate">{String(c.email || '-')}</div>
                                            </CardHeader>
                                            <CardContent>
                                              <div className="flex items-center justify-between gap-2">
                                                <div>
                                                  <div className="text-sm font-semibold text-foreground">{confirmedInstallments}/{totalInstallments}</div>
                                                  <div className="text-[11px] text-muted-foreground">cuotas confirmadas</div>
                                                </div>
                                                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { if (clientId) window.location.href = `/dashboard/clients/${clientId}` }}>Ver detalles cliente</Button>
                                              </div>
                                              <div className="mt-3 space-y-2">
                                                {clientLoans.length === 0 ? (
                                                  <div className="text-xs text-muted-foreground">Sin préstamos</div>
                                                ) : clientLoans.map((l: any, j: number) => {
                                                  const lp = Number(paymentsConfirmedCounts[String(l.id)] || 0)
                                                  const lt = Number((l as any).progressTotal || 0)
                                                  const ln = String((l as any).loanNumber || (l as any).loan_number || l.id)
                                                  const st = String((l as any).status || '')
                                                  const stClass = st === 'active' ? 'bg-emerald-500/20 text-emerald-400' : st === 'pending' ? 'bg-amber-500/20 text-amber-400' : st === 'paid' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
                                                  return (
                                                    <div key={j} className="rounded-md border border-border/50 p-2 text-xs flex items-center justify-between gap-2">
                                                      <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                          <span className="text-foreground truncate">Préstamo #{ln}</span>
                                                          <span className={`px-2 py-0.5 rounded ${stClass}`}>{st || '—'}</span>
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground">{lp}/{lt} cuotas confirmadas</div>
                                                      </div>
                                                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { const lid = String(l.id); if (lid) window.location.href = `/dashboard/loans/${lid}` }}>Ver detalles préstamo</Button>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </CardContent>
                                          </Card>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden mt-4">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="text-muted-foreground">Asesor</TableHead>
                                        <TableHead className="text-muted-foreground">Correo</TableHead>
                                        <TableHead className="text-muted-foreground">Clientes asignados</TableHead>
                                        <TableHead className="text-muted-foreground">Detalle</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {advisorItems.map((a, idx) => (
                                        <TableRow key={idx} className="border-border/50">
                                          <TableCell className="text-foreground">{a.name || a.email || 'Asesor'}</TableCell>
                                          <TableCell className="text-foreground">{a.email || '-'}</TableCell>
                                          <TableCell className="text-foreground">{(a.clients || []).length}</TableCell>
                                          <TableCell>
                                            <Button variant="ghost" size="sm" onClick={() => setAdvisorClientsView({ id: a.id, name: a.name, email: a.email })}>Ver desglose</Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <LoansTable loans={advisorSelectedLoans} userRole={userData.role} onLoanUpdated={fetchLoans} groupMap={loanGroupMap} />
                  )
                ) : null
              ) : (
                <LoansTable loans={displayLoans} userRole={userData.role} onLoanUpdated={fetchLoans} groupMap={loanGroupMap} />
              )}
            </TabsContent>
          <TabsContent value="groups">
            <h3 className="text-xl font-semibold text-foreground mb-4">Préstamos por Grupo</h3>
            {groupsError && (
              <div className="mb-3 text-sm text-muted-foreground flex items-center gap-2">
                <span>{groupsError}</span>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const res = await fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 })
                    if (res.ok) {
                      const groupsData = await res.json()
                      setGroupLoans(groupsData || [])
                      const map: Record<string, { groupName: string }> = {}
                      for (const g of groupsData || []) {
                        const name = g.group?.nombre || 'Grupo'
                        for (const item of g.loans || []) {
                          if (item.loan_id) {
                            map[item.loan_id] = { groupName: name }
                          }
                        }
                      }
                      setLoanGroupMap(map)
                      setGroupsError(null)
                    }
                  } catch {}
                }}>Reintentar</Button>
              </div>
            )}
              {groupsTabVisited && (
                <GroupLoansTable
                  items={(groupLoans || [])
                    .map((g: any) => {
                      const selector = (loan: any) => {
                        if (!advisorSelectedView || advisorSelectedView === 'all') return true
                        if (advisorSelectedView === 'active') return loan?.status === 'active'
                        if (advisorSelectedView === 'pending') return loan?.status === 'pending'
                        if (advisorSelectedView === 'paid') return loan?.status === 'paid'
                        if (advisorSelectedView === 'aldia') return !(loan as any)?.hasOverdue
                        if (advisorSelectedView === 'mora') return Boolean((loan as any)?.hasOverdue)
                        return true
                      }
                      const clientsItems = (g.loans || [])
                        .map((item: any) => {
                          const loan = loans.find((l: any) => String(l.id) === String(item.loan_id))
                          if (!loan) return { name: '', amount: 0 }
                          if (!selector(loan)) return { name: '', amount: 0 }
                          const name = loan?.client ? `${loan.client.firstName ?? loan.client.first_name} ${loan.client.lastName ?? loan.client.last_name}` : ''
                          const amount = loan?.amount ? Number(loan.amount) : 0
                          const progressPaid = loan ? Number((loan as any).progressPaid || 0) : 0
                          const progressTotal = loan ? Number((loan as any).progressTotal || 0) : 0
                          const hasOverdue = loan ? Boolean((loan as any).hasOverdue) : false
                          return { name, amount, progressPaid, progressTotal, hasOverdue }
                        })
                        .filter((c: any) => c.name)
                      const groupHasSelected = (() => {
                        if (!advisorSelectedView || advisorSelectedView === 'all') return true
                        return (g.loans || []).some((item: any) => {
                          const loan = loans.find((l: any) => String(l.id) === String(item.loan_id))
                          return loan && selector(loan)
                        })
                      })()
                      return {
                        groupName: g.group?.nombre ?? 'Grupo',
                        totalAmount: Number(g.total_amount) || clientsItems.reduce((s: number, c: any) => s + (c.amount || 0), 0),
                        clients: clientsItems,
                        groupId: g.group_id,
                        totalMembers: (g.loans || []).length,
                        _include: groupHasSelected,
                      }
                    })
                    .filter((it: any) => it._include)}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <LoanCalculatorModal open={calcOpen} onOpenChange={setCalcOpen} />
    </>
  )
}
