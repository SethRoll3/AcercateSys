'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EditUserForm } from '@/components/forms/edit-user-form'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Pencil, Ban, Mail, User as UserIcon, Shield, Calendar, Loader2, Eye } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface User {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
  status?: string
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isInactivateDialogOpen, setIsInactivateDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasLinkedClient, setHasLinkedClient] = useState(false)
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null)

  const fetchUser = async () => {
    try {
      const supabase = createClient()
      const id = String(params.id)

      const { data: row, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at, status')
        .eq('id', id)
        .single()

      if (error || !row) {
        setUser(null)
        return
      }

      setUser(row as User)

      if (row?.email) {
        const { data: clientRows } = await supabase
          .from('clients')
          .select('id')
          .eq('email', row.email)
          .limit(1)
        const exists = Array.isArray(clientRows) && clientRows[0] ? true : false
        setHasLinkedClient(exists)
        setLinkedClientId(exists ? (clientRows as any)[0].id : null)
      } else {
        setHasLinkedClient(false)
        setLinkedClientId(null)
      }
    } catch (error) {
      console.error('Error fetching user:', error)
      toast.error('Error al cargar usuario')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [params.id])

  const inactivateUserOnly = async () => {
    if (!user) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Usuario inactivado con éxito')
        router.push('/dashboard/users')
      } else {
        const err = await res.json()
        toast.error(err?.error || 'Error al eliminar')
        setIsProcessing(false)
      }
    } catch {
      toast.error('No se pudo conectar con el servidor')
      setIsProcessing(false)
    }
  }

  const inactivateUserAndClient = async () => {
    if (!user) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/users?id=${user.id}&cascadeClient=true`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Usuario y cliente inactivados con éxito')
        router.push('/dashboard/users')
      } else {
        const err = await res.json()
        toast.error(err?.error || 'Error al inactivar')
        setIsProcessing(false)
      }
    } catch {
      toast.error('No se pudo conectar con el servidor')
      setIsProcessing(false)
    }
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador'
      case 'asesor': return 'Asesor'
      case 'cliente': return 'Cliente'
      default: return role
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Usuario no encontrado</p>
          <Button onClick={() => router.push('/dashboard/users')} className="mt-4">Volver</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/dashboard/users')}>
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="destructive" size="sm" className="gap-2" onClick={() => setIsInactivateDialogOpen(true)}>
            <Ban className="h-4 w-4" />
            Inactivar
          </Button>
        </div>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm transition-all duration-200 hover:shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Información del Usuario
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <span className="font-semibold">
                {user.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">{user.full_name}</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${user.email}`} className="hover:underline">{user.email}</a>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Cliente vinculado</span>
              {hasLinkedClient && linkedClientId ? (
                <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push(`/dashboard/clients/${linkedClientId}`)}>
                  <Eye className="h-4 w-4" />
                  Ver cliente
                </Button>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">No existe</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span>{getRoleDisplayName(user.role)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Estado</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${user.status === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {user.status === 'inactive' ? 'Inactivo' : 'Activo'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Registrado el {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <EditUserForm
        user={user}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onUserUpdated={() => {
          fetchUser()
          setIsEditOpen(false)
        }}
      />

      <AlertDialog open={isInactivateDialogOpen} onOpenChange={setIsInactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Inactivar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasLinkedClient
                ? 'Puedes inactivar solo el usuario o también inactivar al cliente vinculado por el mismo correo (y sus préstamos activos/pendientes).'
                : 'Este usuario no tiene un cliente vinculado por el mismo correo. Solo se inactivará el usuario.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); inactivateUserOnly(); }} disabled={isProcessing} className="bg-muted text-foreground hover:bg-muted/80">
              {isProcessing ? 'Procesando...' : 'Solo usuario'}
            </AlertDialogAction>
            {hasLinkedClient && (
              <AlertDialogAction onClick={(e) => { e.preventDefault(); inactivateUserAndClient(); }} disabled={isProcessing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isProcessing ? 'Procesando...' : 'Usuario y cliente'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
