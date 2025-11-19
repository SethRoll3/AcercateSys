'use client'

import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRole, usePermission } from '@/contexts/role-context'
import { LoadingSpinner } from '@/components/loading-spinner'
import { Group } from '@/lib/types'

interface GroupsTableProps {
  searchTerm: string
  onEditGroup: (groupId: string) => void
  onDeleteGroup: (groupId: string) => void
}

export function GroupsTable({ searchTerm, onEditGroup, onDeleteGroup }: GroupsTableProps) {
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const { role } = useRole()
  const canEditGroups = usePermission('canEditGroups')
  const canDeleteGroups = usePermission('canDeleteGroups')

  const fetchGroups = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/grupos')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setGroups(data)
        } else {
          toast.error('La respuesta del servidor de grupos no es válida.')
          setGroups([])
        }
      } else {
        toast.error('Error al cargar los grupos')
        setGroups([])
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor de grupos. Inténtalo de nuevo.')
      setGroups([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchGroups()

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

  const filteredGroups = groups.filter(group => {
    const searchTermLower = searchTerm.toLowerCase()
    const matchesSearch = group.nombre.toLowerCase().includes(searchTermLower)

    if (role === 'asesor') {
      // Asesor only sees groups that contain at least one client assigned to them
      const advisorHasClientInGroup = group.clients.some(client => client.advisor_id === currentUserId)
      return matchesSearch && advisorHasClientInGroup
    }
    // Admin sees all groups
    return matchesSearch
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre del Grupo</TableHead>
          <TableHead>Número de Clientes</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredGroups.map((group) => (
          <TableRow key={group.id}>
            <TableCell>{group.nombre}</TableCell>
            <TableCell>{group.clients.length}</TableCell>
            <TableCell className="flex justify-end space-x-2">
              {canEditGroups && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditGroup(group.id)}
                >
                  Editar
                </Button>
              )}
              {canDeleteGroups && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDeleteGroup(group.id)}
                >
                  Eliminar
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}