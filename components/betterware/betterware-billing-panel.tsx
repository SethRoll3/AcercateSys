'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Receipt, AlertTriangle, MoreHorizontal, Pencil, CheckCircle2, Upload, FileImage, Link as LinkIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

interface Props {
  solicitudId: string
  solicitud: any
  facturacion: any[]
  canManage: boolean
  onUpdate: () => void
}

export function BetterwareBillingPanel({ solicitudId, solicitud, facturacion, canManage, onUpdate }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [editingFact, setEditingFact] = useState<any>(null)
  
  const [paymentForm, setPaymentForm] = useState<{
    file: File | null;
    no_boleta: string;
    banco: string;
    fecha_pago: string;
  }>({ file: null, no_boleta: '', banco: '', fecha_pago: new Date().toISOString().split('T')[0] })

  const now = new Date()
  const currentWeek = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))

  const [form, setForm] = useState({
    numero_semana: String(currentWeek),
    anio: String(now.getFullYear()),
    monto_factura: '',
    limite_asignado: String(solicitud.monto_autorizado || 0),
    observaciones: '',
  })

  const formatCurrency = (n: number) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n)

  const handleSubmit = async () => {
    if (!form.numero_semana || !form.anio || !form.monto_factura) { toast.error('Semana, año y monto son obligatorios'); return }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/betterware/${solicitudId}/facturacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('Facturación registrada')
        setIsOpen(false)
        setForm({ numero_semana: String(currentWeek), anio: String(now.getFullYear()), monto_factura: '', limite_asignado: String(solicitud.monto_autorizado || 0), observaciones: '' })
        onUpdate()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error')
      }
    } catch { toast.error('Error de red') }
    finally { setIsLoading(false) }
  }

  const handleUpdate = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/betterware/${solicitudId}/facturacion?factId=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        toast.success('Facturación actualizada')
        setIsEditOpen(false)
        setEditingFact(null)
        onUpdate()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error')
      }
    } catch { toast.error('Error de red') }
  }

  const handlePayment = async () => {
    if (!editingFact) return
    if (!paymentForm.no_boleta || !paymentForm.banco || !paymentForm.fecha_pago) {
      toast.error('Debe completar todos los datos de la boleta')
      return
    }
    // file is optional if they just want to register text, but user requested photo upload.
    if (!paymentForm.file && !editingFact.comprobante_url) {
      toast.error('Debe subir una foto de la boleta de pago')
      return
    }

    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('status', 'pagado')
      formData.append('no_boleta', paymentForm.no_boleta)
      formData.append('banco', paymentForm.banco)
      formData.append('fecha_pago', paymentForm.fecha_pago)
      if (paymentForm.file) formData.append('file', paymentForm.file)

      const res = await fetch(`/api/betterware/${solicitudId}/facturacion?factId=${editingFact.id}`, {
        method: 'PATCH',
        body: formData,
      })

      if (res.ok) {
        toast.success('Pago registrado exitosamente')
        setIsPaymentOpen(false)
        setEditingFact(null)
        setPaymentForm({ file: null, no_boleta: '', banco: '', fecha_pago: new Date().toISOString().split('T')[0] })
        onUpdate()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error registrando pago')
      }
    } catch { toast.error('Error de red') }
    finally { setIsLoading(false) }
  }

  const statusConfig: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pendiente: { variant: "outline", label: "Pendiente" },
    pagado: { variant: "default", label: "Pagado" },
    excedente_pendiente: { variant: "destructive", label: "Excedente Pendiente" },
  }

  const totalFacturado = facturacion.reduce((s, f) => s + Number(f.monto_factura || 0), 0)
  const totalExcedente = facturacion.reduce((s, f) => s + Number(f.excedente || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-foreground">Facturación Semanal</h3>
        {canManage && (
          <Button onClick={() => setIsOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Registrar Semana</Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/50 bg-card/50"><CardContent className="pt-3 pb-3 text-center"><div className="text-xs text-muted-foreground">Total Facturado</div><div className="text-lg font-bold text-foreground">{formatCurrency(totalFacturado)}</div></CardContent></Card>
        <Card className="border-border/50 bg-card/50"><CardContent className="pt-3 pb-3 text-center"><div className="text-xs text-muted-foreground">Límite Autorizado</div><div className="text-lg font-bold text-foreground">{formatCurrency(solicitud.monto_autorizado || 0)}</div></CardContent></Card>
        <Card className={`border-border/50 ${totalExcedente > 0 ? 'bg-rose-500/5' : 'bg-card/50'}`}><CardContent className="pt-3 pb-3 text-center"><div className="text-xs text-muted-foreground">Total Excedentes</div><div className={`text-lg font-bold ${totalExcedente > 0 ? 'text-rose-500' : 'text-foreground'}`}>{formatCurrency(totalExcedente)}</div></CardContent></Card>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead className="text-muted-foreground">Semana</TableHead>
              <TableHead className="text-muted-foreground">Año</TableHead>
              <TableHead className="text-muted-foreground">Monto Factura</TableHead>
              <TableHead className="text-muted-foreground">Límite</TableHead>
              <TableHead className="text-muted-foreground">Excedente</TableHead>
              <TableHead className="text-muted-foreground">Pago Exc.</TableHead>
              <TableHead className="text-muted-foreground">Estado</TableHead>
              {canManage && <TableHead className="text-right text-muted-foreground">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {facturacion.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin facturación registrada</TableCell></TableRow>
            ) : facturacion.map((f: any) => {
              const sc = statusConfig[f.status] || { variant: "outline", label: f.status }
              return (
                <TableRow key={f.id} className="border-border/50">
                  <TableCell className="font-medium">{f.numero_semana}</TableCell>
                  <TableCell>{f.anio}</TableCell>
                  <TableCell>{formatCurrency(f.monto_factura)}</TableCell>
                  <TableCell>{formatCurrency(f.limite_asignado)}</TableCell>
                  <TableCell className={Number(f.excedente) > 0 ? 'text-rose-500 font-medium' : ''}>{formatCurrency(f.excedente)}{Number(f.excedente) > 0 && <AlertTriangle className="h-3 w-3 inline ml-1" />}</TableCell>
                  <TableCell>{formatCurrency(f.pago_excedente)}</TableCell>
                  <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px]">
                          {f.status !== 'pagado' && (
                            <DropdownMenuItem onClick={() => { setEditingFact(f); setIsPaymentOpen(true); }}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />Registrar Pago
                            </DropdownMenuItem>
                          )}
                          {f.comprobante_url && (
                            <DropdownMenuItem onClick={() => window.open(f.comprobante_url, '_blank')}>
                              <LinkIcon className="h-4 w-4 mr-2" />Ver Boleta
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { setEditingFact(f); setIsEditOpen(true) }}>
                            <Pencil className="h-4 w-4 mr-2" />Editar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* New billing dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Registrar Facturación Semanal</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Semana</Label><Input type="number" min="1" max="53" value={form.numero_semana} onChange={e => setForm({ ...form, numero_semana: e.target.value })} className="bg-background/50" /></div>
              <div className="space-y-1"><Label>Año</Label><Input type="number" value={form.anio} onChange={e => setForm({ ...form, anio: e.target.value })} className="bg-background/50" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Monto Factura *</Label><Input type="number" step="0.01" placeholder="0.00" value={form.monto_factura} onChange={e => setForm({ ...form, monto_factura: e.target.value })} className="bg-background/50" /></div>
              <div className="space-y-1"><Label>Límite Asignado</Label><Input type="number" step="0.01" value={form.limite_asignado} onChange={e => setForm({ ...form, limite_asignado: e.target.value })} className="bg-background/50" /></div>
            </div>
            {parseFloat(form.monto_factura) > parseFloat(form.limite_asignado) && (
              <div className="rounded-md bg-rose-500/10 p-3 text-sm text-rose-500 border border-rose-500/20 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Excedente: {formatCurrency(parseFloat(form.monto_factura) - parseFloat(form.limite_asignado))}
              </div>
            )}
            <div className="space-y-1"><Label>Observaciones</Label><Textarea placeholder="Observaciones..." value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className="bg-background/50" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Registrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit billing dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" />Editar Facturación</DialogTitle></DialogHeader>
          {editingFact && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Estado</Label>
                  <select
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editingFact.status}
                    onChange={e => setEditingFact({ ...editingFact, status: e.target.value })}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="excedente_pendiente">Excedente Pendiente</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>Monto Factura *</Label><Input type="number" step="0.01" value={editingFact.monto_factura} onChange={e => setEditingFact({ ...editingFact, monto_factura: e.target.value })} className="bg-background/50" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Límite Asignado</Label><Input type="number" step="0.01" value={editingFact.limite_asignado} onChange={e => setEditingFact({ ...editingFact, limite_asignado: e.target.value })} className="bg-background/50" /></div>
                <div className="space-y-1"><Label>Pago Excedente</Label><Input type="number" step="0.01" value={editingFact.pago_excedente || 0} onChange={e => setEditingFact({ ...editingFact, pago_excedente: e.target.value })} className="bg-background/50" /></div>
              </div>
              <div className="space-y-1"><Label>Observaciones</Label><Textarea placeholder="Observaciones..." value={editingFact.observaciones || ''} onChange={e => setEditingFact({ ...editingFact, observaciones: e.target.value })} className="bg-background/50" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingFact(null); }}>Cancelar</Button>
            <Button onClick={() => handleUpdate(editingFact.id, {
              status: editingFact.status,
              monto_factura: editingFact.monto_factura,
              limite_asignado: editingFact.limite_asignado,
              pago_excedente: editingFact.pago_excedente,
              observaciones: editingFact.observaciones
            })} disabled={isLoading}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog Modal */}
      <Dialog open={isPaymentOpen} onOpenChange={(open) => {
        setIsPaymentOpen(open)
        if (!open) { setEditingFact(null); setPaymentForm({ file: null, no_boleta: '', banco: '', fecha_pago: new Date().toISOString().split('T')[0] }) }
      }}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-emerald-500"><CheckCircle2 className="h-5 w-5" />Registrar Pago de Factura</DialogTitle></DialogHeader>
          {editingFact && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-border/50 bg-muted/50 p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Semana:</span>
                  <span className="font-medium">{editingFact.numero_semana} / {editingFact.anio}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Monto a pagar:</span>
                  <span className="font-medium">{formatCurrency(editingFact.monto_factura)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Foto de la Boleta <span className="text-rose-500">*</span></Label>
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*,.pdf" onChange={(e) => setPaymentForm({...paymentForm, file: e.target.files?.[0] || null})} className="bg-background/50" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>N° de Boleta/Ref. <span className="text-rose-500">*</span></Label>
                  <Input value={paymentForm.no_boleta} onChange={e => setPaymentForm({...paymentForm, no_boleta: e.target.value})} placeholder="Ej. 1234567" className="bg-background/50" />
                </div>
                <div className="space-y-1">
                  <Label>Banco <span className="text-rose-500">*</span></Label>
                  <Input value={paymentForm.banco} onChange={e => setPaymentForm({...paymentForm, banco: e.target.value})} placeholder="Ej. Banrural" className="bg-background/50" />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Fecha de Pago <span className="text-rose-500">*</span></Label>
                <Input type="date" value={paymentForm.fecha_pago} onChange={e => setPaymentForm({...paymentForm, fecha_pago: e.target.value})} className="bg-background/50" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)} disabled={isLoading}>Cancelar</Button>
            <Button onClick={handlePayment} disabled={isLoading || (!paymentForm.file && !editingFact?.comprobante_url) || !paymentForm.no_boleta || !paymentForm.banco}>
              {isLoading ? 'Registrando...' : 'Confirmar Pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
