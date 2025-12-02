"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CreateUserForm } from "@/components/forms/create-user-form"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface User {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const router = useRouter()

  const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER
  const readCache = (key: string) => {
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) return null
      const obj = JSON.parse(raw)
      if (!obj || typeof obj.ts !== 'number') return null
      if (Date.now() - obj.ts > CACHE_TTL_MS) return null
      return obj.data ?? null
    } catch {}
    return null
  }
  const writeCache = (key: string, data: any) => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    } catch {}
  }

  const K = {
    users: 'users:list',
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users")
      if (!response.ok) {
        throw new Error("Failed to fetch users")
      }
      const data = await response.json()
      setUsers(data)
      writeCache(K.users, data)
    } catch (error) {
      console.error("Error fetching users:", error)
      toast.error("Error al cargar usuarios")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const cachedUsers = readCache(K.users)
    if (cachedUsers) {
      setUsers(cachedUsers)
      setIsLoading(false)
    } else {
      fetchUsers()
    }
  }, [])

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador'
      case 'asesor':
        return 'Asesor'
      case 'cliente':
        return 'Cliente'
      default:
        return role
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 backdrop-blur-sm">
        <CardHeader className="space-y-2">
          <CardTitle>Usuarios</CardTitle>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Buscar usuario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:max-w-sm"
            />
            <CreateUserForm onUserCreated={fetchUsers} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-md border bg-card/50 backdrop-blur-sm px-4 py-3 transition-all duration-200 hover:bg-muted/40">
                <div className="font-medium">
                  <div>{user.full_name}</div>
                  <div className="text-sm text-muted-foreground">{user.email} - {getRoleDisplayName(user.role)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/dashboard/users/${user.id}`)}
                >
                  Ver detalles
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
