"use client"

import { useEffect, useMemo, useState } from "react"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRole } from "@/contexts/role-context"
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, setYear, setMonth, setDate as setDay, getDaysInMonth, isSameMonth, isValid, parseISO } from "date-fns"
import { es } from "date-fns/locale"

type LogRow = {
  id: string
  actor_user_id: string | null
  action_type: string
  entity_name: string
  entity_id: string | null
  action_at: string
  details: any
}

type UserRow = { id: string; email: string; full_name?: string | null }

const MONTHS = [
  { value: "0", label: "Enero" },
  { value: "1", label: "Febrero" },
  { value: "2", label: "Marzo" },
  { value: "3", label: "Abril" },
  { value: "4", label: "Mayo" },
  { value: "5", label: "Junio" },
  { value: "6", label: "Julio" },
  { value: "7", label: "Agosto" },
  { value: "8", label: "Septiembre" },
  { value: "9", label: "Octubre" },
  { value: "10", label: "Noviembre" },
  { value: "11", label: "Diciembre" },
]

export default function LogsPage() {
  const { isLoading, isAdmin } = useRole()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [users, setUsers] = useState<UserRow[]>([])
  const [order, setOrder] = useState<"asc" | "desc">("desc")

  // Filters
  const [actorId, setActorId] = useState<string | undefined>(undefined)
  const [actionType, setActionType] = useState<string | undefined>(undefined)
  const [entityName, setEntityName] = useState<string | undefined>(undefined)

  // Date Logic
  const [dateMode, setDateMode] = useState<"linked" | "range" | "none">("linked")
  
  // Linked Mode State
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))
  const [selectedMonth, setSelectedMonth] = useState<string>("all")
  const [selectedWeek, setSelectedWeek] = useState<string>("all")
  const [selectedDay, setSelectedDay] = useState<string>("all")

  // Range Mode State
  const [rangeStart, setRangeStart] = useState<string>("")
  const [rangeEnd, setRangeEnd] = useState<string>("")

  const years = useMemo(() => {
    const current = new Date().getFullYear()
    const list = []
    for (let i = current; i >= 2020; i--) {
      list.push(String(i))
    }
    return list
  }, [])

  const weekOptions = useMemo(() => {
    if (selectedMonth === "all") return []
    // Return 6 possible weeks to cover all partial weeks
    return [1, 2, 3, 4, 5, 6].map(i => ({ value: String(i-1), label: `Semana ${i}` }))
  }, [selectedMonth])

  const dayOptions = useMemo(() => {
    if (selectedMonth === "all") return []
    const year = parseInt(selectedYear)
    const month = parseInt(selectedMonth)
    const days = getDaysInMonth(new Date(year, month))
    return Array.from({ length: days }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
  }, [selectedYear, selectedMonth])

  // Calculated Date Range for API
  const calculatedDateRange = useMemo(() => {
    if (dateMode === "none") return { start: undefined, end: undefined }
    
    if (dateMode === "range") {
      if (!rangeStart || !rangeEnd) return { start: undefined, end: undefined }
      return { 
        start: format(parseISO(rangeStart), "yyyy-MM-dd'T'00:00:00"), 
        end: format(parseISO(rangeEnd), "yyyy-MM-dd'T'23:59:59") 
      }
    }

    // Linked Mode
    const year = parseInt(selectedYear)
    let start = startOfYear(new Date(year, 0, 1))
    let end = endOfYear(new Date(year, 0, 1))

    if (selectedMonth !== "all") {
      const month = parseInt(selectedMonth)
      const monthDate = new Date(year, month, 1)
      start = startOfMonth(monthDate)
      end = endOfMonth(monthDate)

      if (selectedDay !== "all") {
        const day = parseInt(selectedDay)
        const dayDate = new Date(year, month, day)
        start = dayDate
        end = dayDate
      } else if (selectedWeek !== "all") {
        const weekIndex = parseInt(selectedWeek) 
        let current = startOfWeek(start, { weekStartsOn: 1 })
        current = addWeeks(current, weekIndex)
        
        // Ensure the calculated week doesn't exceed month boundaries if we want strictly "week of month"
        // But for filtering, it's okay if it overlaps, usually.
        // However, user said "Semana con Mes".
        // Let's just return the week range.
        start = current
        end = endOfWeek(current, { weekStartsOn: 1 })
      } 
    }
    
    return { 
      start: format(start, "yyyy-MM-dd'T'00:00:00"), 
      end: format(end, "yyyy-MM-dd'T'23:59:59") 
    }
  }, [dateMode, selectedYear, selectedMonth, selectedWeek, selectedDay, rangeStart, rangeEnd])

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users")
      if (!res.ok) return
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      setUsers(rows.map((r: any) => ({ id: r.id, email: r.email, full_name: r.full_name ?? null })))
    } catch {}
  }

  const loadData = async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(p))
      params.set("pageSize", String(pageSize))
      params.set("order", order)
      if (actorId) params.set("actorId", actorId)
      if (actionType) params.set("actionType", actionType)
      if (entityName) params.set("entityName", entityName)
      
      const { start, end } = calculatedDateRange
      if (start && end) {
        params.set("dateStart", start)
        params.set("dateEnd", end)
      }

      const res = await fetch(`/api/logs?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setTotal(data.total || 0)
        setPage(data.page || p)
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const resetFilters = () => {
    setActorId(undefined)
    setActionType(undefined)
    setEntityName(undefined)
    setDateMode("linked")
    setSelectedYear(String(new Date().getFullYear()))
    setSelectedMonth("all")
    setSelectedWeek("all")
    setSelectedDay("all")
    setRangeStart("")
    setRangeEnd("")
    setOrder("desc")
  }

  useEffect(() => {
    if (isLoading) return
    if (!isAdmin()) return
    loadUsers()
    loadData(1)
  }, [isLoading])

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAdmin()) {
    return (
      <div className="p-6">
        <div className="text-center">No autorizado</div>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs del Sistema</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled>Exportar</Button>
          <Button variant="outline" onClick={() => { resetFilters(); setTimeout(() => loadData(1), 0) }}>Resetear</Button>
          <Button onClick={() => loadData(1)}>Aplicar Filtros</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Usuario</label>
          <Select value={actorId || ""} onValueChange={(v) => setActorId(v || undefined)}>
            <SelectTrigger>
              <SelectValue placeholder="Todos los usuarios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Acción</label>
          <Select value={actionType || ""} onValueChange={(v) => setActionType(v || undefined)}>
            <SelectTrigger>
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CREATE">CREAR</SelectItem>
              <SelectItem value="UPDATE">ACTUALIZAR</SelectItem>
              <SelectItem value="DELETE">ELIMINAR</SelectItem>
              <SelectItem value="ACCESS">ACCESO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Entidad / Tabla</label>
          <Input value={entityName || ""} onChange={(e) => setEntityName(e.target.value || undefined)} placeholder="Ej: clients, users" />
        </div>
      </div>

      <div className="p-4 border rounded-lg space-y-4 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Modo de Fecha:</label>
          <div className="flex gap-2">
            <Button 
              variant={dateMode === "linked" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setDateMode("linked")}
            >
              Vinculada (Año/Mes/Semana)
            </Button>
            <Button 
              variant={dateMode === "range" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setDateMode("range")}
            >
              Rango Manual
            </Button>
            <Button 
              variant={dateMode === "none" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setDateMode("none")}
            >
              Sin Filtro de Fecha
            </Button>
          </div>
        </div>

        {dateMode === "linked" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Año</label>
              <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setSelectedMonth("all"); setSelectedWeek("all"); setSelectedDay("all"); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Mes</label>
              <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setSelectedWeek("all"); setSelectedDay("all"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todo el año" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el año</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Semana</label>
              <Select disabled={selectedMonth === "all" || selectedDay !== "all"} value={selectedWeek} onValueChange={(v) => setSelectedWeek(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {weekOptions.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Día</label>
              <Select disabled={selectedMonth === "all" || selectedWeek !== "all"} value={selectedDay} onValueChange={(v) => setSelectedDay(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {dayOptions.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {dateMode === "range" && (
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 justify-end">
        <label className="text-sm">Orden</label>
        <Select value={order} onValueChange={(v: any) => setOrder(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Más recientes primero</SelectItem>
            <SelectItem value="asc">Más antiguos primero</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Detalles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const actor = users.find(u => u.id === row.actor_user_id)
              const actionLabel = 
                row.action_type === 'CREATE' ? 'CREAR' : 
                row.action_type === 'UPDATE' ? 'ACTUALIZAR' : 
                row.action_type === 'DELETE' ? 'ELIMINAR' : 
                row.action_type === 'ACCESS' ? 'ACCESO' : 
                row.action_type
              
              const detailsMessage = row.details?.message 
                ? row.details.message 
                : JSON.stringify(row.details)

              return (
                <TableRow key={row.id}>
                  <TableCell>{format(new Date(row.action_at), "yyyy-MM-dd HH:mm:ss")}</TableCell>
                  <TableCell>{actor ? (actor.full_name || actor.email) : (row.actor_user_id || "Sistema")}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded text-xs font-medium ${
                    row.action_type === 'CREATE' ? 'bg-green-100 text-green-800' :
                    row.action_type === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                    row.action_type === 'DELETE' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>{actionLabel}</span></TableCell>
                  <TableCell>{row.entity_name}</TableCell>
                  <TableCell className="max-w-[300px] text-xs text-muted-foreground break-words">
                    {detailsMessage}
                  </TableCell>
                </TableRow>
              )
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No se encontraron registros</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Total: {total} registros</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadData(p) }}>Anterior</Button>
          <div className="text-sm">Página {page} de {totalPages}</div>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); loadData(p) }}>Siguiente</Button>
        </div>
      </div>
    </div>
  )
}
