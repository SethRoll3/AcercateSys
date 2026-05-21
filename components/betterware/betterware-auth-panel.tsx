'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Plus, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

interface Props {
  solicitudId: string
  solicitud: any
  autorizaciones: any[]
  canManage: boolean
  onUpdate: () => void
}

export function BetterwareAuthPanel({ solicitudId, solicitud, autorizaciones, canManage, onUpdate }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({ score: '', clasificacion: '', monto_autorizado: '', resultado: 'pendiente', observaciones: '' })

  const handleSubmit = async () => {
    if (!form.resultado) { toast.error('Seleccione un resultado'); return }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/betterware/${solicitudId}/autorizacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('Autorización registrada')
        setIsOpen(false)
        setForm({ score: '', clasificacion: '', monto_autorizado: '', resultado: 'pendiente', observaciones: '' })
        onUpdate()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error')
      }
    } catch { toast.error('Error de red') }
    finally { setIsLoading(false) }
  }

  const resultConfig: Record<string, { variant: "default" | "destructive" | "outline"; label: string }> = {
    pendiente: { variant: "outline", label: "Pendiente" },
    aprobado: { variant: "default", label: "Aprobado" },
    rechazado: { variant: "destructive", label: "Rechazado" },
  }
  const formatCurrency = (n: number) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-foreground">Evaluación y Autorización</h3>
        {canManage && (
          <Button onClick={() => setIsOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Nueva Evaluación</Button>
        )}
      </div>

      {/* Current authorization status */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground block">Estado Actual</span><Badge variant={resultConfig[solicitud.status]?.variant || "outline"}>{resultConfig[solicitud.status]?.label || solicitud.status}</Badge></div>
            <div><span className="text-muted-foreground block">Score</span><span className="font-semibold text-foreground">{solicitud.score_credito || '—'}</span></div>
            <div><span className="text-muted-foreground block">Monto Autorizado</span><span className="font-semibold text-foreground">{formatCurrency(solicitud.monto_autorizado || 0)}</span></div>
            <div><span className="text-muted-foreground block">Evaluaciones</span><span className="font-semibold text-foreground">{autorizaciones.length}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-2">
        {autorizaciones.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No hay evaluaciones registradas</p>
        ) : autorizaciones.map((auth: any) => (
          <Card key={auth.id} className="border-border/50 bg-card/50">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <Badge variant={resultConfig[auth.resultado]?.variant || "outline"}>{resultConfig[auth.resultado]?.label || auth.resultado}</Badge>
                    {auth.clasificacion && <Badge variant="secondary">Clase: {auth.clasificacion}</Badge>}
                    {auth.score && <span className="text-sm text-muted-foreground">Score: {auth.score}</span>}
                  </div>
                  {auth.monto_autorizado && <p className="text-sm text-foreground">Monto: {formatCurrency(auth.monto_autorizado)}</p>}
                  {auth.observaciones && <p className="text-sm text-muted-foreground">{auth.observaciones}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(auth.created_at).toLocaleString('es-GT')}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New authorization dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader><DialogTitle>Nueva Evaluación Crediticia</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Score</Label><Input type="number" placeholder="750" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} className="bg-background/50" /></div>
              <div className="space-y-1"><Label>Clasificación</Label><Input placeholder="A, B, C" value={form.clasificacion} onChange={e => setForm({ ...form, clasificacion: e.target.value })} className="bg-background/50" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Monto Autorizado</Label><Input type="number" step="0.01" placeholder="5000" value={form.monto_autorizado} onChange={e => setForm({ ...form, monto_autorizado: e.target.value })} className="bg-background/50" /></div>
              <div className="space-y-1">
                <Label>Resultado</Label>
                <Select value={form.resultado} onValueChange={v => setForm({ ...form, resultado: v })}>
                  <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="aprobado">Aprobado</SelectItem>
                    <SelectItem value="rechazado">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Observaciones</Label><Textarea placeholder="Observaciones..." value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className="bg-background/50" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Registrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
