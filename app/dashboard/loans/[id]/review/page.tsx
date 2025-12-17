"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { useRole } from "@/contexts/role-context"
import type { Loan, PaymentSchedule, Payment, Boleta, Client } from "@/lib/types"
import { formatYMDGT, translateStatus } from "@/lib/utils"

import { LoadingSpinner } from "@/components/loading-spinner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, 
  Banknote, 
  CalendarDays, 
  ClipboardList, 
  FileText, 
  Hash, 
  Info, 
  Landmark, 
  MessageSquare, 
  User 
} from "lucide-react"
import { toast } from "sonner"

interface DetailItemProps {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}

const DetailItem: React.FC<DetailItemProps> = ({ icon: Icon, label, value }) => (
  <div className="space-y-1">
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </div>
    <p className="text-base font-semibold">{value || "N/A"}</p>
  </div>
)

export default function ReviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scheduleId = searchParams.get('scheduleId')
  const { role } = useRole()

  const [loan, setLoan] = useState<(Loan & { client: Client }) | null>(null)
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [boletas, setBoletas] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submittingAction, setSubmittingAction] = useState<'approving' | 'rejecting' | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionText, setRejectionText] = useState('')
  const [fullInfo, setFullInfo] = useState<{ isFull: boolean; start?: number; end?: number; total?: number; extra?: string } | null>(null)

  const writeCache = (key: string, data: any) => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    } catch {}
  }
  const K = {
    loanDetails: 'loanDetails:',
  }


  useEffect(() => {
    const fetchData = async () => {
      const hardTimeout = setTimeout(() => {
        setIsLoading(false)
        setError('Tiempo de espera excedido al cargar la revisión del pago')
        console.warn('[review] Hard timeout reached while loading data')
      }, 50000)
      if (!scheduleId) {
        setError("No se proporcionó un ID de cuota válido.");
        setIsLoading(false);
        return;
      }

      try {
        const supabase = createClient()
        
        // 1. Fetch Payment Schedule, Loan, and Client
        const { data: scheduleData, error: scheduleError } = await supabase
          .from('payment_schedule')
          .select('*, loan:loans(*, client:clients(*))')
          .eq('id', scheduleId)
          .single()

        if (scheduleError) throw new Error(`Error al buscar la cuota: ${scheduleError.message}`);
        if (!scheduleData) throw new Error("No se encontró la cuota del préstamo.");

        console.log("Schedule Data:", scheduleData); // DEBUG
        setLoan(scheduleData.loan as (Loan & { client: Client }))
        setSchedule(scheduleData)

        // 2. Fetch the latest Payment for the schedule
        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .select('*')
          .eq('schedule_id', scheduleId)
          .order('created_at', { ascending: false })
          .limit(1)

        if (paymentError) throw new Error(`Error al buscar el pago: ${paymentError.message}`);
        if (!paymentData || paymentData.length === 0) {
          setIsLoading(false);
          return; // No payment found, just show loan info
        }
        
        const currentPayment = paymentData[0]
        console.log("Current Payment:", currentPayment); // DEBUG
        setPayment(currentPayment)

        try {
          const raw = String(currentPayment?.notes || '')
          if (raw.startsWith('[FULL_PAYMENT]')) {
            let scheduleIds: string[] = []
            let total: number | undefined = undefined
            let extra = ''
            const l = raw.indexOf('{')
            const r = raw.lastIndexOf('}')
            if (l !== -1 && r !== -1 && r > l) {
              try {
                const obj = JSON.parse(raw.substring(l, r + 1))
                if (Array.isArray(obj?.scheduleIds)) scheduleIds = obj.scheduleIds
                if (obj?.total !== undefined) total = Number(obj.total)
              } catch {}
              extra = raw.substring(r + 1).trim()
            }
            let start = scheduleData.payment_number
            let end = scheduleData.payment_number
            if (scheduleIds.length > 0) {
              const { data: rows } = await supabase
                .from('payment_schedule')
                .select('id, payment_number')
                .in('id', scheduleIds)
              const nums = (rows || []).map((row: any) => Number(row.payment_number || 0)).filter((n) => Number.isFinite(n) && n > 0)
              if (nums.length > 0) {
                start = Math.min(...nums)
                end = Math.max(...nums)
              }
            }
            setFullInfo({ isFull: true, start, end, total: total ?? Number(currentPayment.amount || 0), extra })
          } else {
            setFullInfo({ isFull: false })
          }
        } catch {}

        // 3. Fetch all boletas linked to this schedule
        const { data: cuotaBoletas, error: cuotaBoletasError } = await supabase
          .from('cuota_boletas')
          .select('boleta_id')
          .eq('payment_schedule_id', scheduleId)

        if (cuotaBoletasError) {
          console.warn(`Could not find the links between schedule and boletas: ${cuotaBoletasError.message}`)
        }
        const boletaIds = (cuotaBoletas || []).map((row: any) => row.boleta_id).filter(Boolean)
        if (boletaIds.length > 0) {
          const { data: boletasData, error: boletasError } = await supabase
            .from('boletas')
            .select('*')
            .in('id', boletaIds)
          if (boletasError) {
            console.warn(`Could not fetch boletas: ${boletasError.message}`)
          } else {
            setBoletas(boletasData || [])
          }
        }

      } catch (err: any) {
        console.error("Error fetching data:", err)
        setError(err.message || "Ocurrió un error inesperado.")
      } finally {
        setIsLoading(false)
        clearTimeout(hardTimeout)
      }
    }

    fetchData()
  }, [scheduleId])

  const handleAction = async (action: 'aprobar' | 'rechazar', reason?: string) => {
    if (!payment) return;
    setSubmittingAction(action === 'aprobar' ? 'approving' : 'rejecting');
    setError(null); // Clear previous errors
    try {
      const response = await fetch(`/api/payments/${payment.id}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejection_reason: reason }),
      });

      if (response.ok) {
        const data = await response.json();
        if (action === 'aprobar') {
          toast.success('Pago aprobado exitosamente');
        } else {
          toast.success('Pago rechazado');
        }
        if (data?.loanFinalized) {
          toast.success('Préstamo finalizado')
        }

        if (data.notificationError) {
          toast.warning(`Advertencia: ${data.notificationError}`);
        }

        try {
          if (loan?.id) {
            const detailsRes = await fetch(`/api/loans/${loan.id}/details`, { credentials: 'include' as any })
            if (detailsRes.ok) {
              const fresh = await detailsRes.json()
              writeCache(K.loanDetails + loan.id, fresh)
            }
          }
        } catch {}
        router.push(`/dashboard/loans/${loan?.id}`);
      } else {
        const errorData = await response.json();
        const message = `Error al ${action === 'aprobar' ? 'aprobar' : 'rechazar'} el pago: ${errorData.error || 'Error desconocido'}`
        toast.error(message)
        throw new Error(message);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast.error(err.message || 'Ocurrió un error al procesar la solicitud')
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleApprove = () => handleAction('aprobar');
  const handleReject = () => {
    setShowRejectDialog(true)
  }
  const submitRejection = async () => {
    const reason = rejectionText.trim()
    if (!reason) {
      toast.error('Debe proporcionar una razón para el rechazo')
      return
    }
    await handleAction('rechazar', reason)
    setShowRejectDialog(false)
    setRejectionText('')
  }

  if (isLoading) return <LoadingSpinner />;

  if (error && !loan) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Alert variant="destructive" className="max-w-lg">
          <Info className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => router.back()}>Volver</Button>
      </div>
    );
  }
  
  if (!schedule || !loan) {
     return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Alert className="max-w-lg">
          <Info className="h-4 w-4" />
          <AlertTitle>No Encontrado</AlertTitle>
          <AlertDescription>No se encontraron los detalles para la cuota solicitada.</AlertDescription>
        </Alert>
        <Button onClick={() => router.back()}>Volver</Button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revisar Pago</h1>
            <p className="text-muted-foreground">
              Revise los detalles del pago y la boleta antes de aprobar o rechazar.
            </p>
          </div>
        </div>
        {(role === 'admin' || role === 'asesor') && payment && payment.confirmation_status === 'pending_confirmation' && (
           <div className="flex gap-2 flex-shrink-0">
            <Button onClick={handleApprove} disabled={!!submittingAction}>
              {submittingAction === 'approving' ? 'Aprobando...' : 'Aprobar'}
            </Button>
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={!!submittingAction}>
                  {submittingAction === 'rejecting' ? 'Rechazando...' : 'Rechazar'}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Rechazar Pago</DialogTitle>
                  <DialogDescription>
                    Proporcione una razón para rechazar este pago. Esta acción notificará al cliente.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rejection-reason">Razón del rechazo</Label>
                    <Textarea
                      id="rejection-reason"
                      value={rejectionText}
                      onChange={(e) => setRejectionText(e.target.value)}
                      placeholder="Escriba el motivo del rechazo"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={submitRejection} disabled={!!submittingAction}>
                    {submittingAction === 'rejecting' ? 'Rechazando...' : 'Rechazar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
           </div>
         )}
       </div>

       {error && (
         <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {!payment ? (
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Pago Pendiente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Aún no se ha registrado ningún pago para esta cuota.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Payment Details */}
              <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5" />
                    Detalles del Pago
                    {fullInfo?.isFull && (
                      <Badge variant="outline" className="ml-auto">Pago Completo</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <DetailItem icon={Banknote} label="Monto Pagado" value={new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(payment.amount)} />
                  <DetailItem icon={CalendarDays} label="Fecha de Pago" value={formatYMDGT(payment.payment_date || "")} />
                  <DetailItem icon={Hash} label="No. de Recibo" value={payment.receipt_number} />
                  <DetailItem icon={Info} label="Método de Pago" value={payment.payment_method} />
                  {(payment.notes || fullInfo?.isFull) && (
                    <div className="md:col-span-2">
                      <DetailItem
                        icon={MessageSquare}
                        label="Notas"
                        value={
                          fullInfo?.isFull
                            ? (
                              <span>
                                Pago de préstamo completo: cuotas #{fullInfo?.start} a #{fullInfo?.end} del préstamo {loan.loan_number} perteneciente a {loan.client.first_name} {loan.client.last_name}. Monto total: {new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(fullInfo?.total || payment.amount || 0))}
                                {fullInfo?.extra ? <span> — Notas adicionales: {fullInfo.extra}</span> : null}
                              </span>
                            )
                            : payment.notes
                        }
                      />
                    </div>
                  )}
                  {payment.rejection_reason && <div className="md:col-span-2"><DetailItem icon={Info} label="Motivo del Rechazo" value={<span className="text-destructive">{payment.rejection_reason}</span>} /></div>}
                </CardContent>
              </Card>

              {/* Boletas Details */}
              {boletas.length > 0 ? (
                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Boletas Asociadas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {boletas.map((b) => (
                      <div key={b.id} className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                          <DetailItem icon={Hash} label="Número de Boleta" value={b.numero_boleta} />
                          <DetailItem icon={Info} label="Forma de Pago" value={b.forma_pago} />
                          <DetailItem icon={CalendarDays} label="Fecha de Boleta" value={formatYMDGT(b.fecha)} />
                          <DetailItem icon={Banknote} label="Monto de Boleta" value={new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(b.monto)} />
                          {b.banco && <DetailItem icon={Landmark} label="Banco" value={b.banco} />}
                          {b.referencia && <DetailItem icon={Hash} label="Referencia" value={b.referencia} />}
                        </div>
                        <div className="space-y-2">
                          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><FileText className="h-4 w-4" />Imagen de la Boleta</p>
                          {b.image_url ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button className="w-full h-auto overflow-hidden rounded-lg border hover:opacity-80 transition-opacity">
                                  <Image src={String(b.image_url).replace(/`/g, '')} alt={`Boleta ${b.numero_boleta}`} width={300} height={400} className="object-contain w-full" />
                                </button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Imagen de la Boleta</DialogTitle>
                                </DialogHeader>
                                <div className="flex justify-center">
                                  <Image src={String(b.image_url).replace(/`/g, '')} alt={`Boleta ${b.numero_boleta}`} width={800} height={1200} className="h-auto w-full max-h-[80vh] object-contain" />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : <p className="text-sm text-muted-foreground">No hay imagen disponible.</p>}
                        </div>
                        {b.observaciones && <div className="md:col-span-2"><DetailItem icon={MessageSquare} label="Observaciones" value={b.observaciones} /></div>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardHeader><CardTitle>Boletas no encontradas</CardTitle></CardHeader>
                  <CardContent><p className="text-muted-foreground">No se encontraron boletas asociadas a esta cuota.</p></CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Loan Summary */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><User className="h-4 w-4"/>Cliente</h3>
                <p className="text-muted-foreground">{loan.client.first_name} {loan.client.last_name}</p>
              </div>
              <Separator />
              <div>
                <h3 className="font-semibold">Préstamo</h3>
                <div className="text-sm text-muted-foreground space-y-1 mt-2">
                  <p><strong>No:</strong> {loan.loan_number}</p>
                  <p><strong>Monto:</strong> {new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(loan.amount)}</p>
                  <p><strong>Cuota Mensual:</strong> {new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(loan.monthly_payment)}</p>
                </div>
              </div>
              <Separator />
              <div>
                {fullInfo?.isFull ? (
                  <div>
                    <h3 className="font-semibold">Pago Completo</h3>
                    <div className="text-sm text-muted-foreground space-y-1 mt-2">
                      <p><strong>Cuotas:</strong> #{fullInfo?.start}–#{fullInfo?.end}</p>
                      <p><strong>Monto:</strong> {new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(fullInfo?.total || payment?.amount || 0))}</p>
                      <p><strong>Estado:</strong> <span className="font-bold">{translateStatus(schedule.status)}</span></p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-semibold">Cuota Actual</h3>
                    <div className="text-sm text-muted-foreground space-y-1 mt-2">
                      <p><strong>No:</strong> {schedule.payment_number}</p>
                      <p><strong>Monto:</strong> {new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(schedule.amount || 0) + Number(schedule.mora || 0))}</p>
                      <p><strong>Estado:</strong> <span className="font-bold">{translateStatus(schedule.status)}</span></p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
