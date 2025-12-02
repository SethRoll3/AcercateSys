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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        {trend && (
          <p className={`text-xs mt-1 ${trend.isPositive ? "text-green-500" : "text-red-500"}`}>
            {trend.isPositive ? "+" : "-"}
            {Math.abs(trend.value)}% desde el mes pasado
          </p>
        )}
      </CardContent>
    </Card>
  )
}
