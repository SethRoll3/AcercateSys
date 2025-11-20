"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/loading-spinner"
import { LoanInfoCard } from "@/components/loan-info-card"
import { ExportPlanModal } from "@/components/export-plan-modal"
import { PaymentScheduleTable } from "@/components/payment-schedule-table"
import { PaymentHistoryTable } from "@/components/payment-history-table"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft } from "lucide-react"
import type { PaymentSchedule, Payment } from "@/lib/types"
import { useRole } from "@/contexts/role-context"

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

  useEffect(() => {
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
        setGroupName(groupRow.group?.nombre || "Grupo")

        const loansList: { loan_id: string }[] = groupRow.loans || []
        const details = await Promise.all(
          loansList.map(async (l) => {
            const res = await fetch(`/api/loans/${l.loan_id}/details`, { credentials: 'include' })
            const data = await res.json()
            return {
              loan: data.loan,
              schedule: data.schedule,
              payments: data.payments,
              totalPaid: data.totalPaid,
              remainingBalance: data.remainingBalance,
            } as LoanDetailItem
          })
        )
        setItems(details)
      } catch {
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
  }, [params.id])

  const groupTotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.loan?.amount) || 0), 0)
  }, [items])

  const handlePaymentClick = (loanId: string, scheduleId: string) => {
    router.push(`/dashboard/loans/${loanId}/payment?scheduleId=${scheduleId}`)
  }

  const handleReviewClick = (loanId: string, scheduleId: string) => {
    router.push(`/dashboard/loans/${loanId}/review?scheduleId=${scheduleId}`)
  }

  const handleScheduleUpdate = () => {
    window.location.reload()
  }

  const handlePaymentUpdate = () => {
    window.location.reload()
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

      <Tabs defaultValue={items[0]?.loan?.id} className="w-full">
        <TabsList className="flex flex-wrap gap-2 bg-muted/50 max-w-full">
          {items.map((it) => (
            <TabsTrigger key={it.loan.id} value={it.loan.id} className="whitespace-nowrap">
              {(it.loan.client?.first_name || it.loan.client?.firstName || '') + ' ' + (it.loan.client?.last_name || it.loan.client?.lastName || '')}
            </TabsTrigger>
          ))}
        </TabsList>

        {items.map((it) => (
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
                    </div>
                    <PaymentScheduleTable
                      schedule={it.schedule}
                      loan={it.loan}
                      payments={it.payments}
                      onPaymentClick={(sid) => handlePaymentClick(it.loan.id, sid)}
                      onReviewClick={(sid) => handleReviewClick(it.loan.id, sid)}
                      onScheduleUpdate={handleScheduleUpdate}
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
      <ExportPlanModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        groupId={String(params.id)}
        groupClients={items.map(it => ({ id: String(it.loan.client?.id), name: `${it.loan.client?.first_name ?? ''} ${it.loan.client?.last_name ?? ''}`.trim(), loanId: String(it.loan.id) }))}
      />
    </div>
  )
}

