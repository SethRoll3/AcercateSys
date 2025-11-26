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
import { PhoneInput } from "@/components/phone-input"

interface SystemSettingsForm {
  support_contact: string
  payment_instructions: string
  default_quiet_hours_start: string
  default_quiet_hours_end: string
  default_country_code: string
  timezone: string
}

interface MeUser {
  id: string
  email: string
  full_name: string
  role: string
}

export default function SettingsPage() {
  const { role } = useRole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState(role === 'admin' ? 'notifications' : role === 'cliente' ? 'profile' : 'credentials')
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
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profile, setProfile] = useState<any>({
    first_name: "",
    last_name: "",
    email: "",
    address: "",
    phone: "",
    phone_country_code: "+502",
    emergency_phone: "",
    full_name: "",
  })
  const [advisor, setAdvisor] = useState<MeUser | null>(null)
  const [advisorForm, setAdvisorForm] = useState({ email: "", full_name: "", password: "" })
  const [advisorSaving, setAdvisorSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        if (role === 'admin') {
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
          const tRes = await fetch('/api/settings/templates')
          if (tRes.ok) {
            const tData = await tRes.json()
            setTemplates(Array.isArray(tData) ? tData : [])
          }
        } else if (role === 'cliente') {
          const pRes = await fetch('/api/profile', { credentials: 'include' as any })
          if (pRes.ok) {
            const pData = await pRes.json()
            const c = pData.client || {}
            const u = pData.user || {}
            setProfile({
              first_name: c.first_name || '',
              last_name: c.last_name || '',
              email: u.email || c.email || '',
              address: c.address || '',
              phone: c.phone || '',
              phone_country_code: c.phone_country_code || '+502',
              emergency_phone: c.emergency_phone || '',
              full_name: u.full_name || '',
            })
          }
        } else if (role === 'asesor') {
          const pRes = await fetch('/api/profile', { credentials: 'include' as any })
          if (pRes.ok) {
            const pData = await pRes.json()
            const u = pData.user || {}
            const me: MeUser = {
              id: u.id || '',
              email: u.email || '',
              full_name: u.full_name || '',
              role: u.role || 'asesor',
            }
            setAdvisor(me)
            setAdvisorForm({ email: me.email, full_name: me.full_name, password: "" })
          }
        }
      } catch (e) {
        toast.error('Error cargando configuraciones')
      } finally {
        setLoading(false)
        setProfileLoading(false)
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

  const saveProfile = async () => {
    setProfileSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error || 'No se pudo guardar el perfil')
      } else {
        toast.success('Perfil actualizado')
      }
    } catch (e) {
      toast.error('No se pudo guardar el perfil')
    } finally {
      setProfileSaving(false)
    }
  }

  const saveAdvisorCredentials = async () => {
    if (!advisor) return
    setAdvisorSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: advisor.id, email: advisorForm.email, full_name: advisorForm.full_name, password: advisorForm.password }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error || 'No se pudo actualizar')
      } else {
        const data = await res.json()
        setAdvisor({ id: data.id, email: data.email, full_name: data.full_name, role: data.role })
        setAdvisorForm((f) => ({ ...f, password: "" }))
        toast.success('Credenciales actualizadas')
      }
    } catch (e) {
      toast.error('No se pudo actualizar')
    } finally {
      setAdvisorSaving(false)
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
        <TabsList className={`grid ${role === 'asesor' ? 'grid-cols-1' : 'grid-cols-3'} w-full`}>
          {role !== 'asesor' && (
            <TabsTrigger value="notifications" disabled={role !== 'admin'}>Notificaciones</TabsTrigger>
          )}
          {role !== 'asesor' && (
            <TabsTrigger value="profile" disabled={role !== 'cliente'}>Perfil</TabsTrigger>
          )}
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

        

        <TabsContent value="profile">
          {role !== 'cliente' ? (
            <div className="text-muted-foreground p-6">Acceso denegado</div>
          ) : (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-200 hover:shadow-md">
              <CardHeader>
                <CardTitle>Mi Perfil</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  Al cambiar el correo, se actualizará tanto para tu perfil de cliente como para tu usuario.
                </div>
                {profileLoading ? (
                  <div className="text-muted-foreground">Cargando perfil...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="full_name">Nombre de usuario</Label>
                        <Input id="full_name" value={profile.full_name} onChange={(e) => setProfile((p: any) => ({ ...p, full_name: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="email">Correo</Label>
                        <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile((p: any) => ({ ...p, email: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="first_name">Nombres</Label>
                          <Input id="first_name" value={profile.first_name} onChange={(e) => setProfile((p: any) => ({ ...p, first_name: e.target.value }))} />
                        </div>
                        <div>
                          <Label htmlFor="last_name">Apellidos</Label>
                          <Input id="last_name" value={profile.last_name} onChange={(e) => setProfile((p: any) => ({ ...p, last_name: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="phone">Teléfono</Label>
                          <PhoneInput
                            value={profile.phone}
                            countryDialCode={profile.phone_country_code || '+502'}
                            onChange={(local: string, code: string) => setProfile((p: any) => ({ ...p, phone: local, phone_country_code: code }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="emergency_phone">Teléfono de emergencia</Label>
                          <PhoneInput
                            value={profile.emergency_phone}
                            countryDialCode={profile.phone_country_code || '+502'}
                            onChange={(local: string) => setProfile((p: any) => ({ ...p, emergency_phone: local }))}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="address">Dirección</Label>
                        <Input id="address" value={profile.address} onChange={(e) => setProfile((p: any) => ({ ...p, address: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={saveProfile} disabled={profileSaving}>{profileSaving ? 'Guardando...' : 'Guardar'}</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="credentials">
          {role === 'asesor' ? (
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Credenciales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="advisor_full_name">Nombre completo</Label>
                    <Input id="advisor_full_name" value={advisorForm.full_name} onChange={(e) => setAdvisorForm((f) => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="advisor_email">Correo</Label>
                    <Input id="advisor_email" type="email" value={advisorForm.email} onChange={(e) => setAdvisorForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="advisor_password">Nueva contraseña (opcional)</Label>
                    <Input id="advisor_password" type="password" value={advisorForm.password} onChange={(e) => setAdvisorForm((f) => ({ ...f, password: e.target.value }))} />
                    <p className="text-sm text-muted-foreground">Dejar vacío para mantener la contraseña actual</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveAdvisorCredentials} disabled={advisorSaving || !advisorForm.email || !advisorForm.full_name}>{advisorSaving ? 'Guardando...' : 'Guardar'}</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
