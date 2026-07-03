"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { Loan, PaymentSchedule } from "@/lib/types"
import { toast } from "sonner"
import { BrandSpinner } from "@/components/brand-spinner"
import { Download } from "lucide-react"

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
  const [activationApprovals, setActivationApprovals] = useState<any>({ count: 0, required: 2, approvedBy: [] })
  const [c1, setC1] = useState(false)
  const [c2, setC2] = useState(false)
  const [c3, setC3] = useState(false)
  const [actaDate, setActaDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [actaInfo, setActaInfo] = useState<{ url: string | null; uploadedAt: string | null }>({ url: null, uploadedAt: null })
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
          setActivationApprovals(data.activationApprovals || { count: 0, required: 2, approvedBy: [] })
          setActaInfo({
            url: data.loan?.actaUrl || null,
            uploadedAt: data.loan?.actaUploadedAt || null,
          })
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
        const data = await res.json().catch(() => null)
        if (data?.approvals) {
          setActivationApprovals({
            count: data.approvals.count ?? 0,
            required: data.approvals.required ?? 2,
            approvedBy: data.approvals.approvedBy || activationApprovals.approvedBy || [],
            currentUserId: activationApprovals.currentUserId,
          })
        }
        if (data?.status === "active") {
          toast.success("Préstamo activado")
        } else {
          const remaining = Math.max(2 - Number(data?.approvals?.count || 0), 0)
          toast.success(remaining > 0 ? `Confirmación registrada. Falta ${remaining}` : "Confirmación registrada")
        }
        setOpen(false)
        onActivated()
      } else {
        const txt = await res.text()
        let msg = txt
        try {
          const parsed = JSON.parse(txt)
          msg = parsed?.error || txt
        } catch {}
        toast.error(msg || "No se pudo activar el préstamo")
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
  const approvalsCount = activationApprovals?.count ?? 0
  const approvalsRequired = activationApprovals?.required ?? 2
  const approvalsRemaining = Math.max(approvalsRequired - approvalsCount, 0)
  const hasApproved = activationApprovals?.currentUserId
    ? (activationApprovals.approvedBy || []).some((u: any) => u?.id === activationApprovals.currentUserId)
    : false
  const isAlreadyActive = loan.status === "active"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">Revisar y Activar</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px] bg-card border-border h-[75vh] overflow-y-auto">
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
              <div className="rounded-lg border bg-card p-3 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Confirmaciones de activación</span>
                  <span>{approvalsCount} de {approvalsRequired}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {(activationApprovals?.approvedBy || []).length > 0 ? (
                    (activationApprovals.approvedBy || []).map((u: any) => (
                      <div key={u.id} className="text-foreground">
                        {u.full_name || u.email || u.id}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">Sin confirmaciones</div>
                  )}
                </div>
                {approvalsRemaining > 0 && (
                  <div className="text-muted-foreground mt-2">
                    Falta {approvalsRemaining} confirmación{approvalsRemaining === 1 ? "" : "es"}
                  </div>
                )}
              </div>
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

              <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-400 font-bold">!</span>
                <div className="text-amber-900 dark:text-amber-200">
                  <strong>Importante:</strong> descarga el acta de comité, imprímela, hazla firmar y luego sube el archivo firmado desde el detalle del préstamo. La subida del acta ya no es requisito para activar.
                </div>
              </div>

              <div className="border rounded-md p-4 mt-4 space-y-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Descargar Acta de Comité</span>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="acta-date">Fecha del acta</Label>
                    <Input
                      id="acta-date"
                      type="date"
                      value={actaDate}
                      onChange={(e) => setActaDate(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => window.open(`/api/loans/${loan.id}/acta-pdf?date=${actaDate}`, "_blank")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Generar y Descargar Acta PDF
                  </Button>
                </div>
                {actaInfo.url && (
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    ✓ Acta firmada subida el {actaInfo.uploadedAt ? new Date(actaInfo.uploadedAt).toLocaleString('es-GT') : '—'}.
                    Puedes reemplazarla desde el detalle del préstamo.
                  </div>
                )}
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
                <Button onClick={activate} disabled={!isReady || isLoading || hasApproved || isAlreadyActive}>
                  {isAlreadyActive ? "Préstamo Activo" : hasApproved ? "Confirmación registrada" : isLoading ? "Activando..." : "Activar Préstamo"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
