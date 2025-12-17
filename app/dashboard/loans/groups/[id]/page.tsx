"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { LoanInfoCard } from "@/components/loan-info-card"
import { ExportPlanModal } from "@/components/export-plan-modal"
import { PaymentScheduleTable } from "@/components/payment-schedule-table"
import { PaymentHistoryTable } from "@/components/payment-history-table"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import type { PaymentSchedule, Payment } from "@/lib/types"
import { useRole } from "@/contexts/role-context"
import { cn } from "@/lib/utils"

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
  groupLoanDetails: 'groupLoanDetails:',
}

interface LoanDetailItem {
  loan: any
  schedule: PaymentSchedule[]
  payments: Payment[]
  totalPaid: number
  remainingBalance: number
}

export default function GroupLoanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { role } = useRole()
  const [groupName, setGroupName] = useState<string>("")
  const [items, setItems] = useState<LoanDetailItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false)
  const [regenerateTargetLoanId, setRegenerateTargetLoanId] = useState<string | null>(null)
  const [isRegeneratingLoanId, setIsRegeneratingLoanId] = useState<string | null>(null)

  useEffect(() => {
    const cacheKey = K.groupLoanDetails + params.id
    const cachedData = readCache(cacheKey)
    if (cachedData) {
      setGroupName(cachedData.groupName)
      setItems(cachedData.items)
      setIsLoading(false)
    }

    const fetchAll = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/auth/login")
          return
        }

        const lgRes = await fetch(`/api/loans-groups?groupId=${params.id}`)
        if (!lgRes.ok) {
          setIsLoading(false)
          return
        }
        const lgData = await lgRes.json()
        const groupRow = Array.isArray(lgData) ? lgData[0] : null
        if (!groupRow) {
          setIsLoading(false)
          return
        }
        const currentGroupName = groupRow.group?.nombre || "Grupo"
        setGroupName(currentGroupName)

        const loansList: { loan_id: string }[] = groupRow.loans || []
        const details = await Promise.all(
          loansList.map(async (l) => {
            try {
              const res = await fetch(`/api/loans/${l.loan_id}/details`, { credentials: 'include' })
              if (!res.ok) return null
              const data = await res.json()
              if (!data?.loan?.id) return null
              return {
                loan: data.loan,
                schedule: data.schedule || [],
                payments: data.payments || [],
                totalPaid: Number(data.totalPaid || 0),
                remainingBalance: Number(data.remainingBalance || 0),
              } as LoanDetailItem
            } catch {
              return null
            }
          })
        )
        const filteredDetails = (details || []).filter(Boolean) as LoanDetailItem[]
        setItems(filteredDetails)
        writeCache(cacheKey, { groupName: currentGroupName, items: filteredDetails })
      } catch {
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
    const onFocus = () => { fetchAll() }
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchAll() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    }, [params.id])

  const groupTotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.loan?.amount) || 0), 0)
  }, [items])

  const groupInstallments = useMemo(() => {
    if (!items.length) return []

    // Find max payment number
    let maxNum = 0
    items.forEach(item => {
      const max = Math.max(...item.schedule.map(s => s.payment_number || s.paymentNumber || 0))
      if (max > maxNum) maxNum = max
    })

    const installments = []
    for (let i = 1; i <= maxNum; i++) {
      let totalAmount = 0
      let totalPaid = 0
      let dueDate = ''
      const details = []
      let activeClientsCount = 0
      let paidClientsCount = 0

      for (const item of items) {
        const s = item.schedule.find(s => (s.payment_number || s.paymentNumber) === i)
        const clientName = (item.loan.client?.first_name || item.loan.client?.firstName || '') + ' ' + (item.loan.client?.last_name || item.loan.client?.lastName || '')
        
        if (s) {
          const amount = Number(s.amount || 0)
          let paid = Number(s.paidAmount || s.paid_amount || 0)
          const status = (s.status || 'pending').toLowerCase()
          
          // Si está pagado pero el monto pagado es 0 o menor al monto, asumimos pago completo
          // (Dependiendo de cómo el backend maneje paid_amount)
          if ((status === 'paid' || status === 'completado') && paid < amount) {
             paid = amount
          }

          totalAmount += amount
          totalPaid += paid
          const currentDueDate = s.due_date || s.dueDate
          if (currentDueDate) {
             // Usar la fecha más tardía
             if (!dueDate || new Date(currentDueDate) > new Date(dueDate)) {
                dueDate = currentDueDate
             }
          }
          
          activeClientsCount++
          if (paid >= amount - 0.01) paidClientsCount++ // Tolerance for floating point

          details.push({
             clientName,
             amount,
             paid,
             status,
             dueDate: currentDueDate,
             hasInstallment: true
          })
        } else {
           // Client has no installment #i
           details.push({
             clientName,
             amount: 0,
             paid: 0,
             status: 'N/A',
             dueDate: null,
             hasInstallment: false
          })
        }
      }
      
      const percentage = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0

      installments.push({
        number: i,
        totalAmount,
        totalPaid,
        dueDate,
        details,
        percentage: Math.min(percentage, 100),
        activeClientsCount,
        paidClientsCount
      })
    }
    return installments
  }, [items])

  const handlePaymentClick = (loanId: string, scheduleId: string) => {
    router.push(`/dashboard/loans/${loanId}/payment?scheduleId=${scheduleId}`)
  }

  const handleReviewClick = (loanId: string, scheduleId: string) => {
    router.push(`/dashboard/loans/${loanId}/review?scheduleId=${scheduleId}`)
  }

  const refreshOneLoanDetails = async (loanId: string) => {
    const cacheKey = K.groupLoanDetails + params.id
    try {
      const res = await fetch(`/api/loans/${loanId}/details`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setItems(prev => {
          const next = (prev || []).map(it => it.loan?.id === loanId ? {
            loan: data.loan,
            schedule: data.schedule || [],
            payments: data.payments || [],
            totalPaid: Number(data.totalPaid || 0),
            remainingBalance: Number(data.remainingBalance || 0),
          } : it)
          writeCache(String(cacheKey), { groupName, items: next })
          return next
        })
      } else {
        clearCache(String(cacheKey))
      }
    } catch {
      clearCache(String(cacheKey))
    }
  }

  const handlePaymentUpdate = () => {
    window.location.reload()
  }

  const confirmRegenerate = async () => {
    if (!regenerateTargetLoanId) return
    setIsRegeneratingLoanId(regenerateTargetLoanId)
    try {
      const response = await fetch(`/api/loans/${regenerateTargetLoanId}/regenerate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })
      if (response.ok) {
        await refreshOneLoanDetails(regenerateTargetLoanId)
      } else {
        console.error('Error regenerando plan de pagos')
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsRegeneratingLoanId(null)
      setConfirmRegenerateOpen(false)
      setRegenerateTargetLoanId(null)
    }
  }

  if (isLoading) return <LoadingSpinner />

  if (!items.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">No hay préstamos para este grupo</p>
          <Button onClick={() => router.push("/dashboard")} className="mt-4">Volver al Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center mb-6">
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")} className="mr-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="flex-1 flex items-center justify-between">
          <div>
          <h2 className="text-xl font-semibold text-foreground">Préstamo de Grupo: {groupName}</h2>
          <p className="text-sm text-muted-foreground">Total del grupo: {new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(groupTotal)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>Exportar Plan</Button>
        </div>
      </div>

      <Tabs defaultValue="group-installments" className="w-full">
        <TabsList className="flex flex-wrap gap-2 bg-muted/50 max-w-full">
          <TabsTrigger value="group-installments">Cuotas de Grupo</TabsTrigger>
          {items.filter(it => it?.loan?.id).map((it) => (
            <TabsTrigger key={it.loan.id} value={it.loan.id} className="whitespace-nowrap">
              {(it.loan.client?.first_name || it.loan.client?.firstName || '') + ' ' + (it.loan.client?.last_name || it.loan.client?.lastName || '')}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="group-installments" className="mt-6 space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {groupInstallments.map((inst) => (
               <Card key={inst.number} className="overflow-hidden border-muted/60 shadow-sm hover:shadow-md transition-shadow bg-card/50 backdrop-blur-sm">
                 <CardHeader className="bg-muted/20 pb-4">
                   <div className="flex justify-between items-center">
                     <CardTitle className="text-lg">Cuota #{inst.number}</CardTitle>
                     {inst.percentage >= 100 ? (
                       <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100">
                         Completada
                       </span>
                     ) : inst.percentage > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                         Parcial
                       </span>
                     ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                         Pendiente
                       </span>
                     )}
                   </div>
                   <div className="text-xs text-muted-foreground flex items-center mt-1">
                      <Clock className="h-3 w-3 mr-1" />
                      Fecha de vencimiento: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('es-GT', { timeZone: 'UTC' }) : 'N/A'}
                    </div>
                 </CardHeader>
                 <CardContent className="pt-6">
                   <div className="flex flex-col items-center mb-6">
                     <div className="relative h-32 w-32 mb-2">
                       {/* Simple CSS Donut Chart */}
                       <div 
                         className="absolute inset-0 rounded-full"
                         style={{
                           background: `conic-gradient(
                             hsl(var(--primary)) ${inst.percentage}%, 
                             hsl(var(--muted)) ${inst.percentage}% 100%
                           )`
                         }}
                       />
                       <div className="absolute inset-2 bg-card rounded-full flex flex-col items-center justify-center">
                         <span className="text-xs text-muted-foreground">Pagado</span>
                         <span className="text-sm font-bold">{Math.round(inst.percentage)}%</span>
                       </div>
                     </div>
                     <div className="text-center">
                        <div className="text-xl font-bold">
                          {new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(inst.totalAmount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                           Total de la cuota
                        </div>
                        <div className="mt-2 text-sm font-medium">
                           {inst.paidClientsCount} de {inst.activeClientsCount} clientes al día
                        </div>
                     </div>
                   </div>

                   <div className="space-y-3 border-t pt-4">
                     {inst.details.map((detail, idx) => (
                       detail.hasInstallment && (
                         <div key={idx} className="flex items-center justify-between text-sm">
                           <div className="flex flex-col flex-1 mr-2">
                             <span className="font-medium leading-tight">{detail.clientName}</span>
                             <div className="flex items-center gap-2 mt-1 flex-wrap">
                               <span className="text-xs text-muted-foreground">
                                 {detail.status === 'paid' ? 'Pagado' : detail.status === 'partial' ? 'Parcial' : 'Pendiente'}
                               </span>
                               {detail.dueDate && (
                                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground whitespace-nowrap">
                                    {new Date(detail.dueDate).toLocaleDateString('es-GT', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}
                                  </span>
                               )}
                             </div>
                           </div>
                           <div className="text-right whitespace-nowrap">
                             <div className={cn("font-medium", detail.paid >= detail.amount ? "text-green-600" : "")}>
                               {new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(detail.amount)}
                             </div>
                             {detail.paid > 0 && detail.paid < detail.amount && (
                               <div className="text-xs text-muted-foreground">
                                 Pagado: {new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(detail.paid)}
                               </div>
                             )}
                           </div>
                         </div>
                       )
                     ))}
                     {inst.details.some(d => !d.hasInstallment) && (
                       <div className="text-xs text-muted-foreground italic pt-2">
                         * Algunos clientes no tienen esta cuota.
                       </div>
                     )}
                   </div>
                 </CardContent>
               </Card>
             ))}
           </div>
        </TabsContent>

        {items.filter(it => it?.loan?.id).map((it) => (
          <TabsContent key={it.loan.id} value={it.loan.id} className="mt-6">
            <div className="space-y-6">
              <LoanInfoCard loan={it.loan} totalPaid={it.totalPaid} remainingBalance={it.remainingBalance} schedule={it.schedule} />

              <Tabs defaultValue="schedule" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50">
                  <TabsTrigger value="schedule">Plan de Pagos</TabsTrigger>
                  <TabsTrigger value="history">Historial de Pagos</TabsTrigger>
                </TabsList>

                <TabsContent value="schedule" className="mt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-semibold text-foreground">Plan de Pagos</h3>
                      {role === 'admin' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => { setRegenerateTargetLoanId(it.loan.id); setConfirmRegenerateOpen(true) }}
                        >
                          Regenerar Plan de Pagos
                        </Button>
                      )}
                    </div>
                    <PaymentScheduleTable
                      schedule={it.schedule}
                      loan={it.loan}
                      payments={it.payments}
                      onPaymentClick={(sid) => handlePaymentClick(it.loan.id, sid)}
                      onReviewClick={(sid) => handleReviewClick(it.loan.id, sid)}
                      onScheduleUpdate={() => refreshOneLoanDetails(it.loan.id)}
                      loading={isRegeneratingLoanId === it.loan.id}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-6">
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-foreground">Historial de Pagos</h3>
                    <PaymentHistoryTable
                      payments={it.payments}
                      onDownloadReceipt={(p) => window.open(`/api/reports/receipt/${p.id}`, '_blank')}
                      onPaymentUpdate={handlePaymentUpdate}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        ))}
      </Tabs>
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
            <Button variant="outline" onClick={() => setConfirmRegenerateOpen(false)} disabled={!!isRegeneratingLoanId}>Cancelar</Button>
            <Button onClick={confirmRegenerate} disabled={!!isRegeneratingLoanId}>{isRegeneratingLoanId ? 'Procesando…' : 'Regenerar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ExportPlanModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        groupId={String(params.id)}
        groupClients={items.map(it => ({ id: String(it.loan.client?.id), name: `${it.loan.client?.first_name ?? ''} ${it.loan.client?.last_name ?? ''}`.trim(), loanId: String(it.loan.id) }))}
      />
    </div>
  )
}
