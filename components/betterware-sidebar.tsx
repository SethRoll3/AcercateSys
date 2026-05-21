'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Users, FileText, ArrowLeft, ShoppingBag, Loader2, LogOut, UserCheck, Calculator } from "lucide-react"
import { useState } from "react"
import { LoanCalculatorModal } from "@/components/loan-calculator-modal"
import { createClient } from "@/lib/supabase/client"
import { useRole } from "@/contexts/role-context"

interface MenuItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const betterwareMenuItems: MenuItem[] = [
  { name: "Dashboard", href: "/dashboard/betterware", icon: Home },
  { name: "Clientes", href: "/dashboard/betterware/clientes", icon: Users },
  { name: "Reportes", href: "/dashboard/betterware/reportes", icon: FileText },
]

export function BetterwareSidebar({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const pathname = usePathname()
  const supabase = createClient()
  const { role } = useRole()
  const [calcOpen, setCalcOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      sessionStorage.clear()
    } catch {}
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  const Container = variant === "desktop" ? "aside" : "div"
  const containerClass = variant === "desktop" ? "flex h-screen w-64 flex-col overflow-y-auto border-r bg-card/50 backdrop-blur-sm px-4 py-8" : "flex w-64 flex-col overflow-y-auto bg-card/50 backdrop-blur-sm px-4 py-6"

  const isActive = (href: string) => {
    if (href === "/dashboard/betterware") {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <Container className={containerClass}>
      <Link href="/" className="flex items-center gap-3 px-4 mb-6">
        <img src="/logoCooperativaSinTextoSinFondo.png" alt="acercate" className="h-12 w-12" />
        <span className="text-2xl font-bold text-foreground">acercate</span>
      </Link>

      <div className="flex flex-1 flex-col justify-between">
        <div className="-mx-3 space-y-2">
          {/* Back to main menu */}
          <Link
            href="/dashboard"
            className="flex items-center rounded-lg px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted transition-colors duration-200 mb-4 border-b border-border/50 pb-4"
          >
            <ArrowLeft className="mr-3 h-5 w-5" />
            Volver al Menú
          </Link>

          {/* Betterware section label */}
          <div className="flex items-center gap-2 px-3 py-1 mb-1">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Betterware</span>
          </div>

          {/* Betterware menu items */}
          <nav className="space-y-1">
            {betterwareMenuItems.map(item => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center rounded-lg px-3 py-2 text-base font-medium transition-colors duration-200 ${isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

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
