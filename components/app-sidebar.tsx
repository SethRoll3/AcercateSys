'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Users, LogOut, CreditCard, FileText, Settings, UserCheck, Calculator, Loader2 } from "lucide-react"
import { useState } from "react"
import { LoanCalculatorModal } from "@/components/loan-calculator-modal"
import { createClient } from "@/lib/supabase/client"
import { useRole, RolePermissions } from "@/contexts/role-context"

// Define menu items with their required permissions
interface MenuItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission: keyof RolePermissions | null
}

const menuItems: MenuItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home, permission: null }, // Siempre visible
  { name: "Clientes", href: "/dashboard/clients", icon: Users, permission: null }, // Visible para roles con acceso a la ruta (admin/asesor)
  { name: "Préstamos", href: "/dashboard/loans", icon: CreditCard, permission: "canViewAllLoans" },
  { name: "Pagos", href: "/dashboard/payments", icon: FileText, permission: "canViewAllPayments" },
  { name: "Reportes", href: "/dashboard/reports", icon: FileText, permission: "canViewFinancialReports" },
  { name: "Usuarios", href: "/dashboard/users", icon: UserCheck, permission: "canManageUsers" },
  { name: "Grupos", href: "/dashboard/grupos", icon: Users, permission: "canManageUsers" },
  { name: "Configuración", href: "/dashboard/settings", icon: Settings, permission: "canAccessSystemSettings" },
]

export function AppSidebar({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const pathname = usePathname()
  const supabase = createClient()
  const { user, role, hasPermission, canAccessRoute } = useRole()
  const [calcOpen, setCalcOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Filter menu items based on user permissions
  const hiddenForAdmin = new Set(["/dashboard/loans","/dashboard/payments","/dashboard/reports","/dashboard/grupos"])
  const visibleMenuItems = menuItems.filter(item => {
    if (role === 'admin' && hiddenForAdmin.has(item.href)) return false
    // Primero, validar que el rol actual puede acceder a la ruta definida
    if (!canAccessRoute(item.href)) return false
    // Elementos sin permisos específicos se muestran si la ruta es accesible
    if (item.permission === null) return true
    // Para el resto, se requiere permiso explícito
    return hasPermission(item.permission)
  })

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  const Container = variant === "desktop" ? "aside" : "div"
  const containerClass = variant === "desktop" ? "flex h-screen w-64 flex-col overflow-y-auto border-r bg-card px-4 py-8" : "flex w-64 flex-col overflow-y-auto bg-card px-4 py-6"

  return (
    <Container className={containerClass as any}>
      <Link href="/" className="flex items-center gap-3 px-4 mb-6">
        <img src="/logoCooperativaSinTextoSinFondo.png" alt="acercate" className="h-8 w-8" />
        <span className="text-2xl font-bold text-foreground">acercate</span>
      </Link>

      <div className="flex flex-1 flex-col justify-between">
        <nav className="-mx-3 space-y-2">
          {visibleMenuItems.map(item => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center rounded-lg px-3 py-2 text-base font-medium transition-colors duration-200 ${pathname === item.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>
        {(role === 'admin' || role === 'asesor') && (
          <button
            onClick={() => setCalcOpen(true)}
            className="mt-2 flex w-full items-center rounded-lg px-3 py-2 text-base font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted"
          >
            <Calculator className="mr-3 h-5 w-5" />
            Calculadora
          </button>
        )}

        <div className="-mx-3 space-y-2">
          {/* Role indicator */}
          {role && (
            <div className="flex items-center rounded-lg px-3 py-2 text-sm bg-muted/50">
              <UserCheck className="mr-3 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">
                Rol: <span className="font-medium text-foreground capitalize">{role}</span>
              </span>
            </div>
          )}
          
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center rounded-lg px-3 py-2 text-base font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted cursor-pointer disabled:opacity-50"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                Cerrando Sesión...
              </>
            ) : (
              <>
                <LogOut className="mr-3 h-5 w-5" />
                Cerrar Sesión
              </>
            )}
          </button>
        </div>
      </div>
      <LoanCalculatorModal open={calcOpen} onOpenChange={setCalcOpen} />
    </Container>
  )
}
