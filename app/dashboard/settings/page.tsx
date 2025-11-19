"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useRole } from "@/contexts/role-context"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"

interface SystemSettingsForm {
  support_contact: string
  payment_instructions: string
  default_quiet_hours_start: string
  default_quiet_hours_end: string
  default_country_code: string
  timezone: string
}

export default function SettingsPage() {
  const { role } = useRole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState(role === 'admin' ? 'notifications' : 'credentials')
  const [form, setForm] = useState<SystemSettingsForm>({
    support_contact: "+502 5555-5555",
    payment_instructions: "Paga en ventanilla, transferencia o vía asesor.",
    default_quiet_hours_start: "08:00",
    default_quiet_hours_end: "18:00",
    default_country_code: "+502",
    timezone: "America/Guatemala",
  })
  const [templates, setTemplates] = useState<any[]>([])
  const [tplSaving, setTplSaving] = useState(false)
  const [newPassword, setNewPassword] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings/system')
        if (!res.ok) throw new Error('No autorizado o error de servidor')
        const data = await res.json()
        if (data) {
          setForm({
            support_contact: data.support_contact ?? form.support_contact,
            payment_instructions: data.payment_instructions ?? form.payment_instructions,
            default_quiet_hours_start: data.default_quiet_hours_start ?? form.default_quiet_hours_start,
            default_quiet_hours_end: data.default_quiet_hours_end ?? form.default_quiet_hours_end,
            default_country_code: data.default_country_code ?? form.default_country_code,
            timezone: data.timezone ?? form.timezone,
          })
        }
        if (role === 'admin') {
          const tRes = await fetch('/api/settings/templates')
          if (tRes.ok) {
            const tData = await tRes.json()
            setTemplates(Array.isArray(tData) ? tData : [])
          }
        }
      } catch (e) {
        toast.error('Error cargando configuraciones')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [role])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/system', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Settings save error:', err)
        toast.error(err?.error || 'No se pudo guardar')
      } else {
        toast.success('Configuraciones guardadas')
      }
    } catch (e) {
      console.error('Settings save unexpected error:', e)
      toast.error('No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const saveTemplate = async (tpl: any) => {
    setTplSaving(true)
    try {
      const res = await fetch('/api/settings/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: tpl.key, channel: tpl.channel, locale: tpl.locale, text: tpl.text, active: tpl.active }),
      })
      if (!res.ok) throw new Error('Error guardando plantilla')
      toast.success('Plantilla guardada')
    } catch (e) {
      toast.error('No se pudo guardar la plantilla')
    } finally {
      setTplSaving(false)
    }
  }

  const changePassword = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Contraseña actualizada')
      setNewPassword("")
    } catch (e: any) {
      toast.error(e.message || 'No se pudo actualizar la contraseña')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="text-muted-foreground">Cargando configuraciones...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="notifications" disabled={role !== 'admin'}>Notificaciones</TabsTrigger>
          <TabsTrigger value="credentials">Credenciales</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          {role !== 'admin' ? (
            <div className="text-muted-foreground p-6">Acceso denegado</div>
          ) : (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Configuración de Notificaciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="support_contact">Contacto de soporte</Label>
                    <Input id="support_contact" name="support_contact" value={form.support_contact} onChange={handleChange} placeholder="+502 5555-5555" />
                  </div>
                  <div>
                    <Label htmlFor="default_country_code">Código país por defecto</Label>
                    <Input id="default_country_code" name="default_country_code" value={form.default_country_code} onChange={handleChange} placeholder="+502" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="payment_instructions">Instrucciones de pago</Label>
                  <Textarea id="payment_instructions" name="payment_instructions" value={form.payment_instructions} onChange={handleChange} rows={3} />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="default_quiet_hours_start">Inicio horas silenciosas</Label>
                    <Input id="default_quiet_hours_start" name="default_quiet_hours_start" value={form.default_quiet_hours_start} onChange={handleChange} placeholder="08:00" />
                  </div>
                  <div>
                    <Label htmlFor="default_quiet_hours_end">Fin horas silenciosas</Label>
                    <Input id="default_quiet_hours_end" name="default_quiet_hours_end" value={form.default_quiet_hours_end} onChange={handleChange} placeholder="18:00" />
                  </div>
                  <div>
                    <Label htmlFor="timezone">Zona horaria</Label>
                    <Input id="timezone" name="timezone" value={form.timezone} onChange={handleChange} placeholder="America/Guatemala" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        

        <TabsContent value="credentials">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm max-w-md">
            <CardHeader>
              <CardTitle>Credenciales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nueva contraseña</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={changePassword} disabled={!newPassword}>Actualizar</Button>
              </div>
              {role !== 'admin' && (
                <div className="text-xs text-muted-foreground">Como cliente, esta es la única opción disponible en Configuraciones.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
