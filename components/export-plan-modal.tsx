"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

interface ExportPlanModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  loanId?: string
  groupId?: string
  groupClients?: { id: string; name: string; loanId: string }[]
}

export function ExportPlanModal({ open, onOpenChange, loanId, groupId, groupClients = [] }: ExportPlanModalProps) {
  const [format, setFormat] = useState<"excel"|"pdf">("excel")
  const [scope, setScope] = useState<"individual"|"group_all"|"group_client">("individual")
  const [selectedClientLoanId, setSelectedClientLoanId] = useState<string>(groupClients[0]?.loanId || "")
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    try {
      setIsExporting(true)
      let url = ""
      if (scope === "individual" && loanId) {
        url = `/api/reports/schedule/${format}/${loanId}`
      } else if (scope === "group_client" && selectedClientLoanId) {
        url = `/api/reports/schedule/${format}/${selectedClientLoanId}`
      } else if (scope === "group_all" && groupId) {
        url = `/api/reports/schedule/group/${format}/${groupId}`
      } else {
        toast.error("Selecciona alcance válido")
        return
      }

      const resp = await fetch(url)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast.error(err?.error || "No se pudo generar el archivo")
        setIsExporting(false)
        return
      }
      const blob = await resp.blob()
      const a = document.createElement("a")
      const href = URL.createObjectURL(blob)
      a.href = href
      const ts = new Date().toISOString().slice(0,10)
      a.download = format === "excel" ? `Plan_${ts}.xlsx` : `Plan_${ts}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
      onOpenChange(false)
      toast.success("Archivo generado correctamente")
    } catch (e: any) {
      toast.error(e?.message || "Error inesperado")
    } finally {
      setIsExporting(false)
    }
  }

  const isGroup = Boolean(groupId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar Plan de Pagos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Formato</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isGroup ? (
            <div className="space-y-2">
              <Label>Alcance</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group_all">Todo el Grupo</SelectItem>
                  <SelectItem value="group_client">Por Cliente</SelectItem>
                </SelectContent>
              </Select>
              {scope === "group_client" && (
                <div className="space-y-2 mt-2">
                  <Label>Cliente</Label>
                  <Select value={selectedClientLoanId} onValueChange={setSelectedClientLoanId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groupClients.map((c) => (
                        <SelectItem key={c.loanId} value={c.loanId}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleExport} disabled={isExporting}>{isExporting ? 'Guardando...' : 'Exportar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}