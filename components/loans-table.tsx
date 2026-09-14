"use client"

import { useState } from "react"
import type { Loan } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Eye, Trash2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { EditLoanDialog } from "./edit-loan-dialog"
import { ActivateLoanDialog } from "./activate-loan-dialog"

interface LoansTableProps {
  loans: (Loan & { client?: { first_name: string; last_name: string } | null })[]
  userRole: string
  onLoanUpdated?: () => void
  groupMap?: Record<string, { groupName: string }>
}

export function LoansTable({ loans, userRole, onLoanUpdated, groupMap }: LoansTableProps) {
  const router = useRouter()
  const isAdmin = userRole === "admin"
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [loanToCancel, setLoanToCancel] = useState<Loan | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      active: "default",
      paid: "secondary",
      pending: "outline",
      cancelled: "destructive",
    }
    const labels: Record<string, string> = {
      active: "Activo",
      paid: "Pagado",
      pending: "Pendiente",
      cancelled: "Cancelado",
    }
    return <Badge variant={variants[status] || "default"}>{labels[status] || status}</Badge>
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  const handleCancelClick = (loan: Loan) => {
    setLoanToCancel(loan)
    setCancelReason("")
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!loanToCancel) return

    setIsCancelling(true)
    try {
      const res = await fetch("/api/loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          loanId: loanToCancel.id,
          action: "cancel",
          reason: cancelReason.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Error al cancelar préstamo")
        return
      }

      toast.success(`Préstamo ${loanToCancel.loanNumber} cancelado exitosamente`)
      setCancelDialogOpen(false)
      setLoanToCancel(null)
      setCancelReason("")
      onLoanUpdated?.()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <>
      <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="text-muted-foreground">N° Préstamo</TableHead>
              {userRole !== 'cliente' && <TableHead className="text-muted-foreground">Cliente</TableHead>}
              <TableHead className="text-muted-foreground">Monto</TableHead>
              <TableHead className="text-muted-foreground">Tasa</TableHead>
              <TableHead className="text-muted-foreground">Plazo</TableHead>
              <TableHead className="text-muted-foreground">Cuota</TableHead>
              <TableHead className="text-muted-foreground">Progreso</TableHead>

              <TableHead className="text-muted-foreground">Estado</TableHead>
            <TableHead className="text-muted-foreground">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((loan) => (
              <TableRow key={loan.id} className="border-border/50">
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{loan.loanNumber}</span>
                    {groupMap && groupMap[loan.id] && (
                      <Badge variant="outline">Préstamo Grupo: {groupMap[loan.id].groupName}</Badge>
                    )}
                    {loan.hasOverdue ? (
                      <Badge variant="destructive">Retraso</Badge>
                    ) : (
                      <Badge variant="secondary">Al día</Badge>
                    )}
                  </div>
                </TableCell>
                {userRole !== 'cliente' && (
                  <TableCell className="text-foreground">
                    {loan.client
                      ? `${(loan.client as any).firstName ?? (loan.client as any).first_name ?? ''} ${(loan.client as any).lastName ?? (loan.client as any).last_name ?? ''}`.trim() || 'N/A'
                      : 'N/A'}
                  </TableCell>
                )}
                <TableCell className="text-foreground">{formatCurrency(loan.amount)}</TableCell>
                <TableCell className="text-foreground">{loan.interestRate}%</TableCell>
                <TableCell className="text-foreground">{loan.termMonths} meses</TableCell>
                <TableCell className="text-foreground">{formatCurrency(loan.monthlyPayment)}</TableCell>
                <TableCell className="text-foreground whitespace-nowrap">{(loan as any).progressPaid ?? 0}/{(loan as any).progressTotal ?? 0}</TableCell>
                <TableCell>{getStatusBadge(loan.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/loans/${loan.id}`)} className="gap-2">
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                    {isAdmin && onLoanUpdated && loan.status?.toLowerCase() !== "paid" && loan.status !== "cancelled" && (
                      <EditLoanDialog loan={loan} onLoanUpdated={onLoanUpdated} />
                    )}
                    {isAdmin && loan.status === "pending" && onLoanUpdated && (
                      <ActivateLoanDialog loan={loan} onActivated={onLoanUpdated} trigger={
                        <Button variant="outline" size="sm" className="gap-2">Activar</Button>
                      } />
                    )}
                    {isAdmin && loan.status !== "paid" && loan.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleCancelClick(loan)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar Préstamo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro que deseas cancelar el préstamo{" "}
              <strong>{loanToCancel?.loanNumber}</strong>?
            </p>
            <p className="text-sm text-muted-foreground">
              Esta acción cancelará el préstamo y todas sus cuotas pendientes.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
              <Input
                id="cancel-reason"
                placeholder="Ej: Cliente solicitó cancelación"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={isCancelling}>
              No, mantener
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={isCancelling}>
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Sí, cancelar préstamo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
