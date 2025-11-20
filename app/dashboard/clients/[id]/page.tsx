'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EditClientForm } from '@/components/edit-client-form'
import { useRole, usePermission } from '@/contexts/role-context'
import { LoadingSpinner } from '@/components/loading-spinner'
import { toast } from 'sonner'

interface Client {
  id: string
  first_name: string
  last_name: string
  email: string | null
  address: string | null
  phone: string | null
  emergency_phone: string | null
  advisor_id?: string
  advisor_email?: string | null
  group_id?: string | null
  group_name?: string | null
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { role } = useRole()
  const canEditClients = usePermission('canEditClients')
  const canDeleteClients = usePermission('canDeleteClients')
  const [client, setClient] = useState<Client | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/clients', { credentials: 'include' })
        if (!res.ok) {
          setIsLoading(false)
          return
        }
        const data = await res.json()
        const id = String(params.id)
        const row = Array.isArray(data) ? data.find((c: any) => c.id === id) : null
        setClient(row || null)
      } finally {
        setIsLoading(false)
      }
    }
    run()
  }, [params.id])

  const handleDelete = async () => {
    if (!client) return
    try {
      const res = await fetch('/api/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id }),
      })
      if (res.ok) {
        toast.success('Cliente eliminado con éxito')
        router.push('/dashboard/clients')
      } else {
        const err = await res.json()
        toast.error(err?.error || 'Error al eliminar')
      }
    } catch {
      toast.error('No se pudo conectar con el servidor')
    }
  }

  if (isLoading) return <LoadingSpinner />
  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Cliente no encontrado</p>
          <Button onClick={() => router.push('/dashboard/clients')} className="mt-4">Volver</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/clients')}>Volver</Button>
        <div className="flex items-center gap-2">
          {canEditClients && (
            <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>Editar</Button>
          )}
          {canDeleteClients && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>Eliminar</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="transition-all duration-200">
          <CardHeader>
            <CardTitle>Información del Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-lg font-semibold">{`${client.first_name} ${client.last_name}`}</div>
            <div className="text-sm text-muted-foreground">Email: {client.email || 'Sin email'}</div>
            <div className="text-sm text-muted-foreground">Teléfono: {client.phone || 'Sin teléfono'}</div>
            <div className="text-sm text-muted-foreground">Teléfono de emergencia: {client.emergency_phone || 'N/A'}</div>
            <div className="text-sm text-muted-foreground">Dirección: {client.address || 'N/A'}</div>
            <div className="text-sm text-muted-foreground">Asesor: {client.advisor_email || 'Sin asesor'}</div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200">
          <CardHeader>
            <CardTitle>Grupo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">{client.group_name || 'Sin grupo'}</div>
            {client.group_id && (
              <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/groups/${client.group_id}`)}>Ver grupo</Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <EditClientForm
            client={client as any}
            onClose={() => setIsEditOpen(false)}
            onSuccess={() => {
              setIsEditOpen(false)
              router.refresh()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}