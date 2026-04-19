"use client"

import { useEffect, useState, useRef } from "react"
import { useRole } from "@/contexts/role-context"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Search, ExternalLink, Calendar, Filter } from "lucide-react"
import { useRouter } from "next/navigation"

interface LoanResult {
  id: string
  loanNumber: string
  amount: number
  interestRate: number
  termMonths: number
  monthlyPayment: number
  status: string
  startDate: string | null
  createdAt: string
  client: {
    dpi: string
    id: string
    firstName: string
    lastName: string
    email: string
    phone?: string
  }
}

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paid: "Pagado",
  pending: "Pendiente",
  rejected: "Rechazado",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  paid: "secondary",
  pending: "outline",
  rejected: "destructive",
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n)
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—"
  try {
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(d)
    const dt = isYMD ? new Date(d + "T00:00:00Z") : new Date(d)
    return dt.toLocaleDateString("es-GT", { year: "numeric", month: "short", day: "numeric", timeZone: "America/Guatemala" })
  } catch { return d }
}

export default function LoanHistoryPage() {
  const { role } = useRole()
  const router = useRouter()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [results, setResults] = useState<LoanResult[]>([])
  const [allLoans, setAllLoans] = useState<LoanResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Load all loans on mount
  useEffect(() => {
    if (role === "cliente") {
      router.replace("/dashboard")
      return
    }
    const fetchAll = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/loans/history")
        if (!res.ok) throw new Error("Error cargando historial")
        const data = await res.json()
        setAllLoans(data || [])
        setResults(data || [])
      } catch (e: any) {
        setError(e?.message || "Error desconocido")
      } finally {
        setIsLoading(false)
      }
    }
    fetchAll()
  }, [role])

  // Filter whenever search/status/dates change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const q = search.trim().toLowerCase()
      let filtered = allLoans.filter(loan => {
        const clientFullName = `${loan.client.firstName} ${loan.client.lastName}`.toLowerCase()
        const matchesSearch = !q ||
          clientFullName.includes(q) ||
          (loan.client.dpi || "").toLowerCase().includes(q) ||
          loan.loanNumber.toLowerCase().includes(q) ||
          (loan.client.email || "").toLowerCase().includes(q)

        const matchesStatus = statusFilter === "all" || loan.status === statusFilter

        const loanDate = loan.startDate || loan.createdAt
        const matchesFrom = !fromDate || (loanDate && loanDate >= fromDate)
        const matchesTo = !toDate || (loanDate && loanDate <= toDate)

        return matchesSearch && matchesStatus && matchesFrom && matchesTo
      })
      setResults(filtered)
    }, 250)
  }, [search, statusFilter, fromDate, toDate, allLoans])

  if (role === "cliente") return null
  if (isLoading) return <LoadingSpinner />

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Historial de Préstamos</h2>
        <p className="text-muted-foreground text-sm">Busca préstamos por nombre, DPI o número de préstamo</p>
      </div>

      {/* Filters */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros de búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="loan-history-search"
                placeholder="Nombre, DPI o No. préstamo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status filter — native select to avoid portal z-index issues */}
            <select
              id="loan-history-status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 text-foreground"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="paid">Pagado</option>
              <option value="pending">Pendiente</option>
              <option value="rejected">Rechazado</option>
            </select>

            {/* Date from */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="loan-history-from"
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="pl-9"
                placeholder="Desde"
              />
            </div>

            {/* Date to */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="loan-history-to"
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="pl-9"
                placeholder="Hasta"
              />
            </div>
          </div>

          {/* Active filters summary */}
          {(search || statusFilter !== "all" || fromDate || toDate) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Mostrando {results.length} de {allLoans.length} préstamos</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setSearch(""); setStatusFilter("all"); setFromDate(""); setToDate("") }}>
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</div>
      )}

      {/* Results */}
      {!error && results.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No se encontraron préstamos</p>
          <p className="text-sm mt-1">Intenta con un nombre, DPI o número de préstamo diferente</p>
        </div>
      )}

      <div className="space-y-3">
        {results.map(loan => {
          const clientName = `${loan.client.firstName} ${loan.client.lastName}`.trim()
          const statusLabel = STATUS_LABELS[loan.status] || loan.status
          const statusVariant = STATUS_VARIANTS[loan.status] || "outline"
          const loanDate = loan.startDate || loan.createdAt

          return (
            <Card key={loan.id} className="border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/70 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {/* Left: client + loan info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{clientName}</span>
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {loan.client.email}
                      {loan.client.phone ? ` · ${loan.client.phone}` : ""}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Préstamo</span>
                        <div className="font-medium text-foreground">#{loan.loanNumber}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Monto</span>
                        <div className="font-medium text-foreground">{formatCurrency(loan.amount)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Cuota mensual</span>
                        <div className="font-medium text-foreground">{formatCurrency(loan.monthlyPayment)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Plazo</span>
                        <div className="font-medium text-foreground">{loan.termMonths} meses</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Tasa</span>
                        <div className="font-medium text-foreground">{loan.interestRate}%</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Fecha inicio</span>
                        <div className="font-medium text-foreground">{formatDate(loanDate)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1"
                    onClick={() => router.push(`/dashboard/loans/${loan.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver préstamo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
