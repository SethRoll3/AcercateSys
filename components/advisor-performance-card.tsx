"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts'
import { ArrowUpRight, ArrowDownRight, Users, Wallet, AlertTriangle, CheckCircle2, BadgeDollarSign, History, ChevronDown, ChevronRight, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState } from "react"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface CommissionData {
  total: number
  onTime: number
  late1to30: number
  lateOver30: number
  paymentCount: number
  breakdown: { label: string; amount: number; pct: string; color: string }[]
}

interface AdvisorStats {
  totalPortfolio: number
  recoveredAmount: number
  outstandingBalance: number
  activeLoansCount: number
  moraLoansCount: number
  moraAmount: number
  clientsCount: number
  portfolioHealth: { name: string; value: number; color: string }[]
  recoveryProgress: number
  commission?: CommissionData
}

interface AdvisorPerformanceCardProps {
  advisor: {
    id: string
    name: string
    email: string
    avatarUrl?: string
  }
  stats: AdvisorStats
  onViewDetails: () => void
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    maximumFractionDigits: 2,
  }).format(amount)
}

const formatCurrencyShort = (amount: number) => {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function AdvisorPerformanceCard({ advisor, stats, onViewDetails }: AdvisorPerformanceCardProps) {
  const initials = advisor.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()

  const commission = stats.commission

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Breakdown modal state
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const [breakdownData, setBreakdownData] = useState<any>(null)
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false)
  const [expandedLoans, setExpandedLoans] = useState<Set<string>>(new Set())

  const handleOpenHistory = async () => {
    setIsHistoryOpen(true)
    setIsLoadingHistory(true)
    try {
      const res = await fetch(`/api/advisors/commissions/history?advisor_id=${advisor.id}`)
      if (res.ok) {
        const data = await res.json()
        setHistoryData(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleOpenBreakdown = async () => {
    setIsBreakdownOpen(true)
    setIsLoadingBreakdown(true)
    setExpandedLoans(new Set())
    try {
      const res = await fetch(`/api/advisors/commissions/breakdown?advisor_id=${advisor.id}`)
      if (res.ok) {
        const data = await res.json()
        setBreakdownData(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoadingBreakdown(false)
    }
  }

  const toggleLoanExpanded = (loanId: string) => {
    setExpandedLoans(prev => {
      const next = new Set(prev)
      if (next.has(loanId)) next.delete(loanId)
      else next.add(loanId)
      return next
    })
  }

  const bucketColors: Record<string, string> = {
    onTime: '#22c55e',
    late1to30: '#facc15',
    lateOver30: '#f97316'
  }

  const fmtDate = (d: string) => {
    try {
      const date = new Date(d + 'T12:00:00Z')
      if (Number.isNaN(date.getTime())) return d
      return new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Guatemala' }).format(date)
    } catch { return d }
  }

  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 group">
      <CardHeader className="flex flex-row items-center gap-4 pb-2 border-b border-border/50">
        <Avatar className="h-12 w-12 border-2 border-primary/20">
          <AvatarImage src={advisor.avatarUrl} alt={advisor.name} />
          <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base font-bold truncate">{advisor.name}</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{advisor.email}</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1">
              <Users className="h-3 w-3" />
              {stats.clientsCount}
            </Badge>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onViewDetails} className="shrink-0 text-muted-foreground hover:text-primary">
          <ArrowUpRight className="h-5 w-5" />
        </Button>
      </CardHeader>
      
      <CardContent className="p-4 space-y-6">
        {/* Main Metric: Cartera Total */}
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Cartera Total Gestionada
          </div>
          <div className="text-3xl font-bold text-primary tracking-tight">
            {formatCurrencyShort(stats.totalPortfolio)}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-500 font-medium flex items-center">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              {Math.round(stats.recoveryProgress)}% recuperado
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {formatCurrencyShort(stats.outstandingBalance)} pendiente
            </span>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-background/40 rounded-lg p-3 border border-border/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Activos</span>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            </div>
            <div className="text-xl font-bold">{stats.activeLoansCount}</div>
            <div className="text-[10px] text-muted-foreground">préstamos</div>
          </div>
          
          <div className="bg-background/40 rounded-lg p-3 border border-border/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">En Mora</span>
              <AlertTriangle className="h-3 w-3 text-red-500" />
            </div>
            <div className="text-xl font-bold text-red-500">{stats.moraLoansCount}</div>
            <div className="text-[10px] text-muted-foreground">{formatCurrencyShort(stats.moraAmount)}</div>
          </div>
        </div>

        {/* Commission Section */}
        {commission && (
          <div className="bg-background/40 rounded-lg p-3 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase text-muted-foreground">Comisión (Periodo Actual)</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={handleOpenHistory} title="Ver historial de pagos">
                  <History className="h-3 w-3" />
                </Button>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {commission.paymentCount} pagos
                </Badge>
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-500">
              {formatCurrency(commission.total)}
            </div>
            
            {/* Stacked bar */}
            {commission.total > 0 && (
              <div className="h-3 w-full rounded-full overflow-hidden flex bg-secondary">
                {commission.breakdown.filter(b => b.amount > 0).map((segment, idx) => {
                  const widthPct = commission.total > 0 ? (segment.amount / commission.total) * 100 : 0
                  return (
                    <div
                      key={idx}
                      className="h-full transition-all duration-500"
                      style={{ width: `${widthPct}%`, backgroundColor: segment.color }}
                      title={`${segment.label}: ${formatCurrency(segment.amount)}`}
                    />
                  )
                })}
              </div>
            )}

            {/* Breakdown list */}
            <div className="space-y-1.5">
              {commission.breakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                  <span className={`font-medium ${item.amount > 0 ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          {/* Portfolio Health Pie */}
          <div className="flex flex-col items-center">
            <div className="h-24 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.portfolioHealth}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={35}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {stats.portfolioHealth.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-[10px] font-bold text-muted-foreground text-center leading-tight">
                  Estado<br/>Cartera
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1 w-full">
              {stats.portfolioHealth.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] text-muted-foreground leading-none">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recovery Progress Bar */}
          <div className="flex flex-col justify-center space-y-2">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Recuperado</span>
              <span>{formatCurrencyShort(stats.recoveredAmount)}</span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(stats.recoveryProgress, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Meta</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        <Button 
          variant="outline" 
          className="w-full text-xs h-8 bg-transparent hover:bg-primary/5 hover:text-primary border-dashed"
          onClick={handleOpenBreakdown}
        >
          Ver desglose detallado
        </Button>
      </CardContent>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de Cortes - {advisor.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isLoadingHistory ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No hay historial de cortes para este asesor.</div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Fecha de Corte</TableHead>
                      <TableHead>Periodo</TableHead>
                      <TableHead className="text-right">Monto Pagado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.map((record) => {
                      const createDate = new Date(record.created_at)
                      const start = new Date(record.start_date)
                      const end = new Date(record.end_date)
                      const fmtDate = (d: Date) => Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', year: 'numeric' }).format(d)
                      
                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{fmtDate(createDate)}</TableCell>
                          <TableCell className="text-muted-foreground">Del {fmtDate(start)} al {fmtDate(end)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-500">{formatCurrency(Number(record.amount))}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Breakdown Modal */}
      <Dialog open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-2xl">
          <DialogHeader className="p-6 pb-3 border-b border-border/50 bg-card/40 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BadgeDollarSign className="h-5 w-5 text-emerald-500" />
              Desglose de Comisión — {advisor.name}
            </DialogTitle>
            {breakdownData && (
              <div className="flex items-center gap-4 mt-2">
                <Badge variant="secondary" className="text-xs">{breakdownData.totalPayments} pagos</Badge>
                <Badge variant="secondary" className="text-xs">{breakdownData.loans?.length || 0} préstamos</Badge>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
            {isLoadingBreakdown ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : !breakdownData || (breakdownData.loans || []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                No hay comisiones pendientes para este asesor.
              </div>
            ) : (
              <div className="space-y-3">
                {(breakdownData.loans || []).map((loan: any) => {
                  const isExpanded = expandedLoans.has(loan.loan_id)
                  const stClass = loan.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : loan.status === 'paid'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-muted text-muted-foreground'

                  return (
                    <div key={loan.loan_id} className="rounded-lg border border-border/50 overflow-hidden bg-card/30 transition-all duration-200 hover:bg-card/50">
                      {/* Loan Header — clickable to expand */}
                      <button
                        onClick={() => toggleLoanExpanded(loan.loan_id)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
                      >
                        <div className="shrink-0 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">#{loan.loan_number}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${stClass}`}>{loan.status}</span>
                            <span className="text-xs text-muted-foreground">{loan.paid_installments}/{loan.total_installments} pagadas</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {loan.client_name} · {loan.client_email}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-emerald-500">{formatCurrency(loan.commission)}</div>
                          <div className="text-[10px] text-muted-foreground">comisión</div>
                        </div>
                      </button>

                      {/* Expanded: installment details */}
                      {isExpanded && (
                        <div className="border-t border-border/30 bg-background/40">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border/30 bg-muted/20">
                                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Cuota</th>
                                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Vencimiento</th>
                                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Fecha Pago</th>
                                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Interés</th>
                                  <th className="text-center px-4 py-2 font-semibold text-muted-foreground">Tasa</th>
                                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Comisión</th>
                                  <th className="text-center px-4 py-2 font-semibold text-muted-foreground">Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loan.installments.map((inst: any, idx: number) => (
                                  <tr key={inst.schedule_id} className={`border-b border-border/20 ${idx % 2 === 0 ? 'bg-muted/5' : ''} hover:bg-muted/15 transition-colors`}>
                                    <td className="px-4 py-2 font-medium text-foreground">#{inst.payment_number}</td>
                                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(inst.due_date)}</td>
                                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(inst.payment_date)}</td>
                                    <td className="px-4 py-2 text-right tabular-nums text-foreground">{formatCurrency(inst.interest)}</td>
                                    <td className="px-4 py-2 text-center">
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                        style={{ backgroundColor: `${bucketColors[inst.bucket]}20`, color: bucketColors[inst.bucket] }}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bucketColors[inst.bucket] }} />
                                        {inst.rate_label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-500">{formatCurrency(inst.commission_amount)}</td>
                                    <td className="px-4 py-2 text-center">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] px-2 hover:bg-primary/10 hover:text-primary"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          window.location.href = `/dashboard/loans/${loan.loan_id}`
                                        }}
                                      >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Ver
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {/* Loan subtotal */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/15 border-t border-border/30">
                            <span className="text-xs text-muted-foreground font-medium">Subtotal préstamo #{loan.loan_number}</span>
                            <span className="text-sm font-bold text-emerald-500">{formatCurrency(loan.commission)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer: Grand Total */}
          {breakdownData && breakdownData.totalCommission > 0 && (
            <div className="border-t border-border/50 bg-card/60 px-6 py-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Total comisión del periodo ({breakdownData.totalPayments} pagos en {breakdownData.loans?.length || 0} préstamos)
                </div>
                <div className="text-xl font-bold text-emerald-500">
                  {formatCurrency(breakdownData.totalCommission)}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
