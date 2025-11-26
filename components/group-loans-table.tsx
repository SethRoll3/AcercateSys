"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Eye } from "lucide-react"
import { useRouter } from "next/navigation"

interface GroupClientItem {
  name: string
  amount: number
  progressPaid?: number
  progressTotal?: number
  hasOverdue?: boolean
}

interface GroupLoanItem {
  groupName: string
  totalAmount: number
  clients: GroupClientItem[]
  groupId: string
  totalMembers?: number
}

interface GroupLoansTableProps {
  items: GroupLoanItem[]
}

export function GroupLoansTable({ items }: GroupLoansTableProps) {
  const router = useRouter()
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount)
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-muted-foreground">Grupo</TableHead>
            <TableHead className="text-muted-foreground">Total</TableHead>
            <TableHead className="text-muted-foreground">Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((g, idx) => (
            <TableRow key={idx} className="border-border/50">
              <TableCell className="text-foreground">
                <div className="flex items-center gap-2">
                  <span>{g.groupName}</span>
                  <Badge variant="secondary">{(g.totalMembers ?? g.clients.length)} integrantes</Badge>
                </div>
              </TableCell>
              <TableCell className="text-foreground">{formatCurrency(g.totalAmount)}</TableCell>
              <TableCell>
                <Collapsible>
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">Ver desglose</Button>
                    </CollapsibleTrigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/dashboard/loans/groups/${g.groupId}`)}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {g.clients.map((c, i) => (
                        <div key={i} className="rounded-md border bg-muted/30 p-2 text-sm flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-foreground truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground">{(c.progressPaid ?? 0)}/{(c.progressTotal ?? 0)} cuotas</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c.hasOverdue ? (
                              <Badge variant="destructive">Retraso</Badge>
                            ) : (
                              <Badge variant="secondary">Al día</Badge>
                            )}
                            <span className="text-foreground font-medium">{formatCurrency(c.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
