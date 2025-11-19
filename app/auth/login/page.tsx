"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InfoIcon } from "lucide-react"
import { FullScreenLoadingSpinner } from "@/components/full-screen-loading-spinner"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

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
  }

  if (isLoading) {
    return <FullScreenLoadingSpinner />
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3 justify-center mb-2">
          <img src="/logoCooperativaSinTextoSinFondo.png" alt="acercate" className="h-9 w-9" />
          <div>
            <div className="text-2xl font-bold text-foreground leading-none">acercate</div>
            <div className="text-xs text-muted-foreground">Sistema de Gestión de Préstamos</div>
          </div>
        </div>
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
            <CardDescription>Ingresa tus credenciales para acceder al sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@cooperativa.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold text-sm">Usar credenciales de prueba:</p>
              <div className="space-y-1 text-xs">
                <button
                  type="button"
                  onClick={() => quickLogin("admin@cooperativa.com", "admin123")}
                  className="block w-full text-left hover:underline"
                >
                  <strong>Admin:</strong> admin@cooperativa.com / admin123
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Haz clic en las credenciales para autocompletar</p>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
