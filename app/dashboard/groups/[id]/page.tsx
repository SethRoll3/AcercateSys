'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/loading-spinner'
import { toast } from 'sonner'
import { ManageGroupModal } from '@/components/manage-group-modal'
import { usePermission } from '@/contexts/role-context'

interface ClientItem {
  id: string
  first_name: string
  last_name: string
  email: string | null
}

interface GroupRow {
  id: string
  nombre: string
  clients: ClientItem[]
}

export default function GroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const canEditGroups = usePermission('canEditGroups')
  const canDeleteGroups = usePermission('canDeleteGroups')
  const [group, setGroup] = useState<GroupRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`/api/grupos/${params.id}`, { credentials: 'include' })
        if (!res.ok) {
          setIsLoading(false)
          return
        }
        const data = await res.json()
        setGroup(data)
      } finally {
        setIsLoading(false)
      }
    }
    run()
  }, [params.id])

  const handleDelete = async () => {
    if (!group) return
    try {
      const res = await fetch(`/api/grupos/${group.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Grupo eliminado con éxito')
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
  if (!group) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Grupo no encontrado</p>
          <Button onClick={() => router.push('/dashboard/clients')} className="mt-4">Volver</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/clients?tab=groups')}>Volver</Button>
        <div className="flex items-center gap-2">
          {canEditGroups && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Editar</Button>
          )}
          {canDeleteGroups && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>Eliminar</Button>
          )}
        </div>
      </div>

      <Card className="transition-all duration-200">
        <CardHeader>
          <CardTitle>Información del Grupo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-lg font-semibold">{group.nombre}</div>
          <div className="text-sm text-muted-foreground">Integrantes: {group.clients.length}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {group.clients.map((c) => (
          <Card key={c.id} className="transition-all duration-200">
            <CardHeader>
              <CardTitle>{`${c.first_name} ${c.last_name}`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">Email: {c.email || 'Sin email'}</div>
              <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/clients/${c.id}`)}>Ver cliente</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <ManageGroupModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onGroupSaved={() => {
          setEditOpen(false)
          router.refresh()
        }}
        group={{ id: group.id, name: group.nombre, clients: group.clients as any }}
      />
    </div>
  )
}