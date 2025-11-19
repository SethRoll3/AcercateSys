"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, AuthChangeEvent, Session } from '@supabase/supabase-js'

// Definición de roles del sistema
export type UserRole = 'admin' | 'cliente' | 'asesor'

// Definición de permisos por rol
export interface RolePermissions {
  // Gestión de clientes
  canViewAllClients: boolean
  canCreateClients: boolean
  canEditClients: boolean
  canDeleteClients: boolean

  // Gestión de grupos
  canViewGroups: boolean
  canCreateGroups: boolean
  canEditGroups: boolean
  canDeleteGroups: boolean

  // Gestión de préstamos
  canViewAllLoans: boolean
  canCreateLoans: boolean
  canEditLoans: boolean
  canDeleteLoans: boolean
  
  // Gestión de pagos
  canViewAllPayments: boolean
  canProcessPayments: boolean
  canViewPaymentReports: boolean
  
  // Gestión de usuarios
  canManageUsers: boolean
  canAssignAdvisors: boolean
  
  // Reportes y análisis
  canViewFinancialReports: boolean
  canExportData: boolean
  
  // Configuración del sistema
  canAccessSystemSettings: boolean
}

// Configuración de permisos por rol
const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canViewAllClients: true,
    canCreateClients: true,
    canEditClients: true,
    canDeleteClients: true,
    canViewGroups: true,
    canCreateGroups: true,
    canEditGroups: true,
    canDeleteGroups: true,
    canViewAllLoans: true,
    canCreateLoans: true,
    canEditLoans: true,
    canDeleteLoans: true,
    canViewAllPayments: true,
    canProcessPayments: true,
    canViewPaymentReports: true,
    canManageUsers: true,
    canAssignAdvisors: true,
    canViewFinancialReports: true,
    canExportData: true,
    canAccessSystemSettings: true,
  },
  asesor: {
    canViewAllClients: false, // Solo sus clientes asignados
    canCreateClients: true,
    canEditClients: true,
    canDeleteClients: true,
    canViewGroups: true,
    canCreateGroups: true,
    canEditGroups: true,
    canDeleteGroups: true,
    canViewAllLoans: false, // Solo préstamos de sus clientes
    canCreateLoans: true,
    canEditLoans: true,
    canDeleteLoans: false,
    canViewAllPayments: false, // Solo pagos de sus clientes
    canProcessPayments: true,
    canViewPaymentReports: true, // Solo de sus clientes
    canManageUsers: false,
    canAssignAdvisors: false,
    canViewFinancialReports: false, // Solo de sus clientes
    canExportData: true, // Solo de sus clientes
    canAccessSystemSettings: false,
  },
  cliente: {
    canViewAllClients: false,
    canCreateClients: false,
    canEditClients: false, // Solo su propio perfil
    canDeleteClients: false,
    canViewGroups: false,
    canCreateGroups: false,
    canEditGroups: false,
    canDeleteGroups: false,
    canViewAllLoans: false, // Solo sus propios préstamos
    canCreateLoans: false,
    canEditLoans: false,
    canDeleteLoans: false,
    canViewAllPayments: false, // Solo sus propios pagos
    canProcessPayments: false,
    canViewPaymentReports: false, // Solo sus propios reportes
    canManageUsers: false,
    canAssignAdvisors: false,
    canViewFinancialReports: false,
    canExportData: false,
    canAccessSystemSettings: false,
  },
}

// Información extendida del usuario con rol
export interface UserWithRole extends User {
  role: UserRole
  clientIds?: string[] // Para asesores: IDs de clientes asignados
}

// Contexto de roles
interface RoleContextType {
  user: UserWithRole | null
  role: UserRole | null
  permissions: RolePermissions | null
  isLoading: boolean
  
  // Funciones de utilidad
  hasPermission: (permission: keyof RolePermissions) => boolean
  isAdmin: () => boolean
  isAdvisor: () => boolean
  isClient: () => boolean
  canAccessRoute: (route: string) => boolean
  
  // Funciones para obtener datos filtrados por rol
  getAccessibleClientIds: () => string[]
  refreshUserRole: () => Promise<void>
}

export const RoleContext = createContext<RoleContextType | undefined>(undefined)

// Rutas protegidas por rol
const PROTECTED_ROUTES: Record<string, UserRole[]> = {
  '/dashboard': ['admin', 'asesor', 'cliente'],
  '/dashboard/clients': ['admin', 'asesor'],
  '/dashboard/loans': ['admin', 'asesor'],
  '/dashboard/payments': ['admin', 'asesor'],
  '/dashboard/reports': ['admin', 'asesor'],
  '/dashboard/users': ['admin'],
  '/dashboard/settings': ['admin'],
  '/client-portal': ['cliente'],
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserWithRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const getUserWithRetry = async () => {
    for (const ms of [200, 400, 800]) {
      const { data } = await supabase.auth.getUser()
      if (data?.user) return data.user
      await delay(ms)
    }
    try {
      const res = await fetch('/api/auth/user', { credentials: 'include' as any })
      if (res.ok) {
        const data = await res.json()
        return { id: data.id, email: data.email } as any
      }
    } catch {}
    return null
  }

  // Función para obtener información del rol del usuario
  const fetchUserRole = async (userId: string): Promise<UserWithRole | null> => {
    try {
      // Obtener información del usuario desde la tabla users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          advisor_id,
          role
        `)
        .eq('auth_id', userId)
        .single()

      if (userError) {
        console.error('Error fetching user role:', userError)
        return null
      }

      // Si es asesor, obtener sus clientes asignados
      let clientIds: string[] = []
      if (userData.role === 'asesor') {
        const { data: clients, error: clientsError } = await supabase
          .from('clients')
          .select('id')
          .eq('advisor_id', userData.id)

        if (!clientsError && clients) {
          clientIds = clients.map((client: { id: any }) => client.id)
        }
      }

      // Obtener información básica del usuario autenticado
      const { data: authUser } = await supabase.auth.getUser()
      
      if (!authUser.user) return null

      return {
        ...authUser.user,
        role: userData.role as UserRole,
        clientIds: userData.role === 'asesor' ? clientIds : undefined,
      }
    } catch (error) {
      console.error('Error in fetchUserRole:', error)
      return null
    }
  }

  // Función para refrescar el rol del usuario
  const refreshUserRole = async () => {
    setIsLoading(true)
    try {
      // Preferir servidor para evitar estados intermedios de hidratación
      try {
        const res = await fetch('/api/auth/user', { credentials: 'include' as any })
        if (res.ok) {
          const data = await res.json()
          const userWithRole = await fetchUserRole(data.id)
          setUser(userWithRole)
        } else {
          const authUser = await getUserWithRetry()
          if (authUser) {
            const userWithRole = await fetchUserRole(authUser.id)
            setUser(userWithRole)
          } else {
            setUser(null)
          }
        }
      } catch {
        const authUser = await getUserWithRetry()
        if (authUser) {
          const userWithRole = await fetchUserRole(authUser.id)
          setUser(userWithRole)
        } else {
          setUser(null)
        }
      }
    } catch (error) {
      console.error('Error refreshing user role:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Efecto para cargar el usuario inicial y escuchar cambios de autenticación
  useEffect(() => {
    // Cargar usuario inicial
    refreshUserRole()

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const userWithRole = await fetchUserRole(session.user.id)
          setUser(userWithRole)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
        }
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Funciones de utilidad
  const hasPermission = (permission: keyof RolePermissions): boolean => {
    if (!user?.role) return false
    return ROLE_PERMISSIONS[user.role][permission]
  }

  const isAdmin = (): boolean => user?.role === 'admin'
  const isAdvisor = (): boolean => user?.role === 'asesor'
  const isClient = (): boolean => user?.role === 'cliente'

  const canAccessRoute = (route: string): boolean => {
    if (!user?.role) return false
    const allowedRoles = PROTECTED_ROUTES[route]
    return allowedRoles ? allowedRoles.includes(user.role) : true
  }

  const getAccessibleClientIds = (): string[] => {
    if (!user) return []
    
    if (user.role === 'admin') {
      // Admin puede ver todos los clientes (se manejará en las consultas)
      return []
    } else if (user.role === 'asesor') {
      // Asesor solo puede ver sus clientes asignados
      return user.clientIds || []
    } else if (user.role === 'cliente') {
      // Cliente solo puede ver su propio perfil
      return [user.id]
    }
    
    return []
  }

  const permissions = user?.role ? ROLE_PERMISSIONS[user.role] : null

  const value: RoleContextType = {
    user,
    role: user?.role || null,
    permissions,
    isLoading,
    hasPermission,
    isAdmin,
    isAdvisor,
    isClient,
    canAccessRoute,
    getAccessibleClientIds,
    refreshUserRole,
  }

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  )
}

// Hook para usar el contexto de roles
export function useRole() {
  const context = useContext(RoleContext)
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider')
  }
  return context
}

// Hook para verificar permisos específicos
export function usePermission(permission: keyof RolePermissions) {
  const { hasPermission } = useRole()
  return hasPermission(permission)
}

// Hook para proteger componentes por rol
export function useRoleGuard(allowedRoles: UserRole[]) {
  const { role, isLoading } = useRole()
  
  const hasAccess = role ? allowedRoles.includes(role) : false
  
  return {
    hasAccess,
    isLoading,
    role,
  }
}

// Componente para proteger rutas por rol
interface RoleGuardProps {
  allowedRoles: UserRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { hasAccess, isLoading } = useRoleGuard(allowedRoles)
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }
  
  if (!hasAccess) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para acceder a esta sección.</p>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}