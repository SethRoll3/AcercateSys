"use client"

import type { Loan } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye } from "lucide-react"
import { useRouter } from "next/navigation"
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      active: "default",
      paid: "secondary",
      pending: "outline",
    }
    const labels: Record<string, string> = {
      active: "Activo",
      paid: "Pagado",
      pending: "Pendiente",
    }
    return <Badge variant={variants[status] || "default"}>{labels[status] || status}</Badge>
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-muted-foreground">N° Préstamo</TableHead>
            {userRole !== 'cliente' && <TableHead className="text-muted-foreground">Cliente</TableHead>}
            <TableHead className="text-muted-foreground">Monto</TableHead>
            <TableHead className="text-muted-foreground">Tasa</TableHead>
            <TableHead className="text-muted-foreground">Plazo</TableHead>
            <TableHead className="text-muted-foreground">Cuota Mensual</TableHead>

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
              <TableCell>{getStatusBadge(loan.status)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/loans/${loan.id}`)} className="gap-2">
                    <Eye className="h-4 w-4" />
                    Ver
                  </Button>
                  {isAdmin && onLoanUpdated && <EditLoanDialog loan={loan} onLoanUpdated={onLoanUpdated} />}
                  {(isAdmin || userRole === "asesor") && loan.status === "pending" && onLoanUpdated && (
                    <ActivateLoanDialog loan={loan} onActivated={onLoanUpdated} trigger={
                      <Button variant="outline" size="sm" className="gap-2">Activar</Button>
                    } />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
