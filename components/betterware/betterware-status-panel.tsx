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
import { Switch } from "@/components/ui/switch"
import { Shield, ShieldAlert, ShieldOff, ArrowRight, Lock } from "lucide-react"
import { toast } from "sonner"

interface Props {
  solicitudId: string
  solicitud: any
  estadosLog: any[]
  canManage: boolean
  onUpdate: () => void
}

const ESTADO_CONFIG: Record<string, { icon: any; className: string; label: string }> = {
  habilitado: { icon: Shield, className: "text-emerald-500", label: "Habilitado" },
  despacho_detenido: { icon: ShieldAlert, className: "text-amber-500", label: "Despacho Detenido" },
  bloqueado: { icon: ShieldOff, className: "text-rose-500", label: "Bloqueado" },
}

export function BetterwareStatusPanel({ solicitudId, solicitud, estadosLog, canManage, onUpdate }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({ estado_nuevo: '', motivo: '', requiere_excepcion: false, supervisor_password: '' })

  const currentEstado = ESTADO_CONFIG[solicitud.estado_asociado] || { icon: Shield, className: "", label: solicitud.estado_asociado }
  const CurrentIcon = currentEstado.icon

  const handleSubmit = async () => {
    if (!form.estado_nuevo || !form.motivo) { toast.error('Estado y motivo son obligatorios'); return }
    if (form.requiere_excepcion && !form.supervisor_password) { toast.error('Ingrese su contraseña para aplicar la excepción'); return }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/betterware/${solicitudId}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success(`Estado cambiado a ${form.estado_nuevo.replace('_', ' ')}`)
        setIsOpen(false)
        setForm({ estado_nuevo: '', motivo: '', requiere_excepcion: false, supervisor_password: '' })
        onUpdate()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al cambiar estado')
      }
    } catch { toast.error('Error de red') }
    finally { setIsLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-foreground">Estado del Asociado</h3>
        {canManage && (
          <Button onClick={() => setIsOpen(true)} variant="outline" className="gap-2 bg-transparent"><Shield className="h-4 w-4" />Cambiar Estado</Button>
        )}
      </div>

      {/* Current state */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-4 flex items-center gap-4">
          <div className={`p-3 rounded-full bg-card border ${currentEstado.className}`}><CurrentIcon className="h-8 w-8" /></div>
          <div>
            <h4 className={`text-lg font-bold ${currentEstado.className}`}>{currentEstado.label}</h4>
            <p className="text-sm text-muted-foreground">Estado operativo actual del asociado</p>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <h4 className="text-sm font-semibold text-muted-foreground">Historial de Cambios</h4>
      <div className="space-y-2">
        {estadosLog.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">Sin cambios de estado registrados</p>
        ) : estadosLog.map((log: any) => {
          const prev = ESTADO_CONFIG[log.estado_anterior] || { label: log.estado_anterior, className: "" }
          const next = ESTADO_CONFIG[log.estado_nuevo] || { label: log.estado_nuevo, className: "" }
          return (
            <Card key={log.id} className="border-border/50 bg-card/50">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline">{prev.label}</Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="outline" className={next.className === 'text-rose-500' ? 'border-rose-500/30 text-rose-500' : next.className === 'text-amber-500' ? 'border-amber-500/30 text-amber-500' : 'border-emerald-500/30 text-emerald-500'}>{next.label}</Badge>
                  {log.requiere_excepcion && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />Excepción</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(log.created_at).toLocaleString('es-GT')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{log.motivo}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Change state dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader><DialogTitle>Cambiar Estado del Asociado</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Nuevo Estado</Label>
              <Select value={form.estado_nuevo} onValueChange={v => setForm({ ...form, estado_nuevo: v })}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Seleccione estado" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADO_CONFIG).filter(([k]) => k !== solicitud.estado_asociado).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Motivo *</Label><Textarea placeholder="Motivo del cambio..." value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} className="bg-background/50" /></div>
            <div className="flex items-center gap-3 rounded-lg border border-border/50 p-3">
              <Switch checked={form.requiere_excepcion} onCheckedChange={v => setForm({ ...form, requiere_excepcion: v })} />
              <div><Label className="cursor-pointer">Aplicar como excepción</Label><p className="text-xs text-muted-foreground">Requiere re-autenticación con su contraseña</p></div>
            </div>
            {form.requiere_excepcion && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Contraseña de Supervisor</Label>
                <Input type="password" placeholder="Ingrese su contraseña" value={form.supervisor_password} onChange={e => setForm({ ...form, supervisor_password: e.target.value })} className="bg-background/50" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>{isLoading ? 'Procesando...' : 'Cambiar Estado'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
