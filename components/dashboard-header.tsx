"use client"

import { Button } from "@/components/ui/button"
import { LogOut, User, Menu, Sun, Moon, Loader2 } from "lucide-react"
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
