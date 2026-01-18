"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts'
import { ArrowUpRight, ArrowDownRight, Users, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react"

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
            {formatCurrency(stats.totalPortfolio)}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-500 font-medium flex items-center">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              {Math.round(stats.recoveryProgress)}% recuperado
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {formatCurrency(stats.outstandingBalance)} pendiente
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
            <div className="text-[10px] text-muted-foreground">{formatCurrency(stats.moraAmount)}</div>
          </div>
        </div>

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
              <span>{formatCurrency(stats.recoveredAmount)}</span>
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
          onClick={onViewDetails}
        >
          Ver desglose detallado
        </Button>
      </CardContent>
    </Card>
  )
}
