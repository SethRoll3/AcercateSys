"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import type { Loan, PaymentSchedule } from "@/lib/types"
import { toast } from "sonner"

interface ActivateLoanDialogProps {
  loan: Loan
  onActivated: () => void
  trigger?: React.ReactNode
}

export function ActivateLoanDialog({ loan, onActivated, trigger }: ActivateLoanDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [schedule, setSchedule] = useState<PaymentSchedule[]>([])
  const [c1, setC1] = useState(false)
  const [c2, setC2] = useState(false)
  const [c3, setC3] = useState(false)

  const isReady = useMemo(() => c1 && c2 && c3, [c1, c2, c3])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch(`/api/loans/${loan.id}/details`, { credentials: "include" as any })
        if (res.ok) {
          const data = await res.json()
          setSchedule(data.schedule || [])
        }
      } catch {}
    })()
  }, [open, loan.id])

  const activate = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/loans/${loan.id}/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" as any })
      if (res.ok) {
        toast.success("Préstamo activado")
        setOpen(false)
        onActivated()
      } else {
        const txt = await res.text()
        toast.error(txt || "No se pudo activar el préstamo")
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al activar el préstamo")
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (n: number) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(n || 0))
  const formatDate = (s: string) => {
    try {
      const d = new Date(s)
      return d.toISOString().slice(0, 10)
    } catch { return s }
  }

  const schedulePreview = schedule.slice(0, 5)
  const totalBase = useMemo(() => schedule.reduce((a, b) => a + Number(b.principal || 0) + Number(b.interest || 0) + Number(b.admin_fees ?? 20), 0), [schedule])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">Revisar y Activar</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Activar Préstamo</DialogTitle>
          <DialogDescription className="text-muted-foreground">Revisa los datos antes de activar</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Cliente</div>
              <div className="text-foreground">{(loan as any).client ? `${(loan as any).client.firstName} ${(loan as any).client.lastName}` : ""}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Préstamo</div>
              <div className="text-foreground">{loan.loanNumber || (loan as any).loan_number}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Monto</div>
              <div className="text-foreground">{formatCurrency(loan.amount)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Cuota Mensual</div>
              <div className="text-foreground">{formatCurrency(loan.monthlyPayment)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Tasa</div>
              <div className="text-foreground">{loan.interestRate}%</div>
            </div>
            <div>
              <div className="text-muted-foreground">Plazo</div>
              <div className="text-foreground">{loan.termMonths} meses</div>
            </div>
            <div>
              <div className="text-muted-foreground">Inicio</div>
              <div className="text-foreground">{formatDate(loan.startDate)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fin</div>
              <div className="text-foreground">{formatDate(loan.endDate)}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Plan de Pagos (vista previa)</span>
              <span>Total: {formatCurrency(totalBase)}</span>
            </div>
            <div className="mt-2 space-y-1">
              {schedulePreview.map((s) => (
                <div key={s.id} className="flex justify-between text-muted-foreground">
                  <span>#{s.payment_number} {s.due_date}</span>
                  <span>{formatCurrency(Number(s.principal || 0) + Number(s.interest || 0) + Number(s.admin_fees ?? 20))}</span>
                </div>
              ))}
              {schedule.length === 0 && (
                <div className="text-muted-foreground">No hay plan de pagos</div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="c1" checked={c1} onCheckedChange={(v: any) => setC1(Boolean(v))} />
              <Label htmlFor="c1">Confirmo datos del cliente</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="c2" checked={c2} onCheckedChange={(v: any) => setC2(Boolean(v))} />
              <Label htmlFor="c2">Confirmo monto, tasa y plazo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="c3" checked={c3} onCheckedChange={(v: any) => setC3(Boolean(v))} />
              <Label htmlFor="c3">Confirmo plan de pagos verificado</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={activate} disabled={!isReady || isLoading}>{isLoading ? "Activando..." : "Activar Préstamo"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}