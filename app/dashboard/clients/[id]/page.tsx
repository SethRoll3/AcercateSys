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
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Pencil, Trash2, Mail, Phone, PhoneCall, MapPin, UserCheck, Users, Eye, UserCircle } from 'lucide-react'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { CreateClientUserDialog } from '@/components/create-client-user-dialog'

interface Client {
  id: string
  first_name: string
  last_name: string
  email: string | null
  address: string | null
  phone: string | null
  emergency_phone: string | null
  gender?: string | null
  advisor_id?: string
  advisor_email?: string | null
  advisor_name?: string | null
  phone_country_code?: string | null
  group_id?: string | null
  group_name?: string | null
  status?: string
}

interface GroupDetails {
  id: string
  nombre: string
  clients: { id: string; first_name: string; last_name: string; email: string | null }[]
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
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeLoansCount, setActiveLoansCount] = useState(0)
  const [hasActiveUser, setHasActiveUser] = useState(false)
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [linkedUserStatus, setLinkedUserStatus] = useState<string | null>(null)
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createClient()
        const id = String(params.id)

        const { data: row, error } = await supabase
          .from('clients')
          .select('id, first_name, last_name, email, address, phone, phone_country_code, emergency_phone, advisor_id, group_id, status, gender')
          .eq('id', id)
          .single()

        if (error || !row) {
          setClient(null)
          return
        }

        // Fetch active/pending loans count
        const { count: loansCount } = await supabase
          .from('loans')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', id)
          .in('status', ['active', 'pending'])
        
        setActiveLoansCount(loansCount || 0)

        let advisorName: string | null = null
        let advisorEmail: string | null = null
        if (row.advisor_id) {
          const { data: advisor } = await supabase
            .from('users')
            .select('id, email, full_name')
            .eq('id', row.advisor_id)
            .single()
          advisorName = advisor?.full_name ?? null
          advisorEmail = advisor?.email ?? null
        }

        let groupName: string | null = null
        let fetchedGroup: GroupDetails | null = null
        if (row.group_id) {
          const res = await fetch(`/api/grupos/${row.group_id}`, { credentials: 'include' })
          if (res.ok) {
            const g = await res.json()
            groupName = g?.nombre ?? null
            fetchedGroup = {
              id: g.id,
              nombre: g.nombre,
              clients: Array.isArray(g.clients) ? g.clients.map((c: any) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email })) : []
            }
          }
        }

        setClient({
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          address: row.address,
          phone: row.phone,
          phone_country_code: row.phone_country_code,
          emergency_phone: row.emergency_phone,
          gender: row.gender ?? null,
          advisor_id: row.advisor_id,
          advisor_email: advisorEmail,
          advisor_name: advisorName,
          group_id: row.group_id,
          group_name: groupName,
          status: row.status,
        })
        setGroupDetails(fetchedGroup)

        if (row.email) {
          const { data: userRows } = await supabase
            .from('users')
            .select('id, status')
            .eq('email', row.email)
            .limit(1)
          const u = Array.isArray(userRows) && userRows[0] ? userRows[0] as { id: string; status?: string } : null
          const st = u?.status ?? null
          setLinkedUserStatus(st)
          setLinkedUserId(u?.id ?? null)
          setHasActiveUser(st === 'active')
        } else {
          setLinkedUserStatus(null)
          setLinkedUserId(null)
          setHasActiveUser(false)
        }
      } finally {
        setIsLoading(false)
      }
    }
    run()
  }, [params.id])

  const confirmDelete = async () => {
    if (!client) return
    setIsDeleting(true)
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
        setIsDeleting(false)
      }
    } catch {
      toast.error('No se pudo conectar con el servidor')
      setIsDeleting(false)
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
        <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/dashboard/clients')}>
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          {canEditClients && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
          {role && ['admin','asesor'].includes(role) && client.email && !hasActiveUser && (
            <Button variant="default" size="sm" className="gap-2" onClick={() => setIsCreateUserOpen(true)}>
              Crear Usuario
            </Button>
          )}
          {canDeleteClients && (
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="transition-all duration-200 hover:shadow-md bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Información del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <span className="font-semibold">
                  {`${client.first_name?.[0] ?? ''}${client.last_name?.[0] ?? ''}`.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold">{`${client.first_name} ${client.last_name}`}</div>
                <Badge variant={client.status === 'inactive' ? 'destructive' : 'secondary'}>
                  {client.status === 'inactive' ? 'Inactivo' : 'Activo'}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {client.email ? (
                  <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>
                ) : (
                  <span className="text-muted-foreground">Sin email</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <span>Usuario vinculado</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${linkedUserStatus === 'active' ? 'bg-green-100 text-green-700' : linkedUserStatus === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                  {linkedUserStatus === 'active' ? 'Activo' : linkedUserStatus === 'inactive' ? 'Inactivo' : 'No existe'}
                </span>
                {linkedUserId && (
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push(`/dashboard/users/${linkedUserId}`)}>
                    <Eye className="h-4 w-4" />
                    Ver usuario
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Género</span>
                <span>
                  {client.gender
                    ? (client.gender === 'hombre' ? 'Masculino' : 'Femenino')
                    : 'No especificado'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {client.phone ? (
                  <a href={`tel:${(client.phone_country_code || '')}${client.phone}`.replace(/\s+/g,'')} className="hover:underline">{client.phone}</a>
                ) : (
                  <span className="text-muted-foreground">Sin teléfono</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <PhoneCall className="h-4 w-4 text-muted-foreground" />
                <span>{client.emergency_phone || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{client.address || 'N/A'}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span>{client.advisor_name || 'Sin asesor'}</span>
              </div>
              {client.advisor_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${client.advisor_email}`} className="hover:underline">{client.advisor_email}</a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200 hover:shadow-md bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Grupo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">{client.group_name || 'Sin grupo'}</div>
            {groupDetails && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>Integrantes: {groupDetails.clients.length}</span>
                </div>
                <div className="space-y-1">
                  {groupDetails.clients.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UserCircle className="h-3 w-3" />
                      <span className="truncate">
                        {c.first_name} {c.last_name} {c.email ? `- ${c.email}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {client.group_id && (
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => router.push(`/dashboard/groups/${client.group_id}`)}>
                <Eye className="h-4 w-4" />
                Ver grupo
              </Button>
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

      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="¿Eliminar cliente?"
        description={activeLoansCount > 0 
          ? `Este cliente tiene ${activeLoansCount} préstamo(s) activo(s) o pendiente(s). Al eliminarlo, el cliente y sus préstamos pasarán a estado inactivo. Esta acción no se puede deshacer.`
          : "Esta acción no se puede deshacer. El cliente pasará a estado inactivo."}
        isDeleting={isDeleting}
      />

      <CreateClientUserDialog
        isOpen={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
        client={client}
        onUserCreated={() => {
          setHasActiveUser(true)
          setIsCreateUserOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}
