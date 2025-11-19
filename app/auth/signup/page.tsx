import type { Metadata } from "next"
import Link from "next/link"
import { SignupForm } from "@/components/signup-form"

export const metadata: Metadata = {
  title: "Registro - Cooperativa",
  description: "Crear cuenta en el sistema de préstamos",
}

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Crear Cuenta</h1>
          <p className="mt-2 text-muted-foreground">Registra una nueva cuenta en el sistema</p>
        </div>

        <SignupForm />

        <div className="text-center text-sm">
          <span className="text-muted-foreground">¿Ya tienes cuenta? </span>
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
