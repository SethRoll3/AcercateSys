"use client"

import { useEffect, useState, useRef } from "react"
import { useRole } from "@/contexts/role-context"
import { useParams, useRouter } from "next/navigation"
import { LoanInfoCard } from "@/components/loan-info-card"
import { PaymentScheduleTable } from "@/components/payment-schedule-table"
import { PaymentHistoryTable } from "@/components/payment-history-table"
import { LoadingSpinner } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Loan, User, PaymentSchedule, Payment } from "@/lib/types"
import { ArrowLeft, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function LoanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loan, setLoan] = useState<(Loan) | null>(null)
  const [schedule, setSchedule] = useState<PaymentSchedule[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [totalPaid, setTotalPaid] = useState(0)
  const [remainingBalance, setRemainingBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
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
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.push('/auth/login')
      }
    })
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    setErrorMsg(null)
    const hardTimeout = setTimeout(() => {
      if (!abortRef.current?.signal?.aborted) {
        setErrorMsg('No se pudieron cargar los detalles del préstamo. Intenta nuevamente.')
        setIsLoading(false)
        inFlightRef.current = false
      }
    }, 15000)
    const run = async () => {
      try {
        const user = await getUserWithRetry()
        if (abortRef.current?.signal?.aborted) return

        if (!user) {
          router.push('/auth/login')
          return
        }
        setUserEmail(user.email || "")

        const detailsRes = await fetchWithTimeout(`/api/loans/${params.id}/details`, { credentials: 'include' as any })
        if (abortRef.current?.signal?.aborted) return

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
          setIsLoading(false)
          setErrorMsg(null)
        } else {
          const reason: any = (detailsRes as any).reason
          if (reason && (reason.name === 'AbortError' || reason.message === 'The operation was aborted.')) {
            return
          }
          console.error("[loan-detail] Error fetching loan details:", detailsRes.statusText)
          setErrorMsg('Ocurrió un error cargando el préstamo. Intenta nuevamente.')
          setIsLoading(false)
        }
      } catch (error) {
        if (abortRef.current?.signal?.aborted) return
        console.error("[loan-detail] fetch error:", error)
        setErrorMsg('Ocurrió un error cargando el préstamo. Intenta nuevamente.')
        setIsLoading(false)
      } finally {
        inFlightRef.current = false
        clearTimeout(hardTimeout)
      }
    }
    run()
    return () => {
      abortRef.current?.abort()
      inFlightRef.current = false
      //sub?.unsubscribe()
    }
  }, [params.id])

  const handlePaymentClick = (scheduleId: string) => {
    router.push(`/dashboard/loans/${params.id}/payment?scheduleId=${scheduleId}`)
  }

  const handleReviewClick = (scheduleId: string) => {
    router.push(`/dashboard/loans/${params.id}/review?scheduleId=${scheduleId}`)
  }

  const handleDownloadReceipt = (payment: Payment) => {
    window.open(`/api/reports/receipt/${payment.id}`, "_blank")
  }

  const handleScheduleUpdate = () => {
    // Recargar los datos del préstamo
    window.location.reload()
  }

  const handlePaymentUpdate = () => {
    // Recargar los datos del préstamo para reflejar cambios en el estado de confirmación
    window.location.reload()
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
        <LoanInfoCard loan={loan} totalPaid={totalPaid} remainingBalance={remainingBalance} />

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50">
            <TabsTrigger value="schedule">Plan de Pagos</TabsTrigger>
            <TabsTrigger value="history">Historial de Pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-foreground">Plan de Pagos</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/loans/${params.id}/regenerate-schedule`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        credentials: 'include'
                      });
                      if (response.ok) {
                        // Recargar los datos
                        window.location.reload();
                      } else {
                        console.error("Error regenerando plan de pagos");
                      }
                    } catch (error) {
                      console.error("Error:", error);
                    }
                  }}
                >
                  Regenerar Plan de Pagos
                </Button>
              </div>
              <PaymentScheduleTable 
                schedule={schedule} 
                loan={loan}
                payments={payments}
                onPaymentClick={handlePaymentClick}
                onReviewClick={handleReviewClick}
                onScheduleUpdate={handleScheduleUpdate}
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
    </div>
  )
}
