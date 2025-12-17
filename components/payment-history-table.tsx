"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { Payment } from "@/lib/types"
import { formatYMDGT } from "@/lib/utils"
import { FileText } from "lucide-react"

interface PaymentHistoryTableProps {
  payments: Payment[]
  onDownloadReceipt?: (payment: Payment) => void
  onPaymentUpdate?: () => void
}

export function PaymentHistoryTable({ payments, onDownloadReceipt, onPaymentUpdate }: PaymentHistoryTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return formatYMDGT(date, { year: "numeric", month: "long", day: "numeric" })
  }

  const handleDownloadReceipt = (payment: Payment) => {
    window.open(`/api/reports/receipt/${payment.id}`, "_blank")
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-8 text-center">
        <p className="text-muted-foreground">No hay pagos registrados aún</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-muted-foreground">N° Recibo</TableHead>
            <TableHead className="text-muted-foreground">Fecha de Pago</TableHead>
            <TableHead className="text-muted-foreground">Monto</TableHead>
            <TableHead className="text-muted-foreground">Método</TableHead>
            <TableHead className="text-muted-foreground">Boletas</TableHead>
            <TableHead className="text-muted-foreground">Estado</TableHead>
            <TableHead className="text-muted-foreground">Notas</TableHead>
            <TableHead className="text-muted-foreground">Recibo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id} className="border-border/50">
              <TableCell className="font-medium text-foreground">{payment.receiptNumber}</TableCell>
              <TableCell className="text-foreground">{formatDate(payment.paymentDate)}</TableCell>
              <TableCell className="text-foreground font-medium">{formatCurrency(payment.amount)}</TableCell>
              <TableCell className="text-foreground">{payment.paymentMethod}</TableCell>
              <TableCell>
                {payment.boletas && payment.boletas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {payment.boletas.map((b) => (
                      b.imageUrl ? (
                        <Dialog key={`${payment.id}-${b.id}`}>
                          <DialogTrigger asChild>
                            <button className="border rounded overflow-hidden">
                              <img
                                src={b.imageUrl}
                                alt={`Boleta ${b.numeroBoleta}`}
                                className="w-10 h-10 object-cover"
                              />
                            </button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Imagen de la Boleta</DialogTitle>
                            </DialogHeader>
                            <div className="flex justify-center">
                              <img src={b.imageUrl} alt={`Boleta ${b.numeroBoleta}`} className="w-full h-auto max-h-[80vh] object-contain" />
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span key={`${payment.id}-${b.id}`} className="text-muted-foreground text-sm">Sin imagen</span>
                      )
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Sin boletas</span>
                )}
              </TableCell>
              <TableCell>
                {(() => {
                  const status = payment.confirmation_status || payment.confirmationStatus || 'pendiente'
                  let colorClass = ""
                  let label = ""

                  switch (status) {
                    case 'aprobado':
                    case 'confirmado':
                      colorClass = "bg-green-500/10 text-green-400 border-green-500/20"
                      label = 'Confirmado'
                      break
                    case 'rechazado':
                      colorClass = "bg-red-500/10 text-red-400 border-red-500/20"
                      label = 'Rechazado'
                      break
                    case 'pending_confirmation':
                    case 'pendiente':
                    default:
                      colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      label = 'Pendiente'
                      break
                  }

                  const isFull = String(payment.notes || '').startsWith('[FULL_PAYMENT]')
                  return (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={colorClass}>{label}</Badge>
                      {isFull && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">Pago completo</Badge>
                      )}
                    </div>
                  )
                })()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {payment.rejection_reason 
                  ? <span className="text-red-400">{payment.rejection_reason}</span> 
                  : (payment.notes || "-")}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => handleDownloadReceipt(payment)} className="gap-2">
                  <FileText className="h-4 w-4" />
                  Ver Recibo
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
    </div>
  )
}
