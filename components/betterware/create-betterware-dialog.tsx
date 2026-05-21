'use client'

import type React from 'react'
import { useState, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Check, ChevronsUpDown, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface BetterwareCliente {
  id: string
  dpi: string
  nombres: string
  apellidos: string
  telefono?: string
  direccion?: string
  nit?: string
  fecha_nacimiento?: string
  email?: string
  gerente_zona?: string
}

interface CreateBetterwareDialogProps {
  clientes: BetterwareCliente[]
  onCreated: () => void
  onClientCreated?: () => void
}

export function CreateBetterwareDialog({ clientes, onCreated, onClientCreated }: CreateBetterwareDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [openClient, setOpenClient] = useState(false)
  const [activeTab, setActiveTab] = useState<'select' | 'create'>('select')

  // Solicitud form data
  const [formData, setFormData] = useState({
    cliente_id: '',
    id_referencia: '',
    score_credito: '',
    monto_solicitado: '',
    fecha_solicitud: new Date().toISOString().split('T')[0],
  })

  // New client form data
  const [newClient, setNewClient] = useState({
    dpi: '',
    nombres: '',
    apellidos: '',
    direccion: '',
    telefono: '',
    nit: '',
    fecha_nacimiento: '',
    email: '',
    gerente_zona: '',
  })

  const [isCreatingClient, setIsCreatingClient] = useState(false)

  const selectedCliente = useMemo(() => {
    return clientes.find(c => c.id === formData.cliente_id)
  }, [clientes, formData.cliente_id])

  const isStep1Valid = useMemo(() => {
    return formData.cliente_id && formData.monto_solicitado
  }, [formData.cliente_id, formData.monto_solicitado])

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount)
    if (!num) return 'Q 0.00'
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(num)
  }

  const handleCreateClient = async () => {
    if (!newClient.dpi || !newClient.nombres || !newClient.apellidos) {
      toast.error('DPI, nombres y apellidos son obligatorios')
      return
    }

    setIsCreatingClient(true)
    try {
      const res = await fetch('/api/betterware/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Error al crear cliente')
        return
      }

      const { data } = await res.json()
      // Auto-select the new client
      setFormData(prev => ({ ...prev, cliente_id: data.id }))
      setActiveTab('select')
      toast.success('Cliente Betterware creado y seleccionado')
      setNewClient({
        dpi: '', nombres: '', apellidos: '', direccion: '',
        telefono: '', nit: '', fecha_nacimiento: '', email: '', gerente_zona: '',
      })
      onClientCreated?.()
    } catch {
      toast.error('Error de red al crear cliente')
    } finally {
      setIsCreatingClient(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const res = await fetch('/api/betterware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setOpen(false)
        setStep(1)
        setFormData({
          cliente_id: '', id_referencia: '', score_credito: '',
          monto_solicitado: '', fecha_solicitud: new Date().toISOString().split('T')[0],
        })
        await new Promise(r => setTimeout(r, 1200))
        onCreated()
        toast.success('Solicitud Betterware creada con éxito')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear solicitud')
      }
    } catch {
      toast.error('Error de red al crear solicitud')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nueva Solicitud
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] bg-card border-border max-h-[85vh] overflow-y-auto pr-2">
        <DialogHeader>
          <DialogTitle className="text-foreground">Crear Solicitud Betterware</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Ingrese los detalles de la solicitud de crédito Betterware
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {step === 1 && (
            <>
              {/* Client selection / creation */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'select' | 'create')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="select">Seleccionar Cliente</TabsTrigger>
                  <TabsTrigger value="create" className="gap-1">
                    <UserPlus className="h-3.5 w-3.5" />
                    Crear Nuevo
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="select" className="space-y-4 mt-3">
                  <div className="space-y-2">
                    <Label className="text-foreground">Cliente Betterware</Label>
                    <Popover open={openClient} onOpenChange={setOpenClient}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openClient}
                          className="w-full justify-between bg-background/50"
                        >
                          {selectedCliente
                            ? `${selectedCliente.nombres} ${selectedCliente.apellidos} — ${selectedCliente.dpi}`
                            : "Seleccione un cliente"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[460px] p-0">
                        {openClient ? (
                          <Command>
                            <CommandInput placeholder="Buscar por nombre o DPI..." />
                            <CommandList>
                              <CommandEmpty>No se encontró el cliente.</CommandEmpty>
                              <CommandGroup>
                                {clientes.map((cliente) => (
                                  <CommandItem
                                    key={cliente.id}
                                    value={`${cliente.nombres} ${cliente.apellidos} ${cliente.dpi}`}
                                    onSelect={() => {
                                      setFormData({ ...formData, cliente_id: cliente.id })
                                      setOpenClient(false)
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.cliente_id === cliente.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div>
                                      <div className="font-medium">{cliente.nombres} {cliente.apellidos}</div>
                                      <div className="text-xs text-muted-foreground">DPI: {cliente.dpi}</div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {selectedCliente && (
                    <div className="rounded-lg border bg-card/50 p-3 space-y-1 text-sm">
                      <div className="font-medium text-foreground">{selectedCliente.nombres} {selectedCliente.apellidos}</div>
                      <div className="text-muted-foreground">DPI: {selectedCliente.dpi}</div>
                      {selectedCliente.telefono && <div className="text-muted-foreground">Tel: {selectedCliente.telefono}</div>}
                      {selectedCliente.direccion && <div className="text-muted-foreground">Dir: {selectedCliente.direccion}</div>}
                      {selectedCliente.gerente_zona && <div className="text-muted-foreground">Gerente Zona: {selectedCliente.gerente_zona}</div>}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="create" className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">DPI *</Label>
                      <Input
                        placeholder="DPI"
                        value={newClient.dpi}
                        onChange={(e) => setNewClient({ ...newClient, dpi: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">NIT</Label>
                      <Input
                        placeholder="NIT"
                        value={newClient.nit}
                        onChange={(e) => setNewClient({ ...newClient, nit: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Nombres *</Label>
                      <Input
                        placeholder="Nombres"
                        value={newClient.nombres}
                        onChange={(e) => setNewClient({ ...newClient, nombres: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Apellidos *</Label>
                      <Input
                        placeholder="Apellidos"
                        value={newClient.apellidos}
                        onChange={(e) => setNewClient({ ...newClient, apellidos: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-foreground text-xs">Dirección</Label>
                    <Input
                      placeholder="Dirección"
                      value={newClient.direccion}
                      onChange={(e) => setNewClient({ ...newClient, direccion: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Teléfono</Label>
                      <Input
                        placeholder="Teléfono"
                        value={newClient.telefono}
                        onChange={(e) => setNewClient({ ...newClient, telefono: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Fecha de Nacimiento</Label>
                      <Input
                        type="date"
                        value={newClient.fecha_nacimiento}
                        onChange={(e) => setNewClient({ ...newClient, fecha_nacimiento: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Email</Label>
                      <Input
                        type="email"
                        placeholder="Email"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Gerente de Zona</Label>
                      <Input
                        placeholder="Gerente de Zona"
                        value={newClient.gerente_zona}
                        onChange={(e) => setNewClient({ ...newClient, gerente_zona: e.target.value })}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={isCreatingClient || !newClient.dpi || !newClient.nombres || !newClient.apellidos}
                    className="w-full"
                  >
                    {isCreatingClient ? 'Creando...' : 'Crear Cliente y Seleccionar'}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Solicitud data */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label className="text-foreground">Monto Solicitado *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="5000.00"
                    value={formData.monto_solicitado}
                    onChange={(e) => setFormData({ ...formData, monto_solicitado: e.target.value })}
                    required
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Score Crediticio</Label>
                  <Input
                    type="number"
                    placeholder="750"
                    value={formData.score_credito}
                    onChange={(e) => setFormData({ ...formData, score_credito: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground">ID de Referencia</Label>
                  <Input
                    placeholder="Ref-001"
                    value={formData.id_referencia}
                    onChange={(e) => setFormData({ ...formData, id_referencia: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Fecha de Solicitud</Label>
                  <Input
                    type="date"
                    value={formData.fecha_solicitud}
                    onChange={(e) => setFormData({ ...formData, fecha_solicitud: e.target.value })}
                    className="bg-background/50"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="button" onClick={() => setStep(2)} disabled={!isStep1Valid}>
                  Siguiente
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2 text-sm text-muted-foreground">
                <h4 className="font-semibold text-foreground text-base">Resumen de Solicitud</h4>
                <div className="flex justify-between">
                  <span>Cliente</span>
                  <span className="font-medium text-foreground">
                    {selectedCliente ? `${selectedCliente.nombres} ${selectedCliente.apellidos}` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>DPI</span>
                  <span className="font-medium text-foreground">{selectedCliente?.dpi || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Monto Solicitado</span>
                  <span className="font-medium text-foreground">{formatCurrency(formData.monto_solicitado)}</span>
                </div>
                {formData.score_credito && (
                  <div className="flex justify-between">
                    <span>Score</span>
                    <span className="font-medium text-foreground">{formData.score_credito}</span>
                  </div>
                )}
                {formData.id_referencia && (
                  <div className="flex justify-between">
                    <span>ID Referencia</span>
                    <span className="font-medium text-foreground">{formData.id_referencia}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Fecha</span>
                  <span className="font-medium text-foreground">{formData.fecha_solicitud}</span>
                </div>
              </div>

              <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-500 border border-yellow-500/20">
                Nota: La solicitud se creará en estado "Pendiente". Los documentos, autorización y facturación se gestionan desde el detalle de la solicitud.
              </div>

              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>Anterior</Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Creando Solicitud...' : 'Confirmar y Crear'}
                </Button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
