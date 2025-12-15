import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: React.ComponentType<{ className?: string }>
  trend?: {
    value: number
    isPositive: boolean
  }
  onClick?: () => void
  className?: string
}

export function StatsCard({ title, value, description, icon: Icon, trend, onClick, className }: StatsCardProps) {
  return (
    <Card
      className={`border-border/50 bg-card/50 backdrop-blur-sm ${onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''} ${className || ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Ajustado el padding (p-3 en mobile) y el margen inferior */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 sm:p-5">
        {/* Texto más pequeño en mobile (text-[10px]) para que quepa en 2 columnas */}
        <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground truncate pr-1">{title}</CardTitle>
        <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-5 sm:pt-0 pb-3 sm:pb-4">
        {/* Valor más ajustado en tamaño */}
        <div className="text-lg sm:text-2xl font-bold text-foreground truncate">{value}</div>
        {description && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">{description}</p>}
        {trend && (
          <p className={`text-[10px] sm:text-xs mt-1 ${trend.isPositive ? "text-green-500" : "text-red-500"}`}>
            {trend.isPositive ? "+" : "-"}
            {Math.abs(trend.value)}% desde el mes pasado
          </p>
        )}
      </CardContent>
    </Card>
  )
}