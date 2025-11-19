"use client"

import { Button } from "@/components/ui/button"
import { LogOut, User, Menu, Sun, Moon, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"

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

  const handleLogout = async () => {
    setIsLoggingOut(true)
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

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="md:hidden inline-flex items-center justify-center rounded-md border px-2 py-1" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logoCooperativaSinTextoSinFondo.png" alt="acercate" className="h-7 w-7" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">acercate</h1>
            <p className="text-sm text-muted-foreground">Sistema de Gestión de Préstamos</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">{userEmail}</p>
              <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cambiar tema"
            className="inline-flex items-center justify-center rounded-md border px-2 py-1 bg-transparent"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            suppressHydrationWarning
          >
            {mounted ? (theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : <span className="h-4 w-4" />}
          </button>
          <Button variant="outline" size="sm" onClick={handleLogout} disabled={isLoggingOut} className="gap-2 bg-transparent">
            {isLoggingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cerrando Sesión...
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </>
            )}
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <AppSidebar variant="mobile" />
        </SheetContent>
      </Sheet>
    </header>
  )
}
