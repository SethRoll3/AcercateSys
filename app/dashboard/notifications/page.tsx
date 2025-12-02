"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function NotificationsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Array<{ id: string; title: string; body?: string | null; status: 'unread'|'read'; created_at: string; action_url?: string | null }>>([])
  const [userEmail, setUserEmail] = useState<string>("")
  const [userRole, setUserRole] = useState<string>("")

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const { data: auth } = await supabase.auth.getUser()
      const email = String(auth.user?.email || "")
      setUserEmail(email)
      let role = ""
      if (auth.user?.id) {
        const { data: urow } = await supabase.from('users').select('role').eq('auth_id', auth.user.id).limit(1).single()
        role = String(urow?.role || "")
        setUserRole(role)
      }

      let q = supabase.from('notifications').select('id, title, body, status, created_at, action_url').order('created_at', { ascending: false }).limit(50)
      if (role === 'admin') q = q.eq('recipient_role', 'admin')
      else q = q.eq('recipient_email', email)
      const { data } = await q
      const rows = Array.isArray(data) ? data : []
      setItems(rows.map(r => ({ id: String(r.id), title: String(r.title || ''), body: r.body ?? null, status: (r.status as any) || 'unread', created_at: String(r.created_at || new Date().toISOString()), action_url: (r as any).action_url || null })))
      setLoading(false)
    }
    run()
  }, [])

  const markAllRead = async () => {
    const ids = items.filter(i => i.status === 'unread').map(i => i.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ status: 'read', read_at: new Date().toISOString() }).in('id', ids)
    setItems(prev => prev.map(i => ({ ...i, status: 'read' })))
  }

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'read' } : i))
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Notificaciones</h2>
          <p className="text-sm text-muted-foreground">{userRole ? `Rol: ${userRole}` : ''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead} disabled={!items.some(i => i.status === 'unread')}>Marcar todas</Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No hay notificaciones</div>
      ) : (
        <div className="space-y-3">
          {items.map(n => (
            <div key={n.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p> : null}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('es-GT')}</p>
                </div>
                {n.status === 'unread' ? (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => markRead(n.id)}>Marcar leído</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Leído</span>
                )}
              </div>
              {n.action_url ? (
                <div className="mt-2">
                  <Button variant="secondary" size="sm" className="h-8" onClick={() => router.push(n.action_url!)}>Ver detalle</Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

