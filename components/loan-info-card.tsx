"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Loan, PaymentSchedule } from "@/lib/types"
import { Calendar, DollarSign, Percent, Clock, Download } from "lucide-react"
import { useState } from "react"
import { ExportPlanModal } from "@/components/export-plan-modal"

interface LoanInfoCardProps {
  loan: Loan
  totalPaid: number
  remainingBalance: number
  schedule: PaymentSchedule[]
}

export function LoanInfoCard({ loan, totalPaid, remainingBalance, schedule }: LoanInfoCardProps) {
  const [isExportOpen, setIsExportOpen] = useState(false)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-GT", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Guatemala",
    })
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      paid: "secondary",
      defaulted: "destructive",
      pending: "outline",
    }

    const labels: Record<string, string> = {
      active: "Activo",
      paid: "Pagado",
      defaulted: "Mora",
      pending: "Pendiente",
    }

    return <Badge variant={variants[status] || "default"}>{labels[status] || status}</Badge>
  }

  const totalQuotas = schedule.length
  const paidQuotas = schedule.filter((s) => s.status === "paid").length
  const remainingQuotas = totalQuotas - paidQuotas

  const getPaymentStatusBadge = () => {
    const progressRatio = paidQuotas / totalQuotas
    let variant: "default" | "secondary" | "destructive" | "outline" = "outline"
    let label = "Iniciando"
    let className = "bg-red-100 text-red-800" // Soft red

    if (progressRatio > 0.75) {
      variant = "default"
      label = "Casi Finalizado"
      className = "bg-green-100 text-green-800" // Green
    } else if (progressRatio > 0.25) {
      variant = "secondary"
      label = "A Medio Camino"
      className = "bg-yellow-100 text-yellow-800" // Yellow
    }

    return <Badge variant={variant} className={className}>{label}</Badge>
  }

  const progressPercentage = (totalPaid / loan.amount) * 100

  const handleDownloadSchedule = () => {
    setIsExportOpen(true)
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl text-foreground">Préstamo {loan.loanNumber}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Cliente: {loan.client ? `${loan.client.first_name} ${loan.client.last_name}` : "No disponible"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(loan.status)}
            <Button variant="outline" size="sm" onClick={handleDownloadSchedule} className="gap-2 bg-transparent">
              <Download className="h-4 w-4" />
              Exportar Plan
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="h-4 w-4" />
              <span>Monto Total</span>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(loan.amount)}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Percent className="h-4 w-4" />
              <span>Tasa de Interés</span>
            </div>
            <p className="text-xl font-bold text-foreground">{loan.interestRate}%</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" />
              <span>Plazo</span>
            </div>
            <p className="text-xl font-bold text-foreground">{loan.termMonths} meses</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="h-4 w-4" />
              <span>Cuota Mensual</span>
            </div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(loan.monthlyPayment)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Cuotas Pagadas</span>
              <span className="text-foreground font-medium">{paidQuotas} de {totalQuotas}</span>
            </div>
            <p className="text-muted-foreground text-xs">Pagado:</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Cuotas Restantes</span>
              <span className="text-foreground font-medium">{remainingQuotas} de {totalQuotas}</span>
            </div>
            <p className="text-muted-foreground text-xs">Restante por pagar:</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(remainingBalance)}</p>
          </div>
        </div>
        <div className="flex justify-center pt-4">
          {getPaymentStatusBadge()}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
          <div>
            <p className="text-sm text-muted-foreground">Fecha de Inicio</p>
            <p className="text-foreground font-medium">{formatDate(loan.startDate)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Fecha de Finalización</p>
            <p className="text-foreground font-medium">{formatDate(loan.endDate)}</p>
          </div>
        </div>
      </CardContent>
      <ExportPlanModal open={isExportOpen} onOpenChange={setIsExportOpen} loanId={String(loan.id)} />
    </Card>
  )
}
