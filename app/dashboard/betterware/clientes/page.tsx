'use client'

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import {
  Users, Search, Plus, Pencil, Trash2, UserPlus, Phone, Mail, MapPin, Calendar, CreditCard, Eye
} from "lucide-react"
import { toast } from "sonner"
import { useRole } from "@/contexts/role-context"

interface BetterwareCliente {
  id: string
  dpi: string
  nombres: string
  apellidos: string
  direccion?: string
  telefono?: string
  nit?: string
  fecha_nacimiento?: string
  email?: string
  gerente_zona?: string
  observaciones?: string
  created_at: string
}

const CACHE_KEY = 'bw:clientes:list'

export default function BetterwareClientesPage() {
  const [clientes, setClientes] = useState<BetterwareCliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingClient, setEditingClient] = useState<BetterwareCliente | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [detailClient, setDetailClient] = useState<BetterwareCliente | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { role } = useRole()
  const inFlightRef = useRef(false)

  const [formData, setFormData] = useState({
    dpi: '', nombres: '', apellidos: '', direccion: '',
    telefono: '', nit: '', fecha_nacimiento: '', email: '', gerente_zona: '', observaciones: '',
  })

  const resetForm = () => setFormData({
    dpi: '', nombres: '', apellidos: '', direccion: '',
    telefono: '', nit: '', fecha_nacimiento: '', email: '', gerente_zona: '', observaciones: '',
  })

  const fetchClientes = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/betterware/clientes')
      if (res.ok) {
        const data = await res.json()
        setClientes(data || [])
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
        } catch {}
      }
    } catch (e) {
      console.error('[bw-clientes] fetch error:', e)
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY)
      if (raw) {
        const obj = JSON.parse(raw)
        if (obj?.data) { setClientes(obj.data); setIsLoading(false) }
      }
    } catch {}
    fetchClientes()
    const onFocus = () => fetchClientes()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchClientes])

  const handleCreate = async () => {
    if (!formData.dpi || !formData.nombres || !formData.apellidos) {
      toast.error('DPI, Nombres y Apellidos son obligatorios')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/betterware/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        toast.success('Cliente creado exitosamente')
        setIsCreateOpen(false)
        resetForm()
        await fetchClientes()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear cliente')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editingClient) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/betterware/clientes?id=${editingClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        toast.success('Cliente actualizado')
        setIsEditOpen(false)
        resetForm()
        setEditingClient(null)
        await fetchClientes()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al actualizar')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (clientId: string) => {
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return
    try {
      const res = await fetch(`/api/betterware/clientes?id=${clientId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Cliente eliminado')
        await fetchClientes()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al eliminar')
      }
    } catch {
      toast.error('Error de red')
    }
  }

  const openEdit = (client: BetterwareCliente) => {
    setEditingClient(client)
    setFormData({
      dpi: client.dpi || '', nombres: client.nombres || '', apellidos: client.apellidos || '',
      direccion: client.direccion || '', telefono: client.telefono || '', nit: client.nit || '',
      fecha_nacimiento: client.fecha_nacimiento || '', email: client.email || '',
      gerente_zona: client.gerente_zona || '', observaciones: client.observaciones || '',
    })
    setIsEditOpen(true)
  }

  const filteredClientes = clientes.filter(c => {
    const term = searchTerm.toLowerCase()
    return (
      c.nombres.toLowerCase().includes(term) ||
      c.apellidos.toLowerCase().includes(term) ||
      c.dpi.toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.telefono || '').includes(term)
    )
  })

  const canManage = ['admin', 'asesor', 'betterware_supervisor'].includes(role || '')

  if (isLoading) return <LoadingSpinner />

  const ClientFormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-foreground text-xs">DPI *</Label>
          <Input placeholder="DPI" value={formData.dpi} onChange={(e) => setFormData({ ...formData, dpi: e.target.value })} className="bg-background/50" />
        </div>
        <div className="space-y-1">
          <Label className="text-foreground text-xs">NIT</Label>
          <Input placeholder="NIT" value={formData.nit} onChange={(e) => setFormData({ ...formData, nit: e.target.value })} className="bg-background/50" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Nombres *</Label>
          <Input placeholder="Nombres" value={formData.nombres} onChange={(e) => setFormData({ ...formData, nombres: e.target.value })} className="bg-background/50" />
        </div>
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Apellidos *</Label>
          <Input placeholder="Apellidos" value={formData.apellidos} onChange={(e) => setFormData({ ...formData, apellidos: e.target.value })} className="bg-background/50" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-foreground text-xs">Dirección</Label>
        <Input placeholder="Dirección" value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} className="bg-background/50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Teléfono</Label>
          <Input placeholder="Teléfono" value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} className="bg-background/50" />
        </div>
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Fecha de Nacimiento</Label>
          <Input type="date" value={formData.fecha_nacimiento} onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })} className="bg-background/50" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Email</Label>
          <Input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="bg-background/50" />
        </div>
        <div className="space-y-1">
          <Label className="text-foreground text-xs">Gerente de Zona</Label>
          <Input placeholder="Gerente de Zona" value={formData.gerente_zona} onChange={(e) => setFormData({ ...formData, gerente_zona: e.target.value })} className="bg-background/50" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-foreground text-xs">Observaciones</Label>
        <Input placeholder="Observaciones" value={formData.observaciones} onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })} className="bg-background/50" />
      </div>
    </div>
  )

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Clientes Betterware
          </h2>
          <p className="text-muted-foreground text-sm">
            Gestión de clientes del módulo Betterware
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm() }}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary hover:bg-primary/90">
                  <UserPlus className="h-4 w-4" />
                  Nuevo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[540px] bg-card border-border max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Crear Cliente Betterware</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Ingrese la información del nuevo cliente
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4">
                  <ClientFormFields />
                  <Button onClick={handleCreate} disabled={isSaving} className="w-full mt-4">
                    {isSaving ? 'Creando...' : 'Crear Cliente'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, DPI, teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-background/50"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="border-border/50 bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">Total Clientes</div>
            <div className="text-2xl font-bold text-foreground">{clientes.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">Con Email</div>
            <div className="text-2xl font-bold text-emerald-500">{clientes.filter(c => c.email).length}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-amber-500/10 to-amber-500/5 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">Con Teléfono</div>
            <div className="text-2xl font-bold text-amber-500">{clientes.filter(c => c.telefono).length}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">Resultados</div>
            <div className="text-2xl font-bold text-cyan-500">{filteredClientes.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Client list */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">DPI</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Teléfono</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Gerente Zona</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Registro</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'No se encontraron clientes con ese criterio' : 'No hay clientes registrados'}
                    </td>
                  </tr>
                ) : (
                  filteredClientes.map(client => (
                    <tr key={client.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{client.nombres} {client.apellidos}</div>
                        {client.email && <div className="text-xs text-muted-foreground">{client.email}</div>}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{client.dpi}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{client.telefono || '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{client.gerente_zona || '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell text-xs">
                        {new Date(client.created_at).toLocaleDateString('es-GT')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => { setDetailClient(client); setIsDetailOpen(true) }}
                            className="h-8 w-8 p-0"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(client)} className="h-8 w-8 p-0">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {role === 'admin' && (
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)} className="h-8 w-8 p-0 text-rose-500 hover:text-rose-400">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[480px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Detalle del Cliente</DialogTitle>
          </DialogHeader>
          {detailClient && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">DPI:</span>
                <span className="font-medium text-foreground">{detailClient.dpi}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Nombre:</span>
                <span className="font-medium text-foreground">{detailClient.nombres} {detailClient.apellidos}</span>
              </div>
              {detailClient.nit && (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">NIT:</span>
                  <span className="font-medium text-foreground">{detailClient.nit}</span>
                </div>
              )}
              {detailClient.direccion && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Dirección:</span>
                  <span className="font-medium text-foreground">{detailClient.direccion}</span>
                </div>
              )}
              {detailClient.telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Teléfono:</span>
                  <span className="font-medium text-foreground">{detailClient.telefono}</span>
                </div>
              )}
              {detailClient.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium text-foreground">{detailClient.email}</span>
                </div>
              )}
              {detailClient.fecha_nacimiento && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Nacimiento:</span>
                  <span className="font-medium text-foreground">{new Date(detailClient.fecha_nacimiento).toLocaleDateString('es-GT')}</span>
                </div>
              )}
              {detailClient.gerente_zona && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Gerente Zona:</span>
                  <span className="font-medium text-foreground">{detailClient.gerente_zona}</span>
                </div>
              )}
              {detailClient.observaciones && (
                <div className="pt-2 border-t border-border/50">
                  <span className="text-muted-foreground text-xs">Observaciones:</span>
                  <p className="text-foreground mt-1">{detailClient.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { resetForm(); setEditingClient(null) } }}>
        <DialogContent className="sm:max-w-[540px] bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Cliente</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Modifique la información del cliente
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <ClientFormFields />
            <Button onClick={handleEdit} disabled={isSaving} className="w-full mt-4">
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
