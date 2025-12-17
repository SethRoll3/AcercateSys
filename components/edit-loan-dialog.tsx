"use client"

import type React from "react"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Edit } from "lucide-react"
import type { Loan } from "@/lib/types"
import { toast } from "sonner"

interface EditLoanDialogProps {
  loan: Loan
  onLoanUpdated: () => void
}

export function EditLoanDialog({ loan, onLoanUpdated }: EditLoanDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    interestRate: loan.interestRate.toString(),
    amount: loan.amount.toString(),
    term_months: loan.termMonths.toString(),
    frequency: (loan.paymentFrequency || 'mensual') as 'mensual' | 'quincenal',
    startDate: loan.startDate ? new Date(loan.startDate).toISOString().split('T')[0] : '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const submissionData = {
      interestRate: parseFloat(formData.interestRate),
      amount: parseFloat(formData.amount),
      term_months: parseInt(formData.term_months, 10),
      frequency: formData.frequency,
      startDate: formData.startDate,
    }

    try {
      const response = await fetch(`/api/loans?id=${loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      })

      if (response.ok) {
        setOpen(false)
        onLoanUpdated()
        toast.success("Préstamo actualizado con éxito")
      } else {
        const errorData = await response.json()
        console.error("[v0] Error updating loan:", errorData)
        toast.error(`Error al actualizar el préstamo: ${errorData.message || "Error desconocido"}`)
      }
    } catch (error) {
      console.error("[v0] Error updating loan:", error)
      toast.error("Error de red al actualizar el préstamo")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Edit className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Préstamo</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Actualizar información del préstamo {loan.loanNumber}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-foreground">Monto</Label>
              <Input id="amount" type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term_months" className="text-foreground">Plazo</Label>
              <Input id="term_months" type="number" step="1" value={formData.term_months} onChange={(e) => setFormData({ ...formData, term_months: e.target.value })} required className="bg-background/50" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interestRate" className="text-foreground">Tasa de Interés (%)</Label>
            <Input id="interestRate" type="number" step="0.1" value={formData.interestRate} onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })} required className="bg-background/50" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate" className="text-foreground">Fecha de Inicio</Label>
            <Input id="startDate" type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required className="bg-background/50" />
            <div className="text-xs text-muted-foreground">
              La primera cuota será {formData.frequency === 'quincenal' ? 'una quincena' : 'un mes'} después de la fecha de inicio.
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Frecuencia de pago</Label>
            <Tabs value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v as 'mensual' | 'quincenal' })}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="mensual">Mensual</TabsTrigger>
                <TabsTrigger value="quincenal">Quincenal</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-500 border border-yellow-500/20">
            Nota: Si edita algún campo tendrá que ir a regenerar el plan de pagos manualmente desde el detalle del préstamo.
          </div>

          <div className="flex justify-end gap-2 pt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
              {isLoading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
