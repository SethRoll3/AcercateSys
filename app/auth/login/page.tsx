"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { FullScreenLoadingSpinner } from "@/components/full-screen-loading-spinner"
import { toast } from "sonner"
import { Mail, Lock, ArrowRight } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // --- Mantengo tus funciones auxiliares intactas ---
  const writeCache = (key: string, data: any) => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    } catch {}
  }
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = 8000) => {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(id)
      return res
    } catch (e) {
      clearTimeout(id)
      throw e
    }
  }
  const K = {
    user: 'dashboard:user',
    userData: 'dashboard:userData',
    loans: 'dashboard:loans',
    clients: 'dashboard:clients',
    groupLoans: 'dashboard:groupLoans',
    loanGroupMap: 'dashboard:loanGroupMap',
    activeLoanDetails: 'dashboard:activeLoanDetails',
    selectedLoanId: 'dashboard:selectedLoanId',
  }
  // --------------------------------------------------

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }
      try {
        const userRes = await fetchWithTimeout('/api/auth/user', { credentials: 'include' as any }, 6000)
        if (userRes.status === 403) {
          await supabase.auth.signOut()
          toast.error('Tu usuario está inactivo. Contacta al administrador.')
          setIsLoading(false)
          return
        }
        if (userRes.ok) {
          const userData = await userRes.json()
          writeCache(K.userData, userData)
          writeCache(K.user, { id: userData.id, email: userData.email })
          try {
            sessionStorage.removeItem(K.selectedLoanId)
            sessionStorage.removeItem(K.activeLoanDetails)
          } catch {}
        }
      } catch {}
      router.push("/dashboard")
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || "Error al iniciar sesión.")
      setIsLoading(false)
    }
  }

  const quickLogin = (testEmail: string, testPassword: string) => {
    setEmail(testEmail)
    setPassword(testPassword)
    toast.info("Credenciales aplicadas. Haz clic en Iniciar Sesión.");
  }

  if (isLoading) {
    return <FullScreenLoadingSpinner />
  }

  return (
    // Contenedor principal
    <div className="w-full min-h-screen lg:grid lg:grid-cols-2">

      {/* --- COLUMNA IZQUIERDA (Branding e Ilustración) --- */}
      {/* Usamos 'justify-between' para separar texto (arriba) e imagen (pegada abajo) */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-50 dark:bg-gray-900/50 relative overflow-hidden h-screen">
        
        {/* Decoración de fondo */}
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.03] dark:opacity-[0.05] z-0 pointer-events-none" />

        {/* PARTE SUPERIOR: SOLO EL TAGLINE (El logo se movió a la derecha) */}
        <div className="w-full px-12 pt-24 z-10">
            <div className="space-y-6">
                {/* Tagline */}
                <blockquote className="space-y-2 pl-2 border-l-4 border-cyan-500">
                    <p className="text-xl font-medium text-foreground leading-snug">
                    "Simplificamos la gestión financiera para que tú te enfoques en crecer."
                    </p>
                    <footer className="text-sm text-muted-foreground font-semibold">
                        Sistema de Gestión de Préstamos
                    </footer>
                </blockquote>
            </div>
        </div>

        {/* PARTE INFERIOR: ILUSTRACIÓN (INTACTA) */}
        {/* Sin padding lateral ni inferior para asegurar que toque el borde */}
        <div className="w-full flex items-end justify-center z-10">
            <img
                src="/fondoLogin.png"
                alt="Gestión de préstamos en oficina"
                className="w-full max-w-2xl object-contain object-bottom"
            />
        </div>
      </div>

      {/* --- COLUMNA DERECHA (Formulario + Logo Desktop) --- */}
      <div className="flex items-center justify-center p-6 md:p-10 bg-background h-screen overflow-y-auto">
        <div className="mx-auto w-full max-w-[400px] space-y-8">

          {/* Encabezado del formulario */}
          <div className="flex flex-col space-y-2 text-center items-center">
            
            {/* LOGO VERSIÓN MÓVIL (lg:hidden) - INTACTO */}
            <div className="lg:hidden flex justify-center mb-6 w-full">
                 <img 
                    src="/logoCooperativaTextoSinFondo.png" 
                    alt="acercate" 
                    className="w-64 h-auto max-w-full drop-shadow-md" 
                 />
            </div>

            {/* --- NUEVO: LOGO VERSIÓN ESCRITORIO (hidden lg:flex) --- */}
            {/* Se muestra solo en LG, encima del título */}
             <div className="hidden lg:flex items-center gap-5 mb-8">
                <img 
                    src="/logoCooperativaSinTextoSinFondo.png" 
                    alt="acercate" 
                    // Ajusté ligeramente el tamaño para que se vea bien sobre el formulario (h-20 w-20)
                    className="h-20 w-20 drop-shadow-md" 
                />
                <div>
                    {/* Ajusté el tamaño del texto (text-4xl) */}
                    <div className="text-4xl font-extrabold text-foreground leading-none tracking-tight">
                        acercate
                    </div>
                </div>
            </div>
            {/* ------------------------------------------------------- */}

            <h1 className="text-3xl font-bold tracking-tight">Bienvenido de nuevo</h1>
            <p className="text-sm text-muted-foreground">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>

          {/* Formulario (INTACTO) */}
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <Label htmlFor="email" className="sr-only">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground/70" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@cooperativa.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-10 py-6 bg-muted/30 border-muted-foreground/20 focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-2 mb-2">
                <Label htmlFor="password" className="sr-only">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground/70" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                      className="pl-10 py-6 bg-muted/30 border-muted-foreground/20 focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 transition-all"
                  />
                </div>
                 <a href="#" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline text-right mt-1">
                    ¿Olvidaste tu contraseña?
                  </a>
              </div>

              <Button type="submit" className="w-full py-6 text-base bg-cyan-500 hover:bg-cyan-600 text-white font-semibold shadow-lg shadow-cyan-500/20 dark:shadow-cyan-500/10 transition-all hover:scale-[1.01]" disabled={isLoading}>
                {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"} <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </form>

          <div className="pt-4 text-center text-sm text-muted-foreground">
            <p>¿Necesitas probar el sistema?</p>
            <button
              type="button"
              onClick={() => quickLogin("admin@cooperativa.com", "admin123")}
              className="font-medium text-cyan-600 dark:text-cyan-400 hover:underline transition-colors mt-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded px-2 py-1"
            >
              Usar cuenta de Admin Demo
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
