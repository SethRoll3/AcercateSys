"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { PaymentForm } from "@/components/payment-form"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/loading-spinner";
import type { PaymentSchedule, Payment, Boleta } from "@/lib/types"
import { ArrowLeft} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function PaymentPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const scheduleId = searchParams.get("scheduleId")

  const [scheduleItem, setScheduleItem] = useState<PaymentSchedule | null>(null)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [editingBoletas, setEditingBoletas] = useState<Boleta[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userEmail, setUserEmail] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [loanStatus, setLoanStatus] = useState<string | null>(null)
  const [loanNumber, setLoanNumber] = useState<string>("")
  const [clientName, setClientName] = useState<string>("")

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

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
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
    const fetchData = async () => {
      setIsLoading(true)
      setErrorMsg(null)
      const hardTimeout = setTimeout(() => {
        setIsLoading(false)
        setErrorMsg('Tiempo de espera excedido al cargar la información de pago')
        console.warn('[payment] Hard timeout reached while loading data')
      }, 5000)
      try {
        const user = await getUserWithRetry()
        if (!user) {
          router.push('/auth/login')
          return
        }
        setUserEmail(user.email || "")

        const response = await fetchWithTimeout(`/api/loans/${params.id}/details`, { credentials: 'include' as any })
        if (response.status === 401) {
          router.push('/auth/login')
          return
        }
        if (response.ok) {
          const data = await response.json()
          const item = data.schedule.find((s: PaymentSchedule) => s.id === scheduleId)
          setScheduleItem(item || null)
          setLoanStatus(data.loan?.status || null)
          setLoanNumber(data.loan?.loanNumber || data.loan?.loan_number || "")
          const c = data.loan?.client
          const name = ((c?.first_name || c?.firstName || "") + " " + (c?.last_name || c?.lastName || "")).trim()
          setClientName(name)

          const payments: Payment[] = (data.payments || [])
          const current = payments.find(
            (p: Payment) => p.scheduleId === scheduleId && (p.confirmationStatus === 'pending_confirmation' || p.confirmationStatus === 'rechazado')
          )
          if (current) {
            setEditingPayment(current)
            setEditingBoletas((current.boletas || []) as Boleta[])
          } else {
            setEditingPayment(null)
            setEditingBoletas([])
          }
        } else {
          const reason: any = (response as any).reason
          if (reason && (reason.name === 'AbortError' || reason.message === 'The operation was aborted.')) {
            return
          }
          console.error('[payment] Error fetching loan details:', response.statusText)
          setErrorMsg('Ocurrió un error cargando la información de pago. Intenta nuevamente.')
        }
      } catch (error) {
        console.error('[payment] fetch error:', error)
        setErrorMsg('Ocurrió un error cargando la información de pago. Intenta nuevamente.')
      } finally {
        setIsLoading(false)
        clearTimeout(hardTimeout)
      }
    }

    if (scheduleId) {
      fetchData()
    } else {
      setIsLoading(false)
    }
    return () => {
      abortRef.current?.abort()
    }
  }, [params.id, scheduleId])

  const handlePaymentSuccess = () => {
    router.push(`/dashboard/loans/${params.id}`)
  }

  const handleCancel = () => {
    router.push(`/dashboard/loans/${params.id}`)
  }

  const handleLogout = async () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {}
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" onClick={() => {
            setErrorMsg(null)
            setIsLoading(true)
            window.location.reload()
          }}>Reintentar</Button>
        </div>
      </div>
    )
  }

  if (!scheduleItem) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Información de pago no encontrada</p>
          <Button onClick={() => router.push(`/dashboard/loans/${params.id}`)}>Volver al Préstamo</Button>
        </div>
      </div>
    )
  }

  if (loanStatus && loanStatus !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Este préstamo está en estado {loanStatus}. No se pueden registrar pagos hasta que esté activo.</p>
          <Button onClick={() => router.push(`/dashboard/loans/${params.id}`)}>Volver al Préstamo</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">

      <main className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router.push(`/dashboard/loans/${params.id}`)} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver al Préstamo
        </Button>

        <div className="max-w-2xl mx-auto">
          <div className="rounded-md border bg-muted/30 p-4 mb-4">
            <div className="text-sm text-muted-foreground">Registrando pago</div>
            <div className="text-foreground font-semibold">
              {clientName ? `${clientName} — ` : ""}Préstamo {loanNumber || String(params.id)} • Cuota #{scheduleItem?.payment_number}
            </div>
          </div>
          <PaymentForm
            loanId={params.id as string}
            scheduleItem={scheduleItem}
            initialPayment={editingPayment || undefined}
            initialBoletas={editingBoletas}
            onPaymentSuccess={handlePaymentSuccess}
            onCancel={handleCancel}
          />
        </div>
      </main>
    </div>
  )
}
