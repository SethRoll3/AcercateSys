"use client"

import { useEffect, useState, useRef } from "react"
import { useRole } from "@/contexts/role-context"
import { useParams, useRouter } from "next/navigation"
import { LoanInfoCard } from "@/components/loan-info-card"
import { PaymentScheduleTable } from "@/components/payment-schedule-table"
import { PaymentHistoryTable } from "@/components/payment-history-table"
import { LoadingSpinner } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Loan, User, PaymentSchedule, Payment } from "@/lib/types"
import { ArrowLeft, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

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
const clearCache = (key: string) => {
  try { sessionStorage.removeItem(key) } catch {}
}

const K = {
  loanDetails: 'loanDetails:',
}

export default function LoanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loan, setLoan] = useState<(Loan) | null>(null)
  const [schedule, setSchedule] = useState<PaymentSchedule[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [totalPaid, setTotalPaid] = useState(0)
  const [remainingBalance, setRemainingBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { role } = useRole()

  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const fetchWithTimeout = async (input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) => {
    const { timeoutMs = 12000, ...rest } = init
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(input, { ...rest, signal: controller.signal })
      return res
    } finally {
      clearTimeout(timeout)
    }
  }

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const getUserWithRetry = async () => {
    const supabase = createClient()
    for (const ms of [300, 600, 1200]) {
      const res = await supabase.auth.getUser()
      const u = res?.data?.user
      if (u) return u
      await delay(ms)
    }
    try {
      const fallback = await fetchWithTimeout('/api/auth/user', { timeoutMs: 8000, credentials: 'include' as any })
      if (fallback.ok) {
        const data = await fallback.json()
        return { id: data.id, email: data.email }
      }
    } catch {}
    return null
  }

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        router.push('/auth/login')
      }
    })
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    setErrorMsg(null)

    const cacheKey = K.loanDetails + params.id
    const cachedData = readCache(cacheKey)
    if (cachedData) {
      setLoan(cachedData.loan)
      setSchedule(cachedData.schedule)
      setPayments(cachedData.payments)
      setTotalPaid(cachedData.totalPaid)
      setRemainingBalance(cachedData.remainingBalance)
      setIsLoading(false)
      inFlightRef.current = false
    }

    const hardTimeout = setTimeout(() => {
      setErrorMsg('No se pudieron cargar los detalles del préstamo. Intenta nuevamente.')
      setIsLoading(false)
      inFlightRef.current = false
    }, 15000)
    const run = async () => {
      try {
        const user = await getUserWithRetry()

        if (!user) {
          router.push('/auth/login')
          return
        }
        setUserEmail(user.email || "")

        const detailsRes = await fetchWithTimeout(`/api/loans/${params.id}/details`, { credentials: 'include' as any })

        if (detailsRes.status === 401) {
          router.push('/auth/login')
          return
        }
        if (detailsRes.ok) {
          const data = await detailsRes.json()
          setLoan(data.loan)
          setSchedule(data.schedule)
          setPayments(data.payments)
          setTotalPaid(data.totalPaid)
          setRemainingBalance(data.remainingBalance)
          writeCache(cacheKey, data)
          setIsLoading(false)
          setErrorMsg(null)
        } else {
          console.error("[loan-detail] Error fetching loan details:", detailsRes.statusText)
          setErrorMsg('Ocurrió un error cargando el préstamo. Intenta nuevamente.')
          setIsLoading(false)
        }
      } catch (error) {
        console.error("[loan-detail] fetch error:", error)
        setErrorMsg('Ocurrió un error cargando el préstamo. Intenta nuevamente.')
        setIsLoading(false)
      } finally {
        inFlightRef.current = false
        clearTimeout(hardTimeout)
      }
    }
    run()
    const revalidate = async () => {
      try {
        const res = await fetchWithTimeout(`/api/loans/${params.id}/details`, { credentials: 'include' as any, timeoutMs: 8000 })
        if (res.ok) {
          const data = await res.json()
          setLoan(data.loan)
          setSchedule(data.schedule)
          setPayments(data.payments)
          setTotalPaid(data.totalPaid)
          setRemainingBalance(data.remainingBalance)
          writeCache(K.loanDetails + params.id, data)
        }
      } catch {}
    }
    const onFocus = () => { revalidate() }
    const onVisibility = () => { if (document.visibilityState === 'visible') revalidate() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      abortRef.current?.abort()
      inFlightRef.current = false
      subscription?.unsubscribe()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [params.id])

  const handlePaymentClick = (scheduleId: string) => {
    router.push(`/dashboard/loans/${params.id}/payment?scheduleId=${scheduleId}`)
  }

  const handleRegisterNextPayment = () => {
    const next = (schedule || []).find((s: any) => s.status !== 'paid')
    if (loan?.status !== 'active') return
    if (next?.id) {
      router.push(`/dashboard/loans/${params.id}/payment?scheduleId=${next.id}`)
    }
  }

  const handleFullPaymentClick = () => {
    const remaining = (schedule || []).filter((s: any) => s.status !== 'paid')
    const next = remaining[0]
    if (loan?.status !== 'active') return
    if (!next?.id) return
    const allRemainingPending = remaining.length > 0 && remaining.every((s: any) => String(s.status) === 'pending_confirmation')
    if (String(next.status) === 'pending_confirmation' || allRemainingPending) return
    router.push(`/dashboard/loans/${params.id}/payment?scheduleId=${next.id}&full=true`)
  }

  const handleReviewClick = (scheduleId: string) => {
    router.push(`/dashboard/loans/${params.id}/review?scheduleId=${scheduleId}`)
  }

  const handleDownloadReceipt = (payment: Payment) => {
    window.open(`/api/reports/receipt/${payment.id}`, "_blank")
  }

  const handleScheduleUpdate = async () => {
    const cacheKey = K.loanDetails + params.id
    try {
      const detailsRes = await fetchWithTimeout(`/api/loans/${params.id}/details`, { credentials: 'include' as any })
      if (detailsRes.ok) {
        const data = await detailsRes.json()
        setLoan(data.loan)
        setSchedule(data.schedule)
        setPayments(data.payments)
        setTotalPaid(data.totalPaid)
        setRemainingBalance(data.remainingBalance)
        writeCache(String(cacheKey), data)
      } else {
        clearCache(String(cacheKey))
      }
    } catch {
      clearCache(String(cacheKey))
    }
  }

  const handlePaymentUpdate = () => {
    // Recargar los datos del préstamo para reflejar cambios en el estado de confirmación
    window.location.reload()
  }

  const confirmRegenerate = async () => {
    setIsRegenerating(true)
    try {
      const response = await fetch(`/api/loans/${params.id}/regenerate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })
      if (response.ok) {
        await handleScheduleUpdate()
      } else {
        console.error('Error regenerando plan de pagos')
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsRegenerating(false)
      setConfirmRegenerateOpen(false)
    }
  }


  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (errorMsg) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" onClick={() => {
            inFlightRef.current = false
            setErrorMsg(null)
            setIsLoading(true)
            window.location.reload()
          }}>Reintentar</Button>
        </div>
      </div>
    )
  }
  if (!loan) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Préstamo no encontrado</p>
          <Button onClick={() => router.push("/dashboard")} className="mt-4">
            Volver al Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.push("/dashboard")} 
          className="mr-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
      </div>

      <div className="space-y-6">
        <LoanInfoCard loan={loan} totalPaid={totalPaid} remainingBalance={remainingBalance} schedule={schedule} />

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50">
            <TabsTrigger value="schedule">Plan de Pagos</TabsTrigger>
            <TabsTrigger value="history">Historial de Pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-foreground">Plan de Pagos</h3>
                <div className="flex items-center gap-2">
                  {loan?.status === 'active' && (schedule || []).some((s: any) => s.status !== 'paid') && (() => {
                    const remaining = (schedule || []).filter((s: any) => s.status !== 'paid')
                    const nextSchedule = remaining[0]
                    const allRemainingPending = remaining.length > 0 && remaining.every((s: any) => String(s.status) === 'pending_confirmation')
                    const hideFull = !nextSchedule || String(nextSchedule.status) === 'pending_confirmation' || allRemainingPending
                    if (hideFull) return null
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFullPaymentClick}
                        className="bg-transparent mr-2"
                      >
                        Pagar por completo
                      </Button>
                    )
                  })()}
                  {loan?.status === 'active' && (schedule || []).some((s: any) => s.status !== 'paid') && (() => {
                    const nextSchedule = (schedule || []).find((s: any) => s.status !== 'paid')
                    const nextHasPending = !!(nextSchedule && (payments || []).some((p: any) => p.scheduleId === nextSchedule.id && String((p as any).confirmationStatus || (p as any).confirmation_status || '') === 'pending_confirmation'))
                    const nextButtonLabel = nextHasPending ? 'Editar Pago' : 'Registrar Pago'
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegisterNextPayment}
                        className="bg-transparent"
                      >
                        {nextButtonLabel}
                      </Button>
                    )
                  })()}
                  {(role === 'admin' || role === 'asesor') && loan?.status === 'pending' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRegenerateOpen(true)}
                    >
                      Regenerar Plan de Pagos
                    </Button>
                  )}
                </div>
              </div>
              <PaymentScheduleTable 
                schedule={schedule} 
                loan={loan}
                payments={payments}
                onPaymentClick={handlePaymentClick}
                onReviewClick={handleReviewClick}
                onScheduleUpdate={handleScheduleUpdate}
                loading={isRegenerating}
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-foreground">Historial de Pagos</h3>
              <PaymentHistoryTable 
                payments={payments} 
                onDownloadReceipt={handleDownloadReceipt}
                onPaymentUpdate={handlePaymentUpdate}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={confirmRegenerateOpen} onOpenChange={setConfirmRegenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerar Plan de Pagos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Al regenerar el plan de pagos, se eliminarán todos los pagos registrados para este préstamo.</p>
            <p>El préstamo volverá a estar como el día 1. ¿Deseas continuar?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRegenerateOpen(false)} disabled={isRegenerating}>Cancelar</Button>
            <Button onClick={confirmRegenerate} disabled={isRegenerating}>{isRegenerating ? 'Procesando…' : 'Regenerar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
