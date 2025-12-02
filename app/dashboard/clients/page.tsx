'use client'

import { CreateClientForm } from '@/components/create-client-form'
import { EditClientForm } from '@/components/edit-client-form'
import { CreateClientUserDialog } from '@/components/create-client-user-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from "@/components/ui/badge";
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useRole, usePermission } from '@/contexts/role-context'
//import { CreateGroupModal } from '@/components/create-group-modal';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ManageGroupModal } from '@/components/manage-group-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupsTable } from '@/components/groups-table';
import type { Client as DomainClient } from '@/lib/types'
import { useSearchParams } from 'next/navigation'

type Client = DomainClient & {
  address: string
  emergency_phone: string
  advisor_email?: string
  group_name?: string
}

type SelectedGroup = {
  id: string
  name: string
  clients: DomainClient[]
}

export default function ClientsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') || 'clients') as 'clients' | 'groups'
  const [clients, setClients] = useState<Client[]>([])
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false); // New state for edit group modal
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null); // Selected group mapped to expected shape
  const [selectedClientForUser, setSelectedClientForUser] = useState<Client | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [existingUserEmails, setExistingUserEmails] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false); // State for CreateClientForm modal
  
  const { role } = useRole()
  const canCreateClients = usePermission('canCreateClients')
  const canCreateGroups = usePermission('canCreateGroups');
  const canEditClients = usePermission('canEditClients')
  const canDeleteClients = usePermission('canDeleteClients')
  const canEditGroups = usePermission('canEditGroups'); // New permission for editing groups
  const canDeleteGroups = usePermission('canDeleteGroups'); // New permission for deleting groups

  const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER
  const readCache = (key: string) => {
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) return null
      const obj = JSON.parse(raw)
      if (!obj || typeof obj.ts !== 'number') return null
      if (Date.now() - obj.ts > CACHE_TTL_MS) return null
      return obj.data ?? null
    } catch {}
    return null
  }
  const writeCache = (key: string, data: any) => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    } catch {}
  }

  const K = {
    clients: 'clients:list',
    userEmails: 'clients:userEmails',
  }

  const fetchClients = async () => {
    // Don't set isLoading(true) if we already have data (from cache or previous fetch) to avoid flickering
    // But if we have no data, we might want to show spinner if cache miss.
    // actually, we handle cache reading in useEffect.
    // Here we just fetch and update.
    try {
      const res = await fetch('/api/clients')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setClients(data)
          writeCache(K.clients, data)
        } else {
          toast.error('La respuesta del servidor no es válida.')
          setClients([])
        }
      } else {
        toast.error('Error al cargar los clientes')
        setClients([])
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor. Inténtalo de nuevo.')
      setClients([])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchExistingUserEmails = async () => {
    try {
      const response = await fetch('/api/users?emailsOnly=true')
      if (response.ok) {
        const users: { email: string }[] = await response.json()
        const emails = new Set(users.map((user) => user.email.toLowerCase()))
        setExistingUserEmails(emails)
        writeCache(K.userEmails, Array.from(emails))
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const clientHasUser = (client: Client) => {
    if (!client.email) {
      return false
    }
    const hasUser = existingUserEmails.has(client.email.toLowerCase())
    console.log(`Cliente ${client.first_name} ${client.last_name} (${client.email}) - Tiene usuario: ${hasUser}`)
    console.log('Emails existentes:', Array.from(existingUserEmails))
    return hasUser
  }

  useEffect(() => {
    const cachedClients = readCache(K.clients)
    if (cachedClients) {
      setClients(cachedClients)
      setIsLoading(false)
    } else {
      setIsLoading(true)
      fetchClients()
    }

    const cachedEmails = readCache(K.userEmails)
    if (cachedEmails) {
      setExistingUserEmails(new Set(cachedEmails))
    } else {
      fetchExistingUserEmails()
    }
    
    // Obtener el userId actual
    const fetchCurrentUser = async () => {
      try {
        const res = await fetch('/api/auth/user')
        const userData = await res.json()
        setCurrentUserId(userData.id)
      } catch (error) {
        console.error('Error al obtener usuario actual:', error)
      }
    }
    
    fetchCurrentUser()
  }, [])

  const handleEditClick = (client: Client) => {
    setSelectedClient(client)
    setIsEditModalOpen(true)
  }

  const handleDeleteClick = async (clientId: string) => {
    try {
      const response = await fetch('/api/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId }),
      })

      if (response.ok) {
        fetchClients()
        toast.success('Cliente eliminado con éxito')
      } else {
        const errorData = await response.json()
        toast.error(`Error al eliminar el cliente: ${errorData.error || errorData.message || 'Error desconocido'}`)
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor. Inténtalo de nuevo.')
    }
  }

  const handleEditGroupClick = async (groupId: string) => {
    try {
      const response = await fetch(`/api/grupos/${groupId}`);
      if (response.ok) {
        const groupData = await response.json();
        setSelectedGroup({ id: groupData.id, name: groupData.nombre ?? groupData.name ?? '', clients: (groupData.clients || []) as DomainClient[] });
        setIsEditGroupModalOpen(true);
      } else {
        toast.error('Error al cargar los datos del grupo para edición.');
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor para obtener los datos del grupo.');
    }
  };

  const handleDeleteGroupClick = async (groupId: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este grupo? Esta acción no se puede deshacer.')) {
      return;
    }
    try {
      const response = await fetch(`/api/grupos/${groupId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Grupo eliminado con éxito');
        fetchClients(); // Refresh clients to reflect group changes
      } else {
        const errorData = await response.json();
        toast.error(`Error al eliminar el grupo: ${errorData.error || errorData.message || 'Error desconocido'}`);
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor para eliminar el grupo.');
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;}

  const handleCreateUserClick = (client: Client) => {
    // Verificar permisos: admin puede crear para cualquier cliente, asesor solo para sus clientes
    if (role === 'admin' || (role === 'asesor' && client.advisor_id === currentUserId)) {
      setSelectedClientForUser(client)
      setIsCreateUserModalOpen(true)
    } else {
      toast.error('No tienes permisos para crear usuarios para este cliente')
    }
  }

  const handleCloseCreateUserModal = () => {
    setIsCreateUserModalOpen(false)
    setSelectedClientForUser(null)
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setSelectedClient(null)
  }

  const filteredClients = clients.filter(client => {
    const searchTermLower = searchTerm.toLowerCase();
    return (
      client.first_name.toLowerCase().includes(searchTermLower) ||
      client.last_name.toLowerCase().includes(searchTermLower) ||
      (client.email && client.email.toLowerCase().includes(searchTermLower)) ||
      (client.group_name && client.group_name.toLowerCase().includes(searchTermLower))
    );
  });

  return (
    <>
      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="grid w-fit grid-cols-2">
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
        </TabsList>
        <TabsContent value="clients" forceMount>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="space-y-2">
              <CardTitle>Clientes</CardTitle>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <Input
                  placeholder="Buscar cliente o grupo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full md:max-w-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {canCreateClients && (
                    <Button onClick={() => setIsCreateClientModalOpen(true)}>+ Nuevo Cliente</Button>
                  )}
                  {canCreateGroups && (
                    <Button onClick={() => setIsCreateGroupModalOpen(true)}>Crear Grupo</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredClients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between rounded-md border bg-card/50 backdrop-blur-sm px-4 py-3 transition-all duration-200 hover:bg-muted/40">
                    <div className="font-medium">{`${client.first_name} ${client.last_name}`}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                    >
                      Ver detalles
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="groups" forceMount>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="space-y-2">
              <CardTitle>Grupos</CardTitle>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <Input
                  placeholder="Buscar grupo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full md:max-w-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {canCreateGroups && (
                    <Button onClick={() => setIsCreateGroupModalOpen(true)}>Crear Grupo</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <GroupsTable
                searchTerm={searchTerm}
                onEditGroup={handleEditGroupClick}
                onDeleteGroup={handleDeleteGroupClick}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para crear usuario-cliente */}
      <CreateClientUserDialog
        isOpen={isCreateUserModalOpen}
        onClose={handleCloseCreateUserModal}
        client={selectedClientForUser}
        onUserCreated={() => {
          fetchExistingUserEmails()
          fetchClients()
        }}
      />

      <ManageGroupModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onGroupSaved={fetchClients}
      />

      <ManageGroupModal
        isOpen={isEditGroupModalOpen}
        onClose={() => setIsEditGroupModalOpen(false)}
        onGroupSaved={fetchClients}
        group={selectedGroup || undefined}
      />

      {/* Modal para editar cliente */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Modifica los detalles del cliente seleccionado.
            </DialogDescription>
          </DialogHeader>
          {selectedClient && (
            <EditClientForm
              client={selectedClient}
              onClose={handleCloseEditModal}
              onSuccess={() => {
                fetchClients()
                handleCloseEditModal()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para crear cliente */}
      <CreateClientForm
        isOpen={isCreateClientModalOpen}
        onClose={() => setIsCreateClientModalOpen(false)}
        onClientAdded={fetchClients}
      />
    </>
  )
}