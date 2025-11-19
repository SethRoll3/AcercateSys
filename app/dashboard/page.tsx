'use client'

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { StatsCard } from "@/components/stats-card"
import { LoadingSpinner } from "@/components/loading-spinner";
import { LoansTable } from "@/components/loans-table"
import { GroupLoansTable } from "@/components/group-loans-table"
import { CreateLoanDialog } from "@/components/create-loan-dialog"
import { PaymentsReport } from "@/components/payments-report"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DollarSign, Users, TrendingUp, FileText, Download } from "lucide-react"

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null)
  const [userData, setUserData] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [groupLoans, setGroupLoans] = useState<any[]>([])
  const [loanGroupMap, setLoanGroupMap] = useState<Record<string, { groupName: string }>>({})
  const [userDataError, setUserDataError] = useState<string | null>(null)
  const [loansError, setLoansError] = useState<string | null>(null)
  const [groupsError, setGroupsError] = useState<string | null>(null)

  const fetchLoans = useCallback(async () => {
    try {
      const response = await fetch('/api/loans');
      if (!response.ok) {
        throw new Error('Failed to fetch loans');
      }
      const loansData = await response.json();
      setLoans(loansData || []);
    } catch (error) {
      console.error("Failed to fetch loans:", error);
      setLoans([]);
    }
  }, []);

  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const fetchWithTimeout = async (input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) => {
    const { timeoutMs = 12000, ...rest } = init
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(input, { ...rest, signal: controller.signal })
      return res
    } finally {
      clearTimeout(timeout)
    }
  }

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const getUserWithRetry = async () => {
    const supabase = createClient()
    for (const ms of [300, 600, 1200]) {
      const res = await supabase.auth.getUser()
      const u = res?.data?.user
      if (u) return u
      await delay(ms)
    }
    try {
      const fallback = await fetchWithTimeout('/api/auth/user', { timeoutMs: 8000, credentials: 'include' as any })
      if (fallback.ok) {
        const data = await fallback.json()
        return { id: data.id, email: data.email }
      }
    } catch {}
    return null
  }

  useEffect(() => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const fetchData = async () => {
      setIsLoading(true);
      const hardTimeout = setTimeout(() => {
        setIsLoading(false)
        inFlightRef.current = false
        if (!userData) {
          setUserDataError('Tiempo de espera excedido al cargar el dashboard')
        }
        console.warn('[dashboard] Hard timeout reached while loading data')
      }, 5000)
      try {
        const supabase = createClient();
        const user = await getUserWithRetry()
        setUser(user);
        if (!user) {
          // Sesión inválida: redirigir a login
          window.location.href = '/auth/login'
          return
        }
        if (user) {
          const [userDataResponse, loansResponse, clientsResponse, groupsLoansResponse] = await Promise.allSettled([
            supabase.from("users").select("*").eq("auth_id", user.id).single(),
            fetchWithTimeout('/api/loans', { timeoutMs: 12000 }),
            supabase.from("clients").select("*").order("created_at", { ascending: false }),
            fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 })
          ])

          if (userDataResponse.status === 'fulfilled') {
            setUserData(userDataResponse.value.data)
            setUserDataError(null)
          } else {
            setUserData(null)
            setUserDataError('No se pudieron cargar tus datos')
          }

          if (loansResponse.status === 'fulfilled' && loansResponse.value.ok) {
            const loansData = await loansResponse.value.json();
            setLoans(loansData || []);
            setLoansError(null)
          } else {
            setLoans([]);
            setLoansError('No se pudieron cargar los préstamos')
          }

          if (clientsResponse.status === 'fulfilled') {
            setClients(clientsResponse.value.data || [])
          }

          if (groupsLoansResponse.status === 'fulfilled' && groupsLoansResponse.value.ok) {
            const groupsData = await groupsLoansResponse.value.json()
            setGroupLoans(groupsData || [])
            const map: Record<string, { groupName: string }> = {}
            for (const g of groupsData || []) {
              const name = g.group?.nombre || 'Grupo'
              for (const item of g.loans || []) {
                if (item.loan_id) {
                  map[item.loan_id] = { groupName: name }
                }
              }
            }
            setLoanGroupMap(map)
            setGroupsError(null)
          } else {
            setGroupsError('No se pudieron cargar los préstamos por grupo')
          }
        }
      } catch (e) {
        console.error("Dashboard load error:", e)
      } finally {
        setIsLoading(false);
        inFlightRef.current = false
        clearTimeout(hardTimeout)
      }
    }
    fetchData();
    return () => {
      abortRef.current?.abort()
      inFlightRef.current = false
    }
  }, [])

  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (!userData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">No se pudieron cargar tus datos. Intenta nuevamente.</p>
          <Button variant="outline" onClick={() => {
            inFlightRef.current = false
            // Reintentar cargando
            const evt = new Event('retry-load')
            // Simplemente forzar re-montaje
            window.location.reload()
          }}>Reintentar</Button>
        </div>
      </div>
    )
  }

  const transformedClients = clients.map((c: any) => ({
    id: c.id,
    fullName: `${c.first_name} ${c.last_name}`,
  }))

  const displayLoans = loans;

  const totalLoanAmount = displayLoans.reduce((sum: any, loan: any) => sum + loan.amount, 0)
  const activeLoans = displayLoans.filter((loan: any) => loan.status === "active").length
  const totalClients = clients.length

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {userData.role === "admin" ? "Panel de Administración" : "Mis Préstamos"}
          </h2>
          <p className="text-muted-foreground">
            {userData.role === "admin"
              ? "Resumen general del sistema de préstamos"
              : "Gestiona y revisa tus préstamos activos"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userData.role === "admin" && (
            <>
              <Button variant="outline" className="gap-2 bg-transparent" asChild>
                <a href="/api/reports/loans-excel" target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" />
                  Exportar Excel
                </a>
              </Button>
              <CreateLoanDialog clients={transformedClients} onLoanCreated={fetchLoans} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatsCard
          title="Total en Préstamos"
          value={formatCurrency(totalLoanAmount)}
          description="Monto total prestado"
          icon={DollarSign}
        />
        <StatsCard title="Préstamos Activos" value={activeLoans} description="Préstamos en curso" icon={TrendingUp} />
        {userData.role === "admin" && (
          <>
            <StatsCard title="Total Clientes" value={totalClients} description="Clientes registrados" icon={Users} />
            <StatsCard
              title="Total Préstamos"
              value={displayLoans.length}
              description="Todos los préstamos"
              icon={FileText}
            />
          </>
        )}
      </div>

      {userData.role === "admin" && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-foreground mb-4">Reportes</h3>
          <PaymentsReport />
        </div>
      )}

      <div className="mb-6">
        <Tabs defaultValue="clients">
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="groups">Grupos</TabsTrigger>
          </TabsList>
        <TabsContent value="clients">
          <h3 className="text-xl font-semibold text-foreground mb-4">
            {userData.role === "admin" ? "Todos los Préstamos" : "Mis Préstamos"}
          </h3>
          {loansError && (
            <div className="mb-3 text-sm text-muted-foreground flex items-center gap-2">
              <span>{loansError}</span>
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  const res = await fetchWithTimeout('/api/loans', { timeoutMs: 12000 })
                  if (res.ok) {
                    const data = await res.json()
                    setLoans(data || [])
                    setLoansError(null)
                  }
                } catch {}
              }}>Reintentar</Button>
            </div>
          )}
          <LoansTable loans={displayLoans} userRole={userData.role} onLoanUpdated={fetchLoans} groupMap={loanGroupMap} />
        </TabsContent>
        <TabsContent value="groups">
          <h3 className="text-xl font-semibold text-foreground mb-4">Préstamos por Grupo</h3>
          {groupsError && (
            <div className="mb-3 text-sm text-muted-foreground flex items-center gap-2">
              <span>{groupsError}</span>
              <Button variant="outline" size="sm" onClick={async () => {
                try {
                  const res = await fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 })
                  if (res.ok) {
                    const groupsData = await res.json()
                    setGroupLoans(groupsData || [])
                    const map: Record<string, { groupName: string }> = {}
                    for (const g of groupsData || []) {
                      const name = g.group?.nombre || 'Grupo'
                      for (const item of g.loans || []) {
                        if (item.loan_id) {
                          map[item.loan_id] = { groupName: name }
                        }
                      }
                    }
                    setLoanGroupMap(map)
                    setGroupsError(null)
                  }
                } catch {}
              }}>Reintentar</Button>
            </div>
          )}
            <GroupLoansTable
              items={(groupLoans || []).map((g: any) => {
                const clientsItems = (g.loans || []).map((item: any) => {
                  const loan = loans.find((l: any) => l.id === item.loan_id)
                  const name = loan?.client ? `${loan.client.firstName ?? loan.client.first_name} ${loan.client.lastName ?? loan.client.last_name}` : ''
                  const amount = loan?.amount ? Number(loan.amount) : 0
                  return { name, amount }
                })
                return {
                  groupName: g.group?.nombre ?? 'Grupo',
                  totalAmount: Number(g.total_amount) || clientsItems.reduce((s: number, c: any) => s + (c.amount || 0), 0),
                  clients: clientsItems,
                  groupId: g.group_id,
                }
              })}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
