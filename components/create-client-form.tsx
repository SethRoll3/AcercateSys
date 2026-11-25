'use client'

import type React from 'react'
import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  // DialogTrigger, // Removed DialogTrigger
} from '@/components/ui/dialog'
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
import { Plus } from 'lucide-react'
import { PhoneInput } from '@/components/phone-input'
import { toast } from 'sonner'
import { useRole, usePermission } from '@/contexts/role-context'
import { createClient } from '@/lib/supabase/client'
import { DpiCapture, type DpiCaptureResult } from '@/components/dpi-capture'
import { mapDpiToClientFields, isDpiExpired } from '@/lib/dpi/normalize'

interface Advisor {
  id: string
  email: string
  full_name: string
  role: string
}

interface CreateClientFormProps {
  onClientAdded: () => void;
  isOpen: boolean; // Added isOpen prop
  onClose: () => void; // Added onClose prop
}

export function CreateClientForm({ onClientAdded, isOpen, onClose }: CreateClientFormProps) {
  // const [open, setOpen] = useState(false) // Removed local state for open
  const [isLoading, setIsLoading] = useState(false)
  const [advisors, setAdvisors] = useState<Advisor[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    address: '',
    phone: '',
    phone_country_code: '+502',
    emergency_phone: '',
    advisor_id: '',
    gender: '',
    dpi: '',
    birth_date: '',
    nationality: '',
    dpi_issue_date: '',
    dpi_expiry_date: '',
    actividad_economica: '',
    score_buro: '',
  })
  const [dpiPaths, setDpiPaths] = useState<{ frontPath: string | null; backPath: string | null }>({
    frontPath: null,
    backPath: null,
  })
  const [dpiMeta, setDpiMeta] = useState<{
    provider: string
    extracted: DpiCaptureResult['data']
    scannedAt: string
    warnings: string[]
  } | null>(null)
  const [autoFilled, setAutoFilled] = useState<string[]>([])
  const formDataRef = useRef(formData)
  formDataRef.current = formData
  
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
            
            // Si es asesor, auto-asignarse
            if (role === 'asesor') {
              setFormData(prev => ({ ...prev, advisor_id: user.id }))
            }
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
              console.log('Advisors fetched:', advisorsData)
              setAdvisors(advisorsData || [])
            }
          }
        } catch (error) {
          console.error('Error fetching user and advisors:', error)
        }
      }
    }

    if (isOpen) { // Use isOpen prop
      fetchUserAndAdvisors()
    }
  }, [isOpen, canAssignAdvisor, role]) // Depend on isOpen

  const handleClose = () => {
    setDpiPaths({ frontPath: null, backPath: null })
    setDpiMeta(null)
    setAutoFilled([])
    onClose()
  }

  useEffect(() => {
    if (!autoFilled.length) return
    const timer = setTimeout(() => setAutoFilled([]), 2200)
    return () => clearTimeout(timer)
  }, [autoFilled])

  const handleDpiExtracted = (result: DpiCaptureResult) => {
    setDpiPaths({ frontPath: result.frontPath, backPath: result.backPath })
    setDpiMeta({
      provider: result.provider,
      extracted: result.data,
      scannedAt: result.scannedAt,
      warnings: result.warnings,
    })

    if (!result.data) {
      setAutoFilled([])
      return
    }

    const mapped = mapDpiToClientFields(result.data)
    const next = { ...formDataRef.current }
    const filled: string[] = []

    for (const [key, value] of Object.entries(mapped)) {
      if (value === undefined || value === null || value === '') continue
      const current = String((next as Record<string, unknown>)[key] ?? '').trim()
      if (!current) {
        ;(next as Record<string, unknown>)[key] = value
        filled.push(key)
      }
    }

    setFormData(next)
    setAutoFilled(filled)

    if (isDpiExpired(result.data.fecha_vencimiento)) {
      toast.warning('El DPI detectado aparece vencido. Verifica la fecha antes de continuar.')
    }

    if (filled.length === 0) {
      toast.info('Los campos de identidad ya tenían valor; no se reemplazó ninguno.')
    } else {
      toast.success(`Se autocompletaron ${filled.length} campo(s) vacío(s) desde el DPI.`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!dpiPaths.frontPath || !dpiPaths.backPath) {
      toast.error('Debe subir y escanear el frente y el reverso del DPI')
      return
    }
    
    // Validar que se haya asignado un asesor (excepto para asesores que se auto-asignan)
    if (role === 'admin' && !formData.advisor_id) {
      toast.error('Debe asignar un asesor al cliente')
      return
    }
    if (!formData.gender) {
      toast.error('Seleccione el género del cliente')
      return
    }
    
    setIsLoading(true)

    try {
      // Preparar los datos para envío
      const submitData = {
        ...formData,
        dpi_front_path: dpiPaths.frontPath,
        dpi_back_path: dpiPaths.backPath,
        dpi_provider: dpiMeta?.provider || null,
        dpi_scanned_at: dpiMeta?.scannedAt || new Date().toISOString(),
        dpi_extracted_data: dpiMeta?.extracted || null,
      }

      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      })

      if (response.ok) {
        // setOpen(false) // Removed local state for open
        onClose() // Use onClose prop
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
          address: '',
          phone: '',
          phone_country_code: '+502',
          emergency_phone: '',
          advisor_id: '',
          gender: '',
          dpi: '',
          birth_date: '',
          nationality: '',
          dpi_issue_date: '',
          dpi_expiry_date: '',
          actividad_economica: '',
          score_buro: '',
        })
        setDpiPaths({ frontPath: null, backPath: null })
        setDpiMeta(null)
        setAutoFilled([])
        onClientAdded()
        toast.success('Cliente creado con éxito')
      } else {
        const errorData = await response.json()
        toast.error(`Error al crear el cliente: ${errorData.error || errorData.message || 'Error desconocido'}`)
      }
    } catch (error) {
      toast.error('No se pudo conectar con el servidor. Inténtalo de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  const dpiFieldClass = (key: string) => `bg-background/50 ${autoFilled.includes(key) ? 'dpi-field-filled' : ''}`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}> {/* Use isOpen and onClose props */}
      {/* <DialogTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nuevo Cliente
        </Button>
      </DialogTrigger> */}
      <DialogContent className="sm:max-w-[700px] bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Crear Nuevo Cliente</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Ingrese los detalles para registrar un nuevo cliente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <DpiCapture
            required
            disabled={isLoading}
            onExtracted={handleDpiExtracted}
            onClearScan={() => {
              setDpiPaths({ frontPath: null, backPath: null })
              setDpiMeta(null)
              setAutoFilled([])
            }}
          />
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
                className={dpiFieldClass('first_name')}
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
                className={dpiFieldClass('last_name')}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="space-y-2 w-1/2">
              <Label htmlFor="dpi" className="text-foreground">
                DPI *
              </Label>
              <Input
                id="dpi"
                placeholder="1234 56789 0101"
                value={formData.dpi}
                onChange={(e) =>
                  setFormData({ ...formData, dpi: e.target.value })
                }
                required
                className={dpiFieldClass('dpi')}
              />
            </div>
            <div className="space-y-2 w-1/2">
              <Label htmlFor="actividad_economica" className="text-foreground">
                Actividad Económica
              </Label>
              <Input
                id="actividad_economica"
                placeholder="Ej. Comerciante"
                value={formData.actividad_economica}
                onChange={(e) =>
                  setFormData({ ...formData, actividad_economica: e.target.value })
                }
                className="bg-background/50"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="birth_date" className="text-foreground">
                Fecha de nacimiento
              </Label>
              <Input
                id="birth_date"
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                className={dpiFieldClass('birth_date')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nationality" className="text-foreground">
                Nacionalidad
              </Label>
              <Input
                id="nationality"
                placeholder="Guatemalteca"
                value={formData.nationality}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                className={dpiFieldClass('nationality')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpi_issue_date" className="text-foreground">
                Fecha de emisión del DPI
              </Label>
              <Input
                id="dpi_issue_date"
                type="date"
                value={formData.dpi_issue_date}
                onChange={(e) => setFormData({ ...formData, dpi_issue_date: e.target.value })}
                className={dpiFieldClass('dpi_issue_date')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpi_expiry_date" className="text-foreground">
                Fecha de vencimiento del DPI
              </Label>
              <Input
                id="dpi_expiry_date"
                type="date"
                value={formData.dpi_expiry_date}
                onChange={(e) => setFormData({ ...formData, dpi_expiry_date: e.target.value })}
                className={dpiFieldClass('dpi_expiry_date')}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="score_buro" className="text-foreground">
              Score de Buró
            </Label>
            <Input
              id="score_buro"
              placeholder="Ej. A, B, 700"
              value={formData.score_buro}
              onChange={(e) =>
                setFormData({ ...formData, score_buro: e.target.value })
              }
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender" className="text-foreground">
              Género
            </Label>
            <Select
              value={formData.gender}
              onValueChange={(value) => setFormData({ ...formData, gender: value })}
            >
              <SelectTrigger className={dpiFieldClass('gender')}>
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
              className={dpiFieldClass('address')}
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
                value="Auto-asignado (Usted)"
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
                    <SelectValue placeholder="Seleccione un asesor *" />
                  </SelectTrigger>
                  <SelectContent>
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
                value="Sin permisos para asignar asesor"
                disabled
                className="bg-background/50 text-muted-foreground"
              />
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:items-center sm:justify-end">
            {(!dpiPaths.frontPath || !dpiPaths.backPath) ? (
              <p className="text-xs text-muted-foreground sm:mr-auto">
                Escanea el frente y el reverso del DPI para habilitar el guardado.
              </p>
            ) : null}
            <Button type="button" variant="outline" onClick={handleClose}> {/* Use onClose prop */}
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !dpiPaths.frontPath || !dpiPaths.backPath}>
              {isLoading ? "Creando..." : "Crear Cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
