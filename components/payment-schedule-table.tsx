"use client"

import * as React from "react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PaymentSchedule, Loan, Payment } from "@/lib/types"
import { formatYMDGT } from "@/lib/utils"
import { CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { useRole } from "@/contexts/role-context"
import { LoadingSpinner } from "@/components/loading-spinner"

interface PaymentScheduleTableProps {
  schedule: PaymentSchedule[]
  onPaymentClick?: (scheduleId: string) => void
  onReviewClick?: (scheduleId: string) => void
  loan?: Loan
  payments?: Payment[]
  onScheduleUpdate?: () => void
  loading?: boolean
}

export function PaymentScheduleTable({ schedule, onPaymentClick, onReviewClick, loan, payments = [], onScheduleUpdate, loading = false }: PaymentScheduleTableProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [moraValue, setMoraValue] = React.useState<number>(0)
  const [adminFeesValue, setAdminFeesValue] = React.useState<number>(20)
  const [saving, setSaving] = React.useState(false)
  const { role } = useRole()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return formatYMDGT(date, { year: "numeric", month: "short", day: "numeric" })
  }

  const getStatusBadge = (status: string) => {
    // Mostrar únicamente estados válidos del flujo de pagos
    switch (status) {
      case "pending_confirmation":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pendiente de confirmación
          </Badge>
        )
      case "paid":
        return (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Pagado
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Rechazado
          </Badge>
        )
      case "partially_paid":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Pagado parcial
          </Badge>
        )
      case "pending":
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Pendiente
          </Badge>
        )
    }
  }

  const openEdit = (item: PaymentSchedule) => {
    // Solo administradores y asesores pueden editar mora y gastos
    if (role !== 'admin' && role !== 'asesor') return
    setEditingId(item.id)
    setMoraValue(Number(item.mora || 0))
    setAdminFeesValue(Number(item.admin_fees ?? 20))
  }

  const closeEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      setSaving(true)
      const res = await fetch(`/api/payment-schedule/${editingId}/fees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mora: moraValue, adminFees: adminFeesValue }),
      })
      if (res.ok) {
        closeEdit()
        onScheduleUpdate && onScheduleUpdate()
      } else {
        console.error("Error al actualizar mora/gastos", await res.text())
      }
    } catch (e) {
      console.error("Error en petición de actualización", e)
    } finally {
      setSaving(false)
    }
  }

  const computeRemainingBalance = (index: number) => {
    if (!loan) return null
    const principalPaidBefore = schedule
      .slice(0, index)
      .reduce((sum, s) => sum + Number(s.principal || 0), 0)
    const remaining = Number(loan.amount) - principalPaidBefore
    return remaining < 0 ? 0 : remaining
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const {
    totalBase,
    saldoPorPagarPrefix,
  } = React.useMemo(() => {
    const baseAmounts = schedule.map((s) => Number(s.principal || 0) + Number(s.interest || 0) + Number(s.admin_fees ?? 20))
    const totalBaseLocal = round2(baseAmounts.reduce((a, b) => a + b, 0))
    const prefix: number[] = []
    let acc = 0
    for (let i = 0; i < schedule.length; i++) {
      acc += baseAmounts[i]
      prefix[i] = round2(Math.max(0, totalBaseLocal - acc))
    }
    return { totalBase: totalBaseLocal, saldoPorPagarPrefix: prefix }
  }, [schedule])

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden relative">
      {loan && loan.status !== 'active' && loan.status !== 'paid' && (
        <div className="px-4 pt-4 text-sm text-destructive">
          Este préstamo no está activo. No se permiten pagos.
        </div>
      )}
      <div className="px-4 pt-4 text-sm text-muted-foreground">Total del préstamo (sin mora): {formatCurrency(totalBase)}</div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-muted-foreground">Cuota #</TableHead>
            <TableHead className="text-muted-foreground">Fecha de Vencimiento</TableHead>
            <TableHead className="text-muted-foreground">Monto a Pagar</TableHead>
            <TableHead className="text-muted-foreground">Capital</TableHead>
            <TableHead className="text-muted-foreground">Interés</TableHead>
            <TableHead className="text-muted-foreground">Mora</TableHead>
            <TableHead className="text-muted-foreground">Gastos Adm.</TableHead>
            <TableHead className="text-muted-foreground">Saldo por Pagar</TableHead>
            <TableHead className="text-muted-foreground">Estado</TableHead>
            {(onPaymentClick || onReviewClick) && <TableHead className="text-muted-foreground">Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedule.map((item, idx) => {
            const adminFees = Number(item.admin_fees ?? 20)
            const mora = Number(item.mora || 0)
            const totalDue = Number(item.principal || 0) + Number(item.interest || 0) + adminFees + mora
            const saldoPorPagar = saldoPorPagarPrefix[idx]
            // Encontrar el último pago para esta cuota (por fecha de creación)
            const latestPaymentForSchedule = payments
              .filter((p) => p.scheduleId === item.id)
              .reduce<Payment | null>((acc, p) => {
                if (!acc) return p
                return new Date(p.createdAt) > new Date(acc.createdAt) ? p : acc
              }, null)
            return (
              <TableRow key={item.id} className="border-border/50">
                <TableCell className="font-medium text-foreground">{item.payment_number}</TableCell>
                <TableCell className="text-foreground">{formatDate(item.due_date)}</TableCell>
                <TableCell className="text-foreground font-medium">{formatCurrency(totalDue)}</TableCell>
                <TableCell className="text-muted-foreground">{formatCurrency(item.principal)}</TableCell>
                <TableCell className="text-muted-foreground">{formatCurrency(item.interest)}</TableCell>
                <TableCell className="text-muted-foreground">{formatCurrency(mora)}</TableCell>
                <TableCell className="text-muted-foreground">{formatCurrency(adminFees)}</TableCell>
                <TableCell className="text-muted-foreground">{formatCurrency(saldoPorPagar)}</TableCell>
                <TableCell>{getStatusBadge(item.status)}</TableCell>
                {(onPaymentClick || onReviewClick) && (
                  <TableCell className="space-x-2">
                    {onPaymentClick && item.status === "pending" && (
                      <>
                        
                      </>
                    )}
                    {(role === 'admin' || role === 'asesor') && item.status !== 'paid' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(item)}
                      >
                        Editar
                      </Button>
                    )}
                    {onReviewClick && item.status === "pending_confirmation" && (role === 'admin' || role === 'asesor') && (
                      latestPaymentForSchedule && latestPaymentForSchedule.confirmationStatus === 'pending_confirmation' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReviewClick(item.id)}
                          className="bg-transparent"
                        >
                          Revisar Pago
                        </Button>
                      ) : null
                    )}
                    {onPaymentClick && role === 'cliente' && item.status === 'pending_confirmation' && (
                      latestPaymentForSchedule && latestPaymentForSchedule.confirmationStatus === 'pending_confirmation' && !latestPaymentForSchedule.hasBeenEdited ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPaymentClick(item.id)}
                          className="bg-transparent"
                        >
                          Editar Pago
                        </Button>
                      ) : null
                    )}
                    {onPaymentClick && role === 'cliente' && item.status === 'rejected' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPaymentClick(item.id)}
                        className="bg-transparent"
                      >
                        Editar Pago
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <LoadingSpinner />
            <div className="text-sm text-muted-foreground">Regenerando plan de pagos…</div>
          </div>
        </div>
      )}

      <Dialog open={!!editingId} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar mora y gastos administrativos</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mora" className="text-right">Mora</Label>
              <Input
                id="mora"
                type="number"
                step="0.01"
                value={moraValue}
                onChange={(e) => setMoraValue(Number(e.target.value))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminFees" className="text-right">Gastos Adm.</Label>
              <Input
                id="adminFees"
                type="number"
                step="0.01"
                value={adminFeesValue}
                onChange={(e) => setAdminFeesValue(Number(e.target.value))}
                className="col-span-3"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {(() => {
                const s = schedule.find(s => s.id === editingId)
                const principal = Number(s?.principal || 0)
                const interest = Number(s?.interest || 0)
                const total = principal + interest + (adminFeesValue || 0) + (moraValue || 0)
                return <>Monto actualizado: {formatCurrency(total)}</>
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
