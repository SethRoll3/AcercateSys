"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Loan } from "@/lib/types"
import { Calendar, DollarSign, Percent, Clock, Download } from "lucide-react"
import { useState } from "react"
import { ExportPlanModal } from "@/components/export-plan-modal"

interface LoanInfoCardProps {
  loan: Loan
  totalPaid: number
  remainingBalance: number
}

export function LoanInfoCard({ loan, totalPaid, remainingBalance }: LoanInfoCardProps) {
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

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progreso del Pago</span>
            <span className="text-foreground font-medium">{progressPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pagado: {formatCurrency(totalPaid)}</span>
            <span className="text-muted-foreground">Restante: {formatCurrency(remainingBalance)}</span>
          </div>
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
