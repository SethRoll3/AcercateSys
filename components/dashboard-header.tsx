"use client"

import { Button } from "@/components/ui/button"
import { LogOut, User, Menu, Sun, Moon, Loader2, Bell } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface DashboardHeaderProps {
  userRole: string
  userEmail: string
}

export function DashboardHeader({ userRole, userEmail }: DashboardHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body?: string | null; type: string; status: 'unread'|'read'; created_at: string; action_url?: string | null }>>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotifs, setLoadingNotifs] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {}
    try {
      await fetch('/api/logs/access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'logout' }),
        credentials: 'include' as any,
      })
    } catch {}
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  useEffect(() => {
    if (open) setOpen(false)
  }, [pathname])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let channel: any

    const fetchNotifications = async () => {
      if (!userEmail && !userRole) return
      setLoadingNotifs(true)
      let query = supabase
        .from('notifications')
        .select('id, title, body, type, status, created_at, action_url')
        .order('created_at', { ascending: false })
        .limit(20)
      if (userRole === 'admin') {
        query = query.eq('recipient_role', 'admin')
      } else {
        query = query.eq('recipient_email', userEmail)
      }
      const { data } = await query
      const rows = Array.isArray(data) ? data : []
      setNotifications(rows.map(r => ({ id: String(r.id), title: String(r.title || ''), body: r.body ?? null, type: String(r.type || ''), status: (r.status as any) || 'unread', created_at: String(r.created_at || new Date().toISOString()), action_url: (r as any).action_url || null })))
      setUnreadCount(rows.filter(r => String(r.status) === 'unread').length)
      setLoadingNotifs(false)
    }

    const subscribe = () => {
      try {
        const filter = userRole === 'admin' ? `recipient_role=eq.admin` : `recipient_email=eq.${userEmail}`
        channel = supabase
          .channel('notifications_channel')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter }, () => {
            fetchNotifications()
          })
          .subscribe()
      } catch {}
    }

    fetchNotifications()
    subscribe()

    return () => {
      try { if (channel) supabase.removeChannel(channel) } catch {}
    }
  }, [userEmail, userRole])

  const markAsRead = async (id: string) => {
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllRead = async () => {
    const supabase = createClient()
    const ids = notifications.filter(n => n.status === 'unread').map(n => n.id)
    if (!ids.length) return
    await supabase
      .from('notifications')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .in('id', ids)
    setNotifications(prev => prev.map(n => ({ ...n, status: 'read' })))
    setUnreadCount(0)
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="md:hidden inline-flex items-center justify-center rounded-md border px-2 py-1" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logoCooperativaSinTextoSinFondo.png" alt="acercate" className="h-12 w-12" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">acercate</h1>
            <p className="text-sm text-muted-foreground">Sistema de Gestión de Préstamos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Cambiar tema"
            className="inline-flex items-center justify-center rounded-md border px-2 py-1 bg-transparent"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            suppressHydrationWarning
          >
            {mounted ? (theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="h-4 w-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative inline-flex items-center justify-center rounded-md border px-2 py-1" aria-label="Notificaciones">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] h-4 min-w-4 px-1">{unreadCount}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
              <div className="px-3 py-2 border-b border-border/50">
                <p className="text-sm font-medium">Notificaciones</p>
                <p className="text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todas leídas'}</p>
              </div>
              <div className="max-h-80 overflow-auto">
                {loadingNotifs ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No hay notificaciones</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="px-3 py-2 border-b border-border/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          {n.body ? <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p> : null}
                        </div>
                        {n.status === 'unread' ? (
                          <button onClick={() => markAsRead(n.id)} className="text-xs text-primary hover:underline">Marcar leído</button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Leído</span>
                        )}
                      </div>
                      {n.action_url ? (
                        <div className="mt-2">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => router.push(n.action_url!)}>Ver detalle</Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>Marcar todas</Button>
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/notifications')}>Ver todo</Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center rounded-md border px-2 py-1" aria-label="Cuenta">
                <User className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-foreground truncate">{userEmail}</p>
                <p className="text-xs text-muted-foreground capitalize">{userRole || 'usuario'}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={isLoggingOut} className="gap-2">
                {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64" aria-label="Menú de navegación">
          <SheetHeader className="sr-only">
            <SheetTitle>Menú de navegación</SheetTitle>
            <SheetDescription>Accede a las secciones del sistema</SheetDescription>
          </SheetHeader>
          <AppSidebar variant="mobile" />
        </SheetContent>
      </Sheet>
    </header>
  )
}
