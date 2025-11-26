"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import type { Loan, PaymentSchedule } from "@/lib/types"
import { toast } from "sonner"
import { BrandSpinner } from "@/components/brand-spinner"

interface ActivateLoanDialogProps {
  loan: Loan
  onActivated: () => void
  trigger?: React.ReactNode
}

export function ActivateLoanDialog({ loan, onActivated, trigger }: ActivateLoanDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [schedule, setSchedule] = useState<PaymentSchedule[]>([])
  const [clientDetails, setClientDetails] = useState<any>(null)
  const [isFetchingDetails, setIsFetchingDetails] = useState(false)
  const [c1, setC1] = useState(false)
  const [c2, setC2] = useState(false)
  const [c3, setC3] = useState(false)
  const [step, setStep] = useState<1|2|3>(1)

  

  const isReady = useMemo(() => c1 && c2 && c3, [c1, c2, c3])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        setIsFetchingDetails(true)
        const res = await fetch(`/api/loans/${loan.id}/details`, { credentials: "include" as any })
        if (res.ok) {
          const data = await res.json()
          setSchedule(data.schedule || [])
          setClientDetails(data.loan?.client || null)
        }
      } catch {}
      finally {
        setIsFetchingDetails(false)
      }
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
  const formatDateTimeGT = (s: string) => {
    try {
      const d = new Date(s)
      const dtf = new Intl.DateTimeFormat('es-GT', {
        timeZone: 'America/Guatemala',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
      const parts = dtf.formatToParts(d)
      const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value || ''
      const date = `${get('day')}/${get('month')}/${get('year')}`
      const time = `${get('hour')}:${get('minute')}`
      const tzParts = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', timeZoneName: 'short' }).formatToParts(d)
      const tz = tzParts.find(p => p.type === 'timeZoneName')?.value || 'GMT-6'
      return `${date} ${time} ${tz}`
    } catch { return s }
  }

  const totalBase = useMemo(() => schedule.reduce((a, b) => a + Number(b.principal || 0) + Number(b.interest || 0) + Number(b.admin_fees ?? 20), 0), [schedule])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">Revisar y Activar</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Activar Préstamo</DialogTitle>
          <DialogDescription className="text-muted-foreground">Revisa y confirma la activación</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Paso {step} de 3</span>
          </div>
          {isFetchingDetails && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <BrandSpinner size={20} className="text-primary" />
              <span>Cargando datos...</span>
            </div>
          )}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Cliente</div>
                <div className="text-foreground">{clientDetails ? `${clientDetails.first_name} ${clientDetails.last_name}` : ((loan as any).client ? `${(loan as any).client.firstName} ${(loan as any).client.lastName}` : "")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Correo</div>
                <div className="text-foreground">{clientDetails?.email ?? (loan as any).client?.email ?? 'N/A'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Teléfono</div>
                <div className="text-foreground">{clientDetails?.phone_country_code} {clientDetails?.phone ?? 'N/A'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-muted-foreground">Dirección</div>
                <div className="text-foreground">{clientDetails?.address ?? 'N/A'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Teléfono Emergencia</div>
                <div className="text-foreground">{clientDetails?.emergency_phone ?? 'N/A'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Grupo</div>
                <div className="text-foreground">{clientDetails?.group_name ?? 'N/A'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Creado</div>
                <div className="text-foreground">{clientDetails?.created_at ? formatDateTimeGT(clientDetails.created_at) : ((loan as any).client?.createdAt ? formatDateTimeGT((loan as any).client.createdAt) : 'N/A')}</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Préstamo</div>
                  <div className="text-foreground">{loan.loanNumber || (loan as any).loan_number}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Monto</div>
                  <div className="text-foreground">{formatCurrency(loan.amount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cuota</div>
                  <div className="text-foreground">{formatCurrency(loan.monthlyPayment)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tasa</div>
                  <div className="text-foreground">{loan.interestRate}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Plazo</div>
                  <div className="text-foreground">{loan.termMonths}</div>
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
                  <span>Plan de Pagos</span>
                  <span>Total: {formatCurrency(totalBase)}</span>
                </div>
                <div className="mt-2 space-y-1 max-h-[160px] overflow-y-auto pr-1">
                  {schedule.map((s) => (
                    <div key={s.id} className="flex justify-between text-muted-foreground py-2">
                      <span>#{s.payment_number} {s.due_date}</span>
                      <span>{formatCurrency(Number(s.principal || 0) + Number(s.interest || 0) + Number(s.admin_fees ?? 20))}</span>
                    </div>
                  ))}
                  {schedule.length === 0 && (
                    <div className="text-muted-foreground">No hay plan de pagos</div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
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
          )}

          <div className="flex justify-between gap-2 pt-2">
            <div>
              {step > 1 && <Button variant="outline" onClick={() => setStep((step as number - 1) as any)}>Anterior</Button>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              {step < 3 ? (
                <Button onClick={() => setStep((step as number + 1) as any)} disabled={isFetchingDetails}>Siguiente</Button>
              ) : (
                <Button onClick={activate} disabled={!isReady || isLoading}>{isLoading ? "Activando..." : "Activar Préstamo"}</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
