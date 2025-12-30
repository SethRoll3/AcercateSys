'use client'

import type React from 'react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useRole, usePermission } from '@/contexts/role-context'
import { createClient } from '@/lib/supabase/client'
import { PhoneInput } from '@/components/phone-input'
import type { Client } from '@/lib/types'



interface Advisor {
  id: string
  email: string
  full_name: string
  role: string
}

interface EditClientFormProps {
  client: Client
  onClose?: () => void
  onClientUpdated?: () => void
  onSuccess?: () => void
}

export function EditClientForm({ client, onClose, onClientUpdated, onSuccess }: EditClientFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [formData, setFormData] = useState({
    first_name: client.first_name,
    last_name: client.last_name,
    email: client.email || '',
    address: client.address || '',
    phone: client.phone || '',
    phone_country_code: client.phone_country_code || '+502',
    emergency_phone: client.emergency_phone || '',
    advisor_id: client.advisor_id || 'none',
    gender: client.gender || '',
  })
  
  const { role, permissions } = useRole()
  const canAssignAdvisor = permissions?.canAssignAdvisors || role === 'asesor'

  useEffect(() => {
    const fetchUserAndAdvisors = async () => {
      if (canAssignAdvisor) {
        try {
          const supabase = createClient()
          
          // Obtener el usuario actual
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            setCurrentUserId(user.id)
          }

          // Obtener lista de asesores (solo para admin)
          if (role === 'admin') {
            const { data: advisorsData, error } = await supabase
              .from('users')
              .select('id, email, full_name, role')
              .in('role', ['asesor', 'admin'])
              .order('full_name')

            if (error) {
              console.error('Error fetching advisors:', error)
            } else {
              setAdvisors(advisorsData || [])
            }
          }
        } catch (error) {
          console.error('Error fetching user and advisors:', error)
        }
      }
    }

    fetchUserAndAdvisors()
  }, [canAssignAdvisor, role])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Preparar los datos, convirtiendo "none" a cadena vacía para advisor_id
      const submitData = {
        ...formData,
        advisor_id: formData.advisor_id === 'none' ? '' : formData.advisor_id,
        id: client.id
      }
      if (!submitData.gender) {
        setIsLoading(false)
        toast.error('Seleccione el género del cliente')
        return
      }

      const response = await fetch('/api/clients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      })

      if (response.ok) {
        onClientUpdated?.()
        onSuccess?.()
        onClose?.()
        toast.success('Cliente actualizado con éxito')
      } else {
        const errorData = await response.json()
        toast.error(`Error al actualizar el cliente: ${errorData.message}`)
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor. Inténtalo de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="flex gap-4">
        <div className="space-y-2 w-1/2">
          <Label htmlFor="first_name" className="text-foreground">
            Nombre
          </Label>
          <Input
            id="first_name"
            placeholder="Juan"
            value={formData.first_name}
            onChange={(e) =>
              setFormData({ ...formData, first_name: e.target.value })
            }
            required
            className="bg-background/50"
          />
        </div>
        <div className="space-y-2 w-1/2">
          <Label htmlFor="last_name" className="text-foreground">
            Apellido
          </Label>
          <Input
            id="last_name"
            placeholder="Pérez"
            value={formData.last_name}
            onChange={(e) =>
              setFormData({ ...formData, last_name: e.target.value })
            }
            required
            className="bg-background/50"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="gender" className="text-foreground">
          Género
        </Label>
        <Select
          value={formData.gender}
          onValueChange={(value) => setFormData({ ...formData, gender: value })}
        >
          <SelectTrigger className="bg-background/50">
            <SelectValue placeholder="Seleccione género *" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hombre">Masculino</SelectItem>
            <SelectItem value="mujer">Femenino</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-foreground">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="cliente@ejemplo.com"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
          required
          className="bg-background/50"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address" className="text-foreground">
          Dirección
        </Label>
        <Input
          id="address"
          placeholder="123 Calle Falsa, Springfield"
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
          required
          className="bg-background/50"
        />
      </div>
      <div className="flex gap-4">
        <div className="space-y-2 w-1/2">
          <Label htmlFor="phone" className="text-foreground">
            Teléfono
          </Label>
          <PhoneInput
            value={formData.phone}
            countryDialCode={formData.phone_country_code || '+502'}
            onChange={(local, code) => setFormData({ ...formData, phone: local, phone_country_code: code })}
          />
        </div>
        <div className="space-y-2 w-1/2">
          <Label htmlFor="emergency_phone" className="text-foreground">
            Teléfono de Emergencia
          </Label>
          <PhoneInput
            value={formData.emergency_phone}
            countryDialCode={formData.phone_country_code || '+502'}
            onChange={(local) => setFormData({ ...formData, emergency_phone: local })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="advisor_id" className="text-foreground">
          Asesor Asignado
        </Label>
        {role === 'asesor' ? (
          <Input
            value={
              currentUserId === client.advisor_id 
                ? "Auto-asignado (Usted)" 
                : client.advisor_id 
                  ? `Asignado a: ${advisors.find(a => a.id === client.advisor_id)?.full_name || 'Asesor desconocido'}${advisors.find(a => a.id === client.advisor_id)?.role === 'admin' ? ' (Administrador)' : ''}`
                  : "Sin asesor asignado"
            }
            disabled
            className="bg-background/50 text-muted-foreground"
          />
        ) : role === 'admin' ? (
          <div className="space-y-1">
            <Select
              value={formData.advisor_id}
              onValueChange={(value) =>
                setFormData({ ...formData, advisor_id: value })
              }
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Seleccione un asesor (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asesor asignado</SelectItem>
                {advisors.map((advisor) => (
                  <SelectItem key={advisor.id} value={advisor.id}>
                    {advisor.full_name} ({advisor.email}){advisor.role === 'admin' ? ' - Administrador' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {advisors.find(a => a.id === formData.advisor_id)?.role === 'admin' ? (
              <p className="text-xs text-muted-foreground">Está seleccionando un usuario con rol administrador como asesor</p>
            ) : null}
          </div>
        ) : (
          <Input
            value={
              client.advisor_id 
                ? `Asesor asignado: ${advisors.find(a => a.id === client.advisor_id)?.full_name || 'Asesor desconocido'}${advisors.find(a => a.id === client.advisor_id)?.role === 'admin' ? ' (Administrador)' : ''}`
                : "Sin asesor asignado"
            }
            disabled
            className="bg-background/50 text-muted-foreground"
          />
        )}
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  )
}
