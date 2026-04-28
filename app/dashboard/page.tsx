'use client'

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { StatsCard } from "@/components/stats-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { LoansTable } from "@/components/loans-table"
import { GroupLoansTable } from "@/components/group-loans-table"
import { CreateLoanDialog } from "@/components/create-loan-dialog"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Users, TrendingUp, FileText, Download, Calculator, ArrowUpRight, ArrowDownRight, Wallet, AlertTriangle, CheckCircle2, Hourglass, Loader2 } from "lucide-react"
import { LoanCalculatorModal } from "@/components/loan-calculator-modal"
const QuetzalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <text x="12" y="16" textAnchor="middle" fontSize="16" fill="currentColor" fontWeight="bold">Q</text>
  </svg>
)
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"

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

import { AdvisorPerformanceCard } from "@/components/advisor-performance-card"

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
  const [advisorFilter, setAdvisorFilter] = useState<'all' | 'aldia' | 'mora'>('all')
  const [paymentsAgg, setPaymentsAgg] = useState<Record<string, number>>({})
  const [paymentsConfirmedCounts, setPaymentsConfirmedCounts] = useState<Record<string, number>>({})
  const [advisorSelectedView, setAdvisorSelectedView] = useState<'all' | 'active' | 'aldia' | 'mora' | 'pending' | 'paid' | 'asesores_stats' | null>(null)
  const [groupsTabVisited, setGroupsTabVisited] = useState(false)
  const [advisors, setAdvisors] = useState<any[]>([])
  const [advisorClientsView, setAdvisorClientsView] = useState<{ id: string, name: string, email: string } | null>(null)
  const [advisorCommissions, setAdvisorCommissions] = useState<Record<string, any>>({})
  const [calcOpen, setCalcOpen] = useState(false)
  const [interestStats, setInterestStats] = useState<{ totalCapitalRecuperado: number, totalInteresesRecuperados: number, totalInteresesPorPagar: number }>({ totalCapitalRecuperado: 0, totalInteresesRecuperados: 0, totalInteresesPorPagar: 0 })
  const [explanationOpen, setExplanationOpen] = useState(false)
  const [isMoraModalOpen, setIsMoraModalOpen] = useState(false)
  const [moraModalData, setMoraModalData] = useState<any[]>([])

  const [isCutoffModalOpen, setIsCutoffModalOpen] = useState(false)
  const [isCutoffLoading, setIsCutoffLoading] = useState(false)

  // REFERENCIA PARA EL SCROLL 
  const resultsSectionRef = useRef<HTMLDivElement>(null)

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

  const refreshAfterCreation = useCallback(async () => {
    await delay(1000)
    try {
      const [loansRes, groupsRes] = await Promise.all([
        fetchWithTimeout('/api/loans', { timeoutMs: 12000 }),
        fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 })
      ])
      if (loansRes.ok) {
        const data = await loansRes.json()
        setLoans(data || [])
        writeCache(K.loans, data || [])
      }
      if (groupsRes.ok) {
        const data = await groupsRes.json()
        setGroupLoans(data || [])
        writeCache(K.groupLoans, data || [])
        const map: Record<string, { groupName: string }> = {}
        for (const g of (data || [])) {
          const name = g.group?.nombre || 'Grupo'
          for (const item of g.loans || []) {
            if (item.loan_id) map[item.loan_id] = { groupName: name }
          }
        }
        setLoanGroupMap(map)
        writeCache(K.loanGroupMap, map)
      }
    } catch { }
  }, [])

  const revalidateAll = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    try {
      const supabase = createClient()
      const u = await getUserWithRetry()
      setUser(u)
      if (u) writeCache(K.user, u)
      let currentUserData = readCache(K.userData)
      if (!currentUserData || !currentUserData.id) {
        if (u) {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('auth_id', u.id)
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
      if (!currentUserData && !u) {
        window.location.href = '/auth/login'
        return
      }
      const role = currentUserData?.role
      const promises: Promise<any>[] = []
      const keys: string[] = []
      promises.push(fetchWithTimeout('/api/loans', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
      keys.push('loans')
      promises.push(fetchWithTimeout('/api/clients', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
      keys.push('clients')
      promises.push(fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
      keys.push('groupLoans')
      promises.push(fetchWithTimeout('/api/payments', { timeoutMs: 12000, cache: 'no-store' as any }).then(r => r.ok ? r.json() : null))
      keys.push('payments')
      if (['admin', 'asesor', 'contador'].includes(role)) {
        promises.push(fetchWithTimeout('/api/advisors', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
        keys.push('advisors')
      }
      if (['admin', 'contador'].includes(role)) {
        promises.push(fetchWithTimeout('/api/advisors/commissions', { timeoutMs: 12000 }).then(r => r.ok ? r.json() : null))
        keys.push('commissions')
      }

      const handleExecuteCutoff = async () => {
        setIsCutoffLoading(true)
        try {
          const res = await fetch('/api/advisors/commissions/cutoff', { method: 'POST' })
          if (!res.ok) throw new Error('Error al ejecutar el corte')
          const data = await res.json()
          alert(`Corte realizado con éxito.\nSe procesaron ${data.cutoffsCreated} cortes de asesores y se actualizaron ${data.schedulesUpdated} cuotas.`)
          setIsCutoffModalOpen(false)
          // Refrescar datos
          revalidateAll()
        } catch (error) {
          console.error(error)
          alert('Hubo un error al ejecutar el corte de comisiones. Inténtalo de nuevo.')
        } finally {
          setIsCutoffLoading(false)
        }
      }

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
            const map: Record<string, { groupName: string }> = {}
            for (const g of data) {
              const name = g.group?.nombre || 'Grupo'
              for (const item of g.loans || []) {
                if (item.loan_id) map[item.loan_id] = { groupName: name }
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
            const agg: Record<string, number> = {}
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
        if (key === 'commissions') {
          if (data) {
            setAdvisorCommissions(data)
          }
        }
      })
    } catch (e) {
      console.error('Dashboard revalidation error:', e)
    } finally {
      // Also fetch interest stats for the explanation panel
      try {
        const istRes = await fetch('/api/reports/portfolio-stats')
        if (istRes.ok) {
          const ist = await istRes.json()
          setInterestStats({
            totalCapitalRecuperado: Number(ist.totalCapitalRecuperado || 0),
            totalInteresesRecuperados: Number(ist.totalInteresesRecuperados || 0),
            totalInteresesPorPagar: Number(ist.totalInteresesPorPagar || 0)
          })
        }
      } catch { }
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [])

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
    } catch { }
    revalidateAll()
    return () => {
      const arr = abortControllersRef.current.splice(0)
      for (const c of arr) {
        try { if (!c.signal?.aborted) c.abort('cleanup') } catch { }
      }
      inFlightRef.current = false
    }
  }, [revalidateAll])

  useEffect(() => {
    const onFocus = () => {
      revalidateAll().catch(() => { })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        revalidateAll().catch(() => { })
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [revalidateAll])

  useEffect(() => {
    if (userData?.role === 'cliente' && loans.length > 0) {
      const activeLoans = (loans || []).filter((l: any) => l.status === 'active');
      if (activeLoans.length > 0) {
        if (selectedLoanId && !activeLoans.some(l => l.id === selectedLoanId)) {
          const newSelected = activeLoans[0]?.id || null
          setSelectedLoanId(newSelected);
          if (newSelected) writeCache(K.selectedLoanId, newSelected)
        }
        if (!selectedLoanId && activeLoans[0]?.id) {
          setSelectedLoanId(activeLoans[0].id);
        }

        const loanToFetch = selectedLoanId ? activeLoans.find(l => l.id === selectedLoanId) : activeLoans[0];

        if (loanToFetch?.id && !activeLoanDetails[loanToFetch.id]) {
          ; (async () => {
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
            } catch { }
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
  const activeLoansList = displayLoans.filter((loan: any) => loan.status === "active")
  const activeLoans = activeLoansList.length
  const pendingLoans = displayLoans.filter((loan: any) => loan.status === 'pending').length
  const paidLoans = displayLoans.filter((loan: any) => loan.status === 'paid').length
  const totalClients = clients.length

  const totalActiveCapital = activeLoansList.reduce((sum: number, loan: any) => {
    const amount = Number(loan.amount || 0)
    return sum + amount
  }, 0)

  const moraLoansList = activeLoansList.filter((loan: any) => Boolean((loan as any).hasOverdue))
  const alDiaLoansList = activeLoansList.filter((loan: any) => !Boolean((loan as any).hasOverdue))
  const moraAmountDisplay = moraLoansList.reduce((sum: number, loan: any) => sum + Number((loan as any).moraTotal || 0), 0)
  const moraPctDisplay = totalActiveCapital > 0 ? (moraAmountDisplay / totalActiveCapital) : 0
  const pendingPortfolioAmount = alDiaLoansList.reduce((sum: number, loan: any) => sum + Number(loan.amount || 0), 0)
  const pendingPortfolioCount = alDiaLoansList.length
  const pendingLoansAmount = displayLoans.filter((loan: any) => loan.status === 'pending').reduce((sum: number, loan: any) => sum + Number(loan.amount || 0), 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPct = (value: number) => {
    if (!Number.isFinite(value)) return '0.0'
    return value.toFixed(1)
  }

  const parseLoanDate = (loan: any) => {
    const raw = (loan as any)?.createdAt ?? (loan as any)?.created_at
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const calcTrendPct = (current: number, previous: number) => {
    if (previous > 0) return ((current - previous) / previous) * 100
    if (current > 0) return 100
    return 0
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  const inRange = (d: Date | null, start: Date, end?: Date) => {
    if (!d) return false
    if (end) return d >= start && d <= end
    return d >= start
  }

  const kpiLoansBase = (userData.role === 'admin' || userData.role === 'asesor' || userData.role === 'contador') ? (loans || []) : []
  const kpiActiveLoans = kpiLoansBase.filter((l: any) => l.status === 'active')
  const kpiPendingLoans = kpiLoansBase.filter((l: any) => l.status === 'pending')
  const kpiAlDiaLoans = kpiActiveLoans.filter((l: any) => !Boolean((l as any).hasOverdue))
  const kpiMoraLoans = kpiActiveLoans.filter((l: any) => Boolean((l as any).hasOverdue))
  const kpiActiveCapital = kpiActiveLoans.reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
  const kpiSaldoAlDia = kpiAlDiaLoans.reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
  const kpiMoraAmount = kpiMoraLoans.reduce((s: number, l: any) => s + Number((l as any).overduePrincipal || 0), 0)
  const kpiMoraCount = kpiMoraLoans.reduce((s: number, l: any) => s + Number((l as any).overdueCount || 0), 0)
  const kpiMoraPct = kpiActiveCapital > 0 ? (kpiMoraAmount / kpiActiveCapital) : 0
  // kpiRecoveredAmount: capital puro recuperado — uses same priority logic as the Total Cartera PDF report
  // (loaded from /api/reports/portfolio-stats which applies mora -> fees -> interest -> capital)
  const kpiRecoveredAmount = interestStats.totalCapitalRecuperado
  const kpiRecoveredPct = kpiActiveCapital > 0 ? (kpiRecoveredAmount / kpiActiveCapital) : 0

  const approvalsThisMonth = kpiLoansBase.filter((l: any) => {
    const st = String(l.status || '')
    if (st !== 'active' && st !== 'paid') return false
    return inRange(parseLoanDate(l), startOfMonth)
  })
  const approvalsPrevMonth = kpiLoansBase.filter((l: any) => {
    const st = String(l.status || '')
    if (st !== 'active' && st !== 'paid') return false
    return inRange(parseLoanDate(l), startOfPrevMonth, endOfPrevMonth)
  })
  const approvalsThisMonthCount = approvalsThisMonth.length
  const approvalsPrevMonthCount = approvalsPrevMonth.length
  const approvalsThisMonthAmount = approvalsThisMonth.reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
  const approvalsPrevMonthAmount = approvalsPrevMonth.reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
  const approvalsGrowthPct = calcTrendPct(approvalsThisMonthCount, approvalsPrevMonthCount)
  const approvalsAmountGrowthPct = calcTrendPct(approvalsThisMonthAmount, approvalsPrevMonthAmount)

  const moraPrevMonthAmount = kpiMoraLoans.filter((l: any) => inRange(parseLoanDate(l), startOfPrevMonth, endOfPrevMonth)).reduce((s: number, l: any) => s + Number((l as any).overduePrincipal || 0), 0)
  const moraTrendPct = calcTrendPct(kpiMoraAmount, moraPrevMonthAmount)
  const approvalsTrendUp = approvalsGrowthPct >= 0
  const approvalsAmountTrendUp = approvalsAmountGrowthPct >= 0
  const moraTrendUp = moraTrendPct >= 0

  const getProgressColor = (paid: number, total: number) => {
    if (total === 0) return '#e5e7eb';
    const percentage = (paid / total) * 100;
    if (percentage <= 33) return '#ef4444'; // red
    if (percentage <= 66) return '#facc15'; // yellow
    return '#22c55e'; // green
  };

  const advisorSelectedLoans = (() => {
    if (!(userData.role === 'asesor' || userData.role === 'admin' || userData.role === 'contador')) return displayLoans
    const list = (loans || [])
    if (!advisorSelectedView) return []
    let filtered: any[] = []
    if (advisorSelectedView === 'all') {
      filtered = list
    } else if (advisorSelectedView === 'active') {
      filtered = list.filter((l: any) => l.status === 'active')
    } else if (advisorSelectedView === 'pending') {
      filtered = list.filter((l: any) => l.status === 'pending')
    } else if (advisorSelectedView === 'paid') {
      filtered = list.filter((l: any) => l.status === 'paid')
    } else if (advisorSelectedView === 'aldia') {
      filtered = list.filter((l: any) => l.status === 'active' && !(l as any).hasOverdue)
    } else if (advisorSelectedView === 'mora') {
      filtered = list.filter((l: any) => Boolean((l as any).hasOverdue))
    }
    try { writeCache(K.advisorLoansViewPrefix + advisorSelectedView, filtered) } catch { }
    return filtered
  })()

  const scopeLoans = ((userData.role === 'asesor') || (userData.role === 'admin') || (userData.role === 'contador')) ? (advisorSelectedView ? advisorSelectedLoans : (loans || [])) : displayLoans
  const advisorGlobalProgress = ((userData.role === 'asesor') || (userData.role === 'admin') || (userData.role === 'contador')) ? (() => {
    const paid = (scopeLoans || []).reduce((s: number, l: any) => s + Number((l as any).progressPaid || 0), 0)
    const total = (scopeLoans || []).reduce((s: number, l: any) => s + Number((l as any).progressTotal || 0), 0)
    return { paid, total }
  })() : { paid: 0, total: 0 }

  const advisorTotals = ((userData.role === 'asesor') || (userData.role === 'admin') || (userData.role === 'contador')) ? (() => {
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

  const advisorGroupTotals = ((userData.role === 'asesor') || (userData.role === 'admin') || (userData.role === 'contador')) ? (() => {
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


  // FUNCIÓN DE SCROLL ROBUSTA (ScrollIntoView)
  const handleAdvisorCardClick = (view: 'all' | 'active' | 'aldia' | 'mora' | 'pending' | 'paid' | 'asesores_stats') => {
    setAdvisorSelectedView(view)
    writeCache(K.advisorSelectedView, view)

    // Le damos un pequeño respiro para que React renderice el cambio de estado (filtros)
    // y luego ejecutamos el scroll sobre la referencia.
    setTimeout(() => {
      if (resultsSectionRef.current) {
        resultsSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start' // Alinea el elemento al inicio del área visible
        });
      }
    }, 150);
  }

  // ─── Cartera explanation logic (mirrors the "Total Cartera" report) ───────
  const kpiTotalPrestado = kpiActiveLoans.reduce((s: number, l: any) => s + Number(l.amount || 0), 0)
  const kpiSaldoPendiente = Math.max(0, kpiTotalPrestado - kpiRecoveredAmount)

  return (
    <>
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 truncate">
            {userData.role === 'admin' || userData.role === 'contador' ? 'Panel de Administración' : userData.role === 'asesor' ? 'Panel del Asesor' : 'Mis Préstamos'}
          </h2>
          <p className="text-muted-foreground text-sm">
            {userData.role === 'admin' || userData.role === 'contador'
              ? 'Resumen general del sistema de préstamos'
              : userData.role === 'asesor'
                ? 'Gestiona tus clientes y sus préstamos'
                : 'Gestiona y revisa tus préstamos activos'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {userData.role === 'admin' && (
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setIsCutoffModalOpen(true)}>
              <Wallet className="h-4 w-4" />
              Corte de Comisiones
            </Button>
          )}
          {(userData.role === 'admin' || userData.role === 'contador') && (
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" asChild>
              <a href="/api/reports/loans-excel" target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
                Exportar Excel
              </a>
            </Button>
          )}
          {(userData.role === 'admin' || userData.role === 'asesor') && (
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => setCalcOpen(true)}>
              <Calculator className="h-4 w-4" />
              Calculadora
            </Button>
          )}
          {(userData.role === 'admin' || userData.role === 'asesor') && (
            <CreateLoanDialog clients={transformedClients} onLoanCreated={refreshAfterCreation} />
          )}
        </div>
      </div>

      {/* ── ADMIN / ASESOR / CONTADOR DASHBOARD ────────────────── */}
      {(userData.role === 'admin' || userData.role === 'asesor' || userData.role === 'contador') && (<>

        {/* ── ROW 1: PRIMARY CARTERA METRICS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          {/* Cartera Activa */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50 bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm hover:from-primary/15 hover:to-primary/10 transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Cartera Activa</CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">{formatCurrency(kpiActiveCapital)}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{kpiActiveLoans.length} préstamos</Badge>
                    <span className="text-xs text-muted-foreground">activos</span>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>Capital total de todos los préstamos activos (al día + en mora)</TooltipContent>
          </Tooltip>

          {/* Capital Recuperado */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-sm hover:from-emerald-500/15 hover:to-emerald-500/10 transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Capital Recuperado</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-xl sm:text-2xl font-bold text-emerald-500 tabular-nums">{formatCurrency(kpiRecoveredAmount)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatPct(kpiRecoveredPct * 100)}% de cartera activa
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>Pagos confirmados/aprobados en préstamos activos (solo capital puro, después de deducir mora, gastos e intereses)</TooltipContent>
          </Tooltip>

          {/* Saldo Pendiente */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50 bg-gradient-to-br from-amber-500/10 to-amber-500/5 backdrop-blur-sm hover:from-amber-500/15 hover:to-amber-500/10 transition-all duration-300 hover:-translate-y-0.5 cursor-default">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Saldo Pendiente</CardTitle>
                  <Hourglass className="h-4 w-4 text-amber-500 shrink-0" />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-xl sm:text-2xl font-bold text-amber-500 tabular-nums">{formatCurrency(kpiSaldoPendiente)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Capital aún por recuperar
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>Capital Activo − Capital Recuperado = lo que aún falta cobrar</TooltipContent>
          </Tooltip>

          {/* Mora actual */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Card
                onClick={() => {
                  const allOverdue = kpiMoraLoans.flatMap((l: any) => (l.overdueInstallments || []).map((s: any) => ({ ...s, loan_id: l.id, loan_number: l.loanNumber, clientName: `${l.client?.firstName || ''} ${l.client?.lastName || ''}` })))
                  setMoraModalData(allOverdue.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()))
                  setIsMoraModalOpen(true)
                }}
                className={`border-border/50 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 cursor-pointer hover:shadow-md ${kpiMoraAmount > 0 ? 'bg-gradient-to-br from-rose-500/10 to-rose-500/5 hover:from-rose-500/15 hover:to-rose-500/10 border-rose-500/20' : 'bg-gradient-to-br from-emerald-500/5 to-card/60 hover:bg-card/80 border-emerald-500/20'}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Capital en Mora</CardTitle>
                  <AlertTriangle className={`h-4 w-4 shrink-0 transition-transform ${kpiMoraAmount > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className={`text-xl sm:text-2xl font-bold tabular-nums ${kpiMoraAmount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{formatCurrency(kpiMoraAmount)}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {kpiMoraCount > 0 && <Badge variant="destructive" className="h-4 text-[10px] px-1.5">{kpiMoraCount} cuotas atrasadas</Badge>}
                    <span className="text-xs text-muted-foreground">{formatPct(kpiMoraPct * 100)}% cartera</span>
                  </div>
                  <div className={`text-[10px] mt-1.5 flex items-center gap-0.5 ${moraTrendUp ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {moraTrendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {formatPct(Math.abs(moraTrendPct))}% vs mes anterior
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent align="end">
              <div className="text-xs max-w-xs space-y-1">
                <p className="font-semibold">Suma del capital de las cuotas vencidas.</p>
                <p className="text-muted-foreground">Haz clic para ver el desglose de cuotas y clientes.</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── ROW 2: SECONDARY MINI METRICS ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3">
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">Aprobados este mes</CardTitle>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold text-foreground">{approvalsThisMonthCount} <span className="text-sm font-normal text-muted-foreground">préstamos</span></div>
              <div className="text-xs text-muted-foreground">{formatCurrency(approvalsThisMonthAmount)} en desembolsos</div>
              <div className={`text-[10px] mt-0.5 flex items-center gap-0.5 ${approvalsTrendUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {approvalsTrendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {formatPct(Math.abs(approvalsGrowthPct))}% vs mes anterior
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">Saldo al día (sin mora)</CardTitle>
              <Wallet className="h-3.5 w-3.5 text-sky-500" />
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-xl font-bold text-foreground">{formatCurrency(kpiSaldoAlDia)}</div>
              <div className="text-xs text-muted-foreground">{kpiAlDiaLoans.length} préstamos corrientes</div>
            </CardContent>
          </Card>
        </div>

        {/* ── COLLAPSIBLE EXPLANATION BAR (full width, zero dead space) ── */}
        <div className="rounded-lg border border-border/50 bg-card/60 backdrop-blur-sm mb-4 overflow-hidden">
          <button
            onClick={() => setExplanationOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">Cómo leer estos números</span>
            </div>
            <svg className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${explanationOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {explanationOpen && (
            <div className="px-4 pb-3 pt-0 border-t border-border/30">
              <div className="text-xs text-foreground leading-6 space-y-0.5 py-2">
                <div><strong>Total Prestado ({formatCurrency(kpiActiveCapital)})</strong> — Suma de los montos originales de todos los préstamos <strong>activos</strong>. Es lo que la cooperativa tiene colocado actualmente.</div>
                <div><strong className="text-emerald-500">Capital Recuperado ({formatCurrency(kpiRecoveredAmount)})</strong> — Porción de <strong>capital puro</strong> ya cobrado de esos préstamos (no incluye intereses, mora ni gastos administrativos).</div>
                <div><strong className="text-amber-500">Saldo Pendiente ({formatCurrency(kpiSaldoPendiente)})</strong> — Capital que aún falta recuperar: {formatCurrency(kpiActiveCapital)} − {formatCurrency(kpiRecoveredAmount)} = <strong className="text-amber-500">{formatCurrency(kpiSaldoPendiente)}</strong>.</div>
                <div><strong className="text-sky-400">Intereses Recuperados ({formatCurrency(interestStats.totalInteresesRecuperados)})</strong> — Intereses ya cobrados de los préstamos activos (separado del capital).</div>
                <div><strong className="text-violet-400">Intereses por Pagar ({formatCurrency(interestStats.totalInteresesPorPagar)})</strong> — Intereses que aún se esperan cobrar en el futuro de los préstamos activos.</div>
              </div>
              <p className="text-[10px] text-muted-foreground">💡 Cada pago cubre primero mora → gastos admin → intereses → y finalmente capital.</p>
            </div>
          )}
        </div>




        {/* ── ROW 3: QUICK-FILTER TAB BAR ── */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { key: 'all', label: 'Todos', count: (loans || []).length },
            { key: 'active', label: 'Activos', count: activeLoans },
            { key: 'aldia', label: 'Al día', count: pendingPortfolioCount },
            { key: 'mora', label: 'En mora', count: moraLoansList.length },
            { key: 'pending', label: 'Pendientes', count: pendingLoans },
            { key: 'paid', label: 'Pagados', count: paidLoans },
            ...((userData.role === 'admin' || userData.role === 'contador') ? [{ key: 'asesores_stats', label: 'Asesores', count: advisors.length || Array.from(new Set((clients || []).map((c: any) => String(c.advisor_id)).filter(Boolean))).length }] : []),
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => handleAdvisorCardClick(key as any)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${advisorSelectedView === key
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/80 hover:text-foreground'
                }`}
            >
              {label}
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] rounded-full px-1 ${advisorSelectedView === key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>{count}</span>
            </button>
          ))}
        </div>

        {/* ── ASESOR PORTFOLIO CHARTS ── */}
        {userData.role === 'asesor' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Recuperación individual</CardTitle>
                <QuetzalIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold text-foreground">{formatCurrency(advisorTotals.totalRepayable)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total a recuperar</p>
                    <p className="text-xs text-emerald-500 mt-1">Recuperado: {formatCurrency(advisorTotals.paidRecovered)}</p>
                  </div>
                  <div className="w-28 h-28 relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie dataKey="value" data={[{ name: 'Recuperado', value: Math.min(advisorTotals.paidRecovered, advisorTotals.totalRepayable) }, { name: 'Pendiente', value: Math.max(0, advisorTotals.totalRepayable - advisorTotals.paidRecovered) }]} innerRadius={40} outerRadius={54} paddingAngle={2}>
                          <Cell fill={getProgressColor(advisorTotals.paidRecovered, advisorTotals.totalRepayable)} />
                          <Cell fill="#e5e7eb22" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-xs font-semibold">{advisorTotals.totalRepayable > 0 ? Math.round((advisorTotals.paidRecovered / advisorTotals.totalRepayable) * 100) : 0}%</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Recuperación grupal</CardTitle>
                <QuetzalIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold text-foreground">{formatCurrency(advisorGroupTotals.totalRepayable)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total a recuperar</p>
                    <p className="text-xs text-emerald-500 mt-1">Recuperado: {formatCurrency(advisorGroupTotals.paidRecovered)}</p>
                  </div>
                  <div className="w-28 h-28 relative shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie dataKey="value" data={[{ name: 'Recuperado', value: Math.min(advisorGroupTotals.paidRecovered, advisorGroupTotals.totalRepayable) }, { name: 'Pendiente', value: Math.max(0, advisorGroupTotals.totalRepayable - advisorGroupTotals.paidRecovered) }]} innerRadius={40} outerRadius={54} paddingAngle={2}>
                          <Cell fill={getProgressColor(advisorGroupTotals.paidRecovered, advisorGroupTotals.totalRepayable)} />
                          <Cell fill="#e5e7eb22" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-xs font-semibold">{advisorGroupTotals.totalRepayable > 0 ? Math.round((advisorGroupTotals.paidRecovered / advisorGroupTotals.totalRepayable) * 100) : 0}%</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── SCROLL ANCHOR ── */}
        <div ref={resultsSectionRef} className="scroll-mt-28" style={{ scrollMarginTop: '120px' }} />

        {/* ── LOANS TABLE ── */}
        <div>
          <Tabs defaultValue="clients" onValueChange={(v) => { if (v === 'groups') setGroupsTabVisited(true) }} className="w-full" id="loans-tabs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  {userData.role !== 'asesor' ? 'Todos los Préstamos' : 'Mis Préstamos'}
                </h3>
                {advisorSelectedView && advisorSelectedView !== 'asesores_stats' && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      const m: Record<string, string> = { all: 'Todos', active: 'Activos', aldia: 'Al día', mora: 'Con mora', pending: 'Pendientes', paid: 'Pagados' }
                      return `Mostrando: ${m[String(advisorSelectedView)] || advisorSelectedView} · Progreso global: ${advisorGlobalProgress.paid}/${advisorGlobalProgress.total} cuotas`
                    })()}
                  </p>
                )}
                {!advisorSelectedView && (
                  <p className="text-xs text-muted-foreground mt-0.5">Selecciona una tarjeta de arriba para filtrar</p>
                )}
              </div>
              <TabsList className="grid w-full sm:w-auto grid-cols-2 bg-muted/50">
                <TabsTrigger value="clients">Clientes</TabsTrigger>
                <TabsTrigger value="groups">Grupos</TabsTrigger>
              </TabsList>
            </div>

            {loansError && (
              <div className="mb-3 text-sm text-muted-foreground flex items-center gap-2">
                <span>{loansError}</span>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const res = await fetchWithTimeout('/api/loans', { timeoutMs: 12000 })
                    if (res.ok) { const data = await res.json(); setLoans(data || []); setLoansError(null) }
                  } catch { }
                }}>Reintentar</Button>
              </div>
            )}

            <TabsContent value="clients">
              {(userData.role === 'asesor' || userData.role === 'admin' || userData.role === 'contador') ? (
                advisorSelectedView ? (
                  advisorSelectedView === 'asesores_stats' ? (
                    (() => {
                      const clientAdvisor: Record<string, string> = {}
                      for (const c of (clients || [])) { if (c?.id) clientAdvisor[String(c.id)] = String(c.advisor_id || '') }
                      const advisorLoans = (loans || []).filter((l: any) => (l.status === 'active' || l.status === 'paid') && clientAdvisor[String(l.clientId)])
                      const paidCount = advisorLoans.reduce((s: number, l: any) => s + Number((l as any).progressPaid || 0), 0)
                      const totalCount = advisorLoans.reduce((s: number, l: any) => s + Number((l as any).progressTotal || 0), 0)
                      const data = [{ name: 'Pagadas', value: paidCount }, { name: 'Restantes', value: Math.max(0, totalCount - paidCount) }]
                      const installments = (l: any) => { const months = Number(l?.termMonths || 0); const freq = String(l?.paymentFrequency || ''); return freq === 'quincenal' ? months * 2 : months }
                      const totalRepayableMoney = advisorLoans.reduce((s: number, l: any) => s + Number(l?.monthlyPayment || 0) * installments(l), 0)
                      const paidRecoveredMoney = advisorLoans.reduce((s: number, l: any) => { const k = String(l?.id); return s + Number(paymentsAgg[k] || 0) }, 0)
                      const moneyData = [{ name: 'Recuperado', value: Math.min(paidRecoveredMoney, totalRepayableMoney) }, { name: 'Pendiente', value: Math.max(0, totalRepayableMoney - paidRecoveredMoney) }]
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
                              <CardTitle className="text-sm font-medium text-muted-foreground">Recuperación de dinero</CardTitle>
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
                          <div className="sm:col-span-2 mt-6">
                            {(() => {
                              const advisorItems = (() => {
                                const byAdvisor: Record<string, { id: string, authId: string, advisorIdFromClients: string, email: string, name: string, clients: any[] }> = {}
                                for (const a of advisors || []) {
                                  const id = String(a.id)
                                  const authId = String(a.auth_id || '')
                                  const name = String(a.full_name || '') || `${String(a.first_name || '')} ${String(a.last_name || '')}`.trim()
                                  byAdvisor[id] = { id, authId, advisorIdFromClients: '', email: String(a.email || ''), name, clients: [] }
                                  if (authId) byAdvisor[authId] = byAdvisor[id] // alias by auth_id too
                                }
                                for (const c of (clients || [])) {
                                  const aid = String(c.advisor_id || '')
                                  if (!aid) continue
                                  // Look up by users.id or users.auth_id
                                  let ref = byAdvisor[aid]
                                  if (!ref) {
                                    // Try matching from advisors list
                                    const found = (advisors || []).find((u: any) => String(u.id) === aid || String(u.auth_id) === aid)
                                    if (found) {
                                      const id = String(found.id)
                                      if (!byAdvisor[id]) {
                                        const name = String(found.full_name || '') || `${String(found.first_name || '')} ${String(found.last_name || '')}`.trim()
                                        byAdvisor[id] = { id, authId: String(found.auth_id || ''), advisorIdFromClients: aid, email: String(found.email || ''), name, clients: [] }
                                        if (aid !== id) byAdvisor[aid] = byAdvisor[id]
                                      }
                                      ref = byAdvisor[id]
                                    } else {
                                      byAdvisor[aid] = { id: aid, authId: '', advisorIdFromClients: aid, email: String(c.advisor_email || ''), name: '', clients: [] }
                                      ref = byAdvisor[aid]
                                    }
                                  }
                                  if (ref && !ref.advisorIdFromClients) ref.advisorIdFromClients = aid
                                  ref.clients.push(c)
                                }
                                // Deduplicate: only keep entries that are the canonical users.id key
                                const seen = new Set<string>()
                                return Object.values(byAdvisor).filter(it => {
                                  if (seen.has(it.id)) return false
                                  seen.add(it.id)
                                  return (it.clients || []).length > 0
                                })
                              })()

                              if (advisorClientsView) {
                                const target = advisorItems.find(it => it.id === advisorClientsView.id) || { id: advisorClientsView.id, name: advisorClientsView.name, email: advisorClientsView.email, clients: [] }
                                return (
                                  <div className="mt-4 space-y-3">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                      <div>
                                        <div className="text-sm text-muted-foreground">Clientes del asesor</div>
                                        <div className="text-lg font-semibold text-foreground">{advisorClientsView.name || target.name} · {advisorClientsView.email || target.email}</div>
                                      </div>
                                      <Button variant="outline" size="sm" onClick={() => setAdvisorClientsView(null)}>Volver a tarjetas</Button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {(target.clients || []).map((c: any, i: number) => {
                                        const clientId = String(c.id)
                                        const clientName = `${String(c.first_name || '')} ${String(c.last_name || '')}`.trim() || String(c.email || 'Cliente')
                                        const selectedLoans = (loans || []).filter((l: any) => (l.status === 'active' || l.status === 'paid') && String((l?.client || {}).id) === clientId)
                                        const totalInstallments = selectedLoans.reduce((s: number, l: any) => s + Number((l as any).progressTotal || 0), 0)
                                        const confirmedInstallments = selectedLoans.reduce((s: number, l: any) => s + Number((l as any).progressPaid || 0), 0)
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
                                                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { if (clientId) window.location.href = `/dashboard/clients/${clientId}` }}>Ver detalles</Button>
                                              </div>
                                              <div className="mt-3 space-y-2">
                                                {clientLoans.length === 0 ? (
                                                  <div className="text-xs text-muted-foreground">Sin préstamos</div>
                                                ) : clientLoans.map((l: any, j: number) => {
                                                  const lp = Number((l as any).progressPaid || 0)
                                                  const lt = Number((l as any).progressTotal || 0)
                                                  const ln = String((l as any).loanNumber || (l as any).loan_number || l.id)
                                                  const st = String((l as any).status || '')
                                                  const stClass = st === 'active' ? 'bg-emerald-500/20 text-emerald-400' : st === 'pending' ? 'bg-amber-500/20 text-amber-400' : st === 'paid' ? 'bg-blue-500/20 text-blue-400' : 'bg-muted text-muted-foreground'
                                                  return (
                                                    <div key={j} className="rounded-md border border-border/50 p-2 text-xs flex items-center justify-between gap-2">
                                                      <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                          <span className="text-foreground truncate">#{ln}</span>
                                                          <span className={`px-2 py-0.5 rounded ${stClass}`}>{st}</span>
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground">{lp}/{lt} pagadas</div>
                                                      </div>
                                                      <Button variant="ghost" size="sm" className="shrink-0 h-6 text-xs" onClick={() => { const lid = String(l.id); if (lid) window.location.href = `/dashboard/loans/${lid}` }}>Ver</Button>
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
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
                                  {advisorItems.map((advisor) => {
                                    const clientIds = new Set(advisor.clients.map((c: any) => String(c.id)))
                                    const advisorLoansData = (loans || []).filter((l: any) => { const cid = String((l?.client || {}).id || l.clientId || ''); return clientIds.has(cid) })
                                    const totalPortfolio = advisorLoansData.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0)
                                    const recoveredAmount = advisorLoansData.reduce((sum: number, l: any) => { const k = String(l.id); return sum + Number(paymentsAgg[k] || 0) }, 0)
                                    const installments = (l: any) => { const months = Number(l?.termMonths || 0); const freq = String(l?.paymentFrequency || ''); return freq === 'quincenal' ? months * 2 : months }
                                    const totalRepayable = advisorLoansData.reduce((s: number, l: any) => s + Number(l?.monthlyPayment || 0) * installments(l), 0)
                                    const outstandingBalance = Math.max(0, totalRepayable - recoveredAmount)
                                    const activeLoansCount = advisorLoansData.filter((l: any) => l.status === 'active').length
                                    const moraLoansCount = advisorLoansData.filter((l: any) => Boolean((l as any).hasOverdue)).length
                                    const moraAmount = advisorLoansData.filter((l: any) => Boolean((l as any).hasOverdue)).reduce((sum: number, l: any) => sum + Number((l as any).overdueDebt || 0), 0)
                                    const paidLoansCount = advisorLoansData.filter((l: any) => l.status === 'paid').length
                                    const portfolioHealth = [
                                      { name: 'Al día', value: activeLoansCount - moraLoansCount, color: '#22c55e' },
                                      { name: 'En mora', value: moraLoansCount, color: '#ef4444' },
                                      { name: 'Pagados', value: paidLoansCount, color: '#3b82f6' },
                                    ].filter(d => d.value > 0)
                                    const recoveryProgress = totalRepayable > 0 ? (recoveredAmount / totalRepayable) * 100 : 0
                                    const defaultCommission = { total: 0, onTime: 0, late1to30: 0, lateOver30: 0, paymentCount: 0, breakdown: [{ label: 'Puntual (40%)', amount: 0, pct: '0%', color: '#22c55e' }, { label: '1-30 días (20%)', amount: 0, pct: '0%', color: '#facc15' }, { label: '+30 días (5%)', amount: 0, pct: '0%', color: '#f97316' }] }
                                    // Try all possible keys: users.id, users.auth_id, clients.advisor_id value
                                    const advisorCommission = advisorCommissions[advisor.id]
                                      || advisorCommissions[advisor.authId]
                                      || advisorCommissions[advisor.advisorIdFromClients]
                                      || defaultCommission
                                    return (
                                      <AdvisorPerformanceCard
                                        key={advisor.id}
                                        advisor={advisor}
                                        stats={{ totalPortfolio, recoveredAmount, outstandingBalance, activeLoansCount, moraLoansCount, moraAmount, clientsCount: advisor.clients.length, portfolioHealth, recoveryProgress, commission: advisorCommission }}
                                        onViewDetails={() => setAdvisorClientsView({ id: advisor.id, name: advisor.name, email: advisor.email })}
                                      />
                                    )
                                  })}
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
                        for (const g of groupsData || []) { const name = g.group?.nombre || 'Grupo'; for (const item of g.loans || []) { if (item.loan_id) map[item.loan_id] = { groupName: name } } }
                        setLoanGroupMap(map)
                        setGroupsError(null)
                      }
                    } catch { }
                  }}>Reintentar</Button>
                </div>
              )}
              {groupsTabVisited && (
                <GroupLoansTable
                  items={(groupLoans || []).map((g: any) => {
                    const selector = (loan: any) => {
                      if (!advisorSelectedView || advisorSelectedView === 'all') return true
                      if (advisorSelectedView === 'active') return loan?.status === 'active'
                      if (advisorSelectedView === 'pending') return loan?.status === 'pending'
                      if (advisorSelectedView === 'paid') return loan?.status === 'paid'
                      if (advisorSelectedView === 'aldia') return !(loan as any)?.hasOverdue
                      if (advisorSelectedView === 'mora') return Boolean((loan as any)?.hasOverdue)
                      return true
                    }
                    const clientsItems = (g.loans || []).map((item: any) => {
                      const loan = loans.find((l: any) => String(l.id) === String(item.loan_id))
                      if (!loan) return { name: '', amount: 0 }
                      if (!selector(loan)) return { name: '', amount: 0 }
                      const name = loan?.client ? `${loan.client.firstName ?? loan.client.first_name} ${loan.client.lastName ?? loan.client.last_name}` : ''
                      const amount = loan?.amount ? Number(loan.amount) : 0
                      const progressPaid = loan ? Number((loan as any).progressPaid || 0) : 0
                      const progressTotal = loan ? Number((loan as any).progressTotal || 0) : 0
                      const hasOverdue = loan ? Boolean((loan as any).hasOverdue) : false
                      return { name, amount, progressPaid, progressTotal, hasOverdue }
                    }).filter((c: any) => c.name)
                    const groupHasSelected = (() => {
                      if (!advisorSelectedView || advisorSelectedView === 'all') return true
                      return (g.loans || []).some((item: any) => { const loan = loans.find((l: any) => String(l.id) === String(item.loan_id)); return loan && selector(loan) })
                    })()
                    return { groupName: g.group?.nombre ?? 'Grupo', totalAmount: Number(g.total_amount) || clientsItems.reduce((s: number, c: any) => s + (c.amount || 0), 0), clients: clientsItems, groupId: g.group_id, totalMembers: (g.loans || []).length, _include: groupHasSelected }
                  }).filter((it: any) => it._include)}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

      </>)}

      {/* ── CLIENTE DASHBOARD ──────────────────────────────────── */}
      {userData.role === 'cliente' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatsCard title="Total Préstamos" value={formatCurrency(totalLoanAmount)} description="Monto total" icon={QuetzalIcon} />
            <StatsCard title="Activos" value={activeLoans} description="En curso" icon={TrendingUp} />
          </div>
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
                  <div className="rounded-lg border bg-card/50 backdrop-blur-sm p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer" onClick={() => { if (loan?.id) window.location.href = `/dashboard/loans/${loan.id}` }}>
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
                          <div className="text-xs text-muted-foreground">cuotas</div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-sm text-muted-foreground">Monto</div>
                        <div className="text-xl font-semibold">{formatCurrency(loan.amount || 0)}</div>
                        <div className="text-sm text-muted-foreground">Toque para ver detalle</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card/50 backdrop-blur-sm p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer" onClick={() => {
                    const schedule: any[] = (activeLoanDetails[loan.id]?.schedule || [])
                    const next = schedule.find((s: any) => s.status !== 'paid')
                    if (loan?.id && next?.id) window.location.href = `/dashboard/loans/${loan.id}/payment?scheduleId=${next.id}`
                  }}>
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
        </div>
      )}

      <LoanCalculatorModal open={calcOpen} onOpenChange={setCalcOpen} />

      {/* Mora Modal */}
      <Dialog open={isMoraModalOpen} onOpenChange={setIsMoraModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-2xl">
          <DialogHeader className="p-6 pb-2 border-b border-border/50 bg-card/40 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Detalle de Cuotas en Mora
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
            {moraModalData && moraModalData.length > 0 ? (
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[120px]">Préstamo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-[100px] text-center">Cuota #</TableHead>
                      <TableHead className="w-[130px] text-center">Límite</TableHead>
                      <TableHead className="text-right">Capital</TableHead>
                      <TableHead className="w-[100px] text-center">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moraModalData.map((s: any, idx) => {
                      const d = new Date(s.due_date)
                      const fmt = Number.isNaN(d.getTime()) ? s.due_date : new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', year: 'numeric' }).format(d)
                      const isEven = idx % 2 === 0
                      return (
                        <TableRow key={idx} className={isEven ? 'bg-muted/10' : ''}>
                          <TableCell className="font-medium">#{s.loan_number}</TableCell>
                          <TableCell className="text-muted-foreground">{s.clientName}</TableCell>
                          <TableCell className="text-center font-medium">{s.payment_number}</TableCell>
                          <TableCell className="text-center text-rose-500 font-medium">{fmt}</TableCell>
                          <TableCell className="text-right tabular-nums text-foreground font-semibold">
                            {formatCurrency(Number(s.principal || 0))}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 hover:bg-primary/10 hover:text-primary" onClick={() => { if (s.loan_id) window.location.href = `/dashboard/loans/${s.loan_id}` }}>
                              Ver Préstamo
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-3 opacity-80" />
                No hay cuotas en mora
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cutoff Confirmation Modal */}
      <Dialog open={isCutoffModalOpen} onOpenChange={setIsCutoffModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ejecutar Corte de Comisiones</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro que deseas ejecutar el corte de comisiones de forma manual?
            </p>
            <p className="text-sm text-muted-foreground">
              Esto calculará las comisiones pendientes, las guardará en el historial y reiniciará el acumulado actual de todos los asesores a cero.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsCutoffModalOpen(false)} disabled={isCutoffLoading}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              const handleExecuteCutoff = async () => {
                setIsCutoffLoading(true)
                try {
                  const res = await fetch('/api/advisors/commissions/cutoff', { method: 'POST' })
                  if (!res.ok) throw new Error('Error al ejecutar el corte')
                  const data = await res.json()
                  alert(`Corte realizado con éxito.\nSe procesaron ${data.cutoffsCreated} cortes de asesores y se actualizaron ${data.schedulesUpdated} cuotas.`)
                  setIsCutoffModalOpen(false)
                  revalidateAll()
                } catch (error) {
                  console.error(error)
                  alert('Hubo un error al ejecutar el corte de comisiones. Inténtalo de nuevo.')
                } finally {
                  setIsCutoffLoading(false)
                }
              }
              handleExecuteCutoff()
            }} disabled={isCutoffLoading}>
              {isCutoffLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmar Corte
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
