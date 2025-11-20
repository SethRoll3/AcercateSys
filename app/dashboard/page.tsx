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
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

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
  const [activeLoanDetails, setActiveLoanDetails] = useState<Record<string, any>>({})
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)

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
  const abortControllersRef = useRef<AbortController[]>([])
  const fetchWithTimeout = async (input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) => {
    const { timeoutMs = 12000, ...rest } = init
    const controller = new AbortController()
    abortControllersRef.current.push(controller)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(input, { ...rest, signal: controller.signal })
      return res
    } finally {
      clearTimeout(timeout)
      abortControllersRef.current = abortControllersRef.current.filter(c => c !== controller)
    }
  }

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const getUserWithRetry = async () => {
    const supabase = createClient()
    for (const ms of [1000, 2000, 4000]) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), ms)
      try {
        const res = await supabase.auth.getUser({ signal: controller.signal } as any)
        const u = res?.data?.user
        if (u) return u
      } catch (e) {
        console.warn(`[dashboard] Supabase auth request timed out after ${ms}ms`, e)
      } finally {
        clearTimeout(timeout)
      }
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
          const clientsQueryController = new AbortController()
          const clientsQueryTimeout = setTimeout(() => clientsQueryController.abort(), 8000)

          const userApiResponse = await fetchWithTimeout('/api/auth/user', { timeoutMs: 8000, credentials: 'include' as any });
          
          if (!userApiResponse.ok) {
            console.error('[dashboard] Failed to fetch user data from API:', userApiResponse.statusText);
            setUserData(null);
            setUserDataError('No se pudieron cargar tus datos');
          } else {
            const apiUserData = await userApiResponse.json();
            setUserData(apiUserData);
            setUserDataError(null);
          }
          
          const loansResponse = await fetchWithTimeout('/api/loans', { timeoutMs: 12000 });
          if (loansResponse.ok) {
            const loansData = await loansResponse.json();
            setLoans(loansData || []);
            setLoansError(null);
          } else {
            console.error('[dashboard] Failed to load loans:', loansResponse);
            setLoans([]);
            setLoansError('No se pudieron cargar los préstamos');
          }

          const clientsResponse = await fetchWithTimeout('/api/clients', { timeoutMs: 12000 });

          if (clientsResponse.ok) {
            const clientsData = await clientsResponse.json();
            setClients(clientsData || []);
          } else {
            console.error('[dashboard] Failed to load clients:', clientsResponse);
          }
          
          const groupsLoansResponse = await fetchWithTimeout('/api/loans-groups', { timeoutMs: 12000 });

          if (groupsLoansResponse.ok) {
            const groupsData = await groupsLoansResponse.json();
            setGroupLoans(groupsData || []);
            const map: Record<string, { groupName: string }> = {};
            for (const g of groupsData || []) {
              const name = g.group?.nombre || 'Grupo';
              for (const item of g.loans || []) {
                if (item.loan_id) {
                  map[item.loan_id] = { groupName: name };
                }
              }
            }
            setLoanGroupMap(map);
            setGroupsError(null);
          } else {
            console.error('[dashboard] Failed to load group loans:', groupsLoansResponse);
            setGroupsError('No se pudieron cargar los préstamos por grupo');
          }
          
          //clearTimeout(userQueryTimeout);
          clearTimeout(clientsQueryTimeout);
        }
      } catch (e) {
        console.error("Dashboard load error:", e)
      } finally {
        setIsLoading(false);
        inFlightRef.current = false
      }
    }
    fetchData();
    return () => {
      abortControllersRef.current.forEach(c => c.abort())
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (userData?.role === 'cliente' && loans.length > 0) {
      const activeLoans = (loans || []).filter((l: any) => l.status === 'active');
      if (activeLoans.length > 0) {
        // Seleccionar el primer préstamo activo si no hay ninguno seleccionado
        if (!selectedLoanId && activeLoans[0]?.id) {
          setSelectedLoanId(activeLoans[0].id);
        }
        
        const loanToFetch = selectedLoanId ? activeLoans.find(l => l.id === selectedLoanId) : activeLoans[0];

        if (loanToFetch?.id && !activeLoanDetails[loanToFetch.id]) {
          ;(async () => {
            try {
              const res = await fetch(`/api/loans?id=${loanToFetch.id}`, { credentials: 'include' as any })
              if (res.ok) {
                const data = await res.json()
                setActiveLoanDetails(prev => ({ ...prev, [loanToFetch.id]: data }))
              }
            } catch {}
          })()
        }
      } else {
        setSelectedLoanId(null);
      }
    }
  }, [userData?.role, loans, selectedLoanId, activeLoanDetails])

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

  const getProgressColor = (paid: number, total: number) => {
    if (total === 0) return '#e5e7eb';
    const percentage = (paid / total) * 100;
    if (percentage <= 33) return '#ef4444'; // red
    if (percentage <= 66) return '#facc15'; // yellow
    return '#22c55e'; // green
  };

  return (
    <>
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold text-foreground mb-2 truncate">
            {userData.role === "admin" ? "Panel de Administración" : "Mis Préstamos"}
          </h2>
          <p className="text-muted-foreground">
            {userData.role === "admin"
              ? "Resumen general del sistema de préstamos"
              : "Gestiona y revisa tus préstamos activos"}
          </p>
        </div>
        {userData.role === "admin" && (
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" asChild>
              <a href="/api/reports/loans-excel" target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
                Exportar Excel
              </a>
            </Button>
            <CreateLoanDialog clients={transformedClients} onLoanCreated={fetchLoans} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
        {userData.role === 'cliente' ? (
          <Tabs value={selectedLoanId || ''} onValueChange={setSelectedLoanId} className="w-full">
            <TabsList className="flex w-full max-w-full gap-2 overflow-x-auto bg-muted/50 whitespace-nowrap">
              {(loans || []).filter((l: any) => l.status === 'active').map((loan: any) => (
                <TabsTrigger key={loan.id} value={loan.id} className="shrink-0 px-3 text-xs sm:text-sm truncate max-w-[70vw] sm:max-w-none">
                  Préstamo {loan.loanNumber || loan.loan_number}
                </TabsTrigger>
              ))}
            </TabsList>
            {(loans || []).filter((l: any) => l.status === 'active').map((loan: any) => (
              <TabsContent key={loan.id} value={loan.id}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card progreso préstamo */}
                  <div
                    className="rounded-lg border bg-card/50 p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                    onClick={() => {
                      if (loan?.id) {
                        window.location.href = `/dashboard/loans/${loan.id}`
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-lg font-semibold">Mi Préstamo</div>
                      <div className="text-sm text-muted-foreground">{loan.loanNumber || loan.loan_number || ''}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-40 h-40 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie dataKey="value" data={[{ name: 'Pagadas', value: (activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length }, { name: 'Restantes', value: Math.max(0, (activeLoanDetails[loan.id]?.schedule || []).length - (activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length) }]} innerRadius={50} outerRadius={75} paddingAngle={2}>
                              <Cell fill={getProgressColor((activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length, (activeLoanDetails[loan.id]?.schedule || []).length)} />
                              <Cell fill="#e5e7eb" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="text-2xl font-bold">{(activeLoanDetails[loan.id]?.schedule || []).filter((s: any) => s.status === 'paid').length}/{(activeLoanDetails[loan.id]?.schedule || []).length}</div>
                          <div className="text-xs text-muted-foreground">cuotas pagadas</div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="text-sm text-muted-foreground">Monto</div>
                        <div className="text-xl font-semibold">{formatCurrency(loan.amount || 0)}</div>
                        <div className="text-sm text-muted-foreground">Toque para ver detalle</div>
                      </div>
                    </div>
                  </div>

                  {/* Card registrar pago */}
                  <div
                    className="rounded-lg border bg-card/50 p-4 hover:bg-muted/40 transition-all duration-200 cursor-pointer"
                    onClick={() => {
                      const schedule: any[] = (activeLoanDetails[loan.id]?.schedule || [])
                      const next = schedule.find((s: any) => s.status !== 'paid')
                      if (loan?.id && next?.id) {
                        window.location.href = `/dashboard/loans/${loan.id}/payment?scheduleId=${next.id}`
                      }
                    }}
                  >
                    <div className="text-lg font-semibold mb-2">Registrar Pago</div>
                    <div className="text-sm text-muted-foreground mb-3">Para el préstamo {loan.loanNumber || loan.loan_number || ''}</div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      {(() => {
                        const schedule: any[] = (activeLoanDetails[loan.id]?.schedule || [])
                        const next = schedule.find((s: any) => s.status !== 'paid')
                        const label = next ? `Cuota siguiente a pagar: #${next.payment_number}` : 'No hay cuotas pendientes'
                        return (
                          <div className="flex items-center justify-between">
                            <div className="text-sm">{label}</div>
                            <div className="text-sm text-muted-foreground">Préstamo {loan.loanNumber || loan.loan_number || ''}</div>
                          </div>
                        )
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">Toque para ir a registrar el pago</div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Tabs defaultValue="clients" className="w-full">
            <TabsList className="grid w-full max-w-full grid-cols-2 bg-muted/50">
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
        )}
      </div>
    </>
  )
}
