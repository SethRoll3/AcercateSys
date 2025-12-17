"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { BoletasManager } from "./boletas-manager"
import type { Boleta, PaymentSchedule, Payment } from "@/lib/types"
import { gtDateInputValue } from "@/lib/utils"

interface PaymentFormProps {
  loanId: string
  scheduleItem: PaymentSchedule
  onPaymentSuccess: () => void
  onCancel: () => void
  initialPayment?: Payment
  initialBoletas?: Boleta[]
  fullMode?: boolean
  fullAmount?: number
  fullScheduleIds?: string[]
}

export function PaymentForm({ loanId, scheduleItem, onPaymentSuccess, onCancel, initialPayment, initialBoletas = [], fullMode = false, fullAmount, fullScheduleIds = [] }: PaymentFormProps) {
  // Calcular el monto total de la cuota
  const totalAmount = Number(scheduleItem.amount) + (scheduleItem.mora || 0)
  // Calcular el monto ya pagado
  const paidAmount = scheduleItem.paid_amount || scheduleItem.paidAmount || 0
  // Calcular el monto restante por pagar
  const amount = totalAmount - paidAmount
  const editingMode = Boolean(initialPayment)
  const paymentScheduleId = scheduleItem.id
  const [isLoading, setIsLoading] = useState(false)
  const [boletas, setBoletas] = useState<Boleta[]>([])
  const [totalBoletasAmount, setTotalBoletasAmount] = useState(0)
  const [existingBoletas, setExistingBoletas] = useState<Boleta[]>([])
  const [isLoadingBoletas, setIsLoadingBoletas] = useState(false)
  const [formData, setFormData] = useState({
    paymentDate: gtDateInputValue(),
    paymentMethod: "efectivo",
    notes: "",
  })

  // Guardar IDs originales de boletas si estamos en modo edición
  const originalBoletaIds = new Set((initialBoletas || []).map(b => b.id))

  // Pre-cargar datos del pago y boletas al entrar en edición
  useEffect(() => {
    if (initialPayment) {
      setFormData({
        paymentDate: initialPayment.paymentDate,
        paymentMethod: initialPayment.paymentMethod || "efectivo",
        notes: initialPayment.notes || "",
      })
    }
    if (initialBoletas && initialBoletas.length > 0) {
      setBoletas(initialBoletas)
    }
  }, [initialPayment, initialBoletas])

  console.log(totalBoletasAmount)

  // Cargar boletas existentes si el pago ya está pagado o parcialmente pagado
  useEffect(() => {
    const loadExistingBoletas = async () => {
      if (scheduleItem.status === 'paid' || scheduleItem.status === 'partially_paid') {
        setIsLoadingBoletas(true)
        try {
          const response = await fetch(`/api/payment-schedule/${paymentScheduleId}/boletas`)
          if (response.ok) {
            const data = await response.json()
            console.log(data)
            setExistingBoletas(data.boletas || [])
            // Para pagos parciales, no inicializar con boletas existentes
            // Las boletas existentes ya están pagadas, solo validamos las nuevas
            setBoletas([])
            setTotalBoletasAmount(0)
          }
        } catch (error) {
          console.error('Error loading existing boletas:', error)
        } finally {
          setIsLoadingBoletas(false)
        }
      }
    }

    loadExistingBoletas()
  }, [paymentScheduleId, scheduleItem.status])

  // Calcular el monto total de todas las boletas (existentes + nuevas)
  // Aplicar redondeo para evitar problemas de precisión de punto flotante
  const totalAllBoletasAmount = Math.round(totalBoletasAmount * 100) / 100
  
  // Para la validación:
  // - En edición (pending_confirmation/rechazado), validar contra el monto total de la cuota
  // - Si hay boletas existentes de cuotas ya pagadas/parcialmente pagadas, validar contra total
  // - Caso normal: validar contra el monto restante
  const validationAmount = fullMode
    ? Math.round(Number(fullAmount || 0) * 100) / 100
    : Math.round((editingMode ? totalAmount : (existingBoletas.length > 0 ? totalAmount : amount)) * 100) / 100
  
  const isAmountMatch = Math.abs(totalAllBoletasAmount - validationAmount) < 0.01
  const isPartialPayment = totalAllBoletasAmount > 0 && totalAllBoletasAmount < validationAmount
  const isOverpayment = totalAllBoletasAmount > validationAmount
  console.log("totalAllBoletasAmount:", totalAllBoletasAmount)
  console.log("validationAmount:", validationAmount)
  const canSubmit = boletas.length > 0 && !isOverpayment && (!fullMode || isAmountMatch)

  const handleBoletasChange = (newBoletas: Boleta[], newTotalAmount: number) => {
    setBoletas(newBoletas)
    setTotalBoletasAmount(newTotalAmount)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!canSubmit) {
      toast.error("Debe agregar al menos una boleta y el monto no puede exceder la cuota")
      return
    }

    setIsLoading(true)

    try {
      // Primero registrar el pago
      // Enviar has_been_edited solo si se trata de una edición (pending_confirmation o rechazado)
      const isEditing = scheduleItem.status === 'pending_confirmation' || scheduleItem.status === 'rejected'
      const paymentPayload: any = {
        paymentScheduleId,
        amount: totalAllBoletasAmount,
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        notes: fullMode
          ? `[FULL_PAYMENT] ${JSON.stringify({ scheduleIds: fullScheduleIds, total: validationAmount })}${formData.notes ? ' ' + formData.notes : ''}`
          : (formData.notes || null),
      }
      if (isEditing) {
        paymentPayload.has_been_edited = true
      }
      if (fullMode) {
        paymentPayload.isFull = true
        paymentPayload.fullScheduleIds = fullScheduleIds
      }

      const endpoint = editingMode ? `/api/payments/${initialPayment!.id}` : "/api/payments"
      const method = editingMode ? "PATCH" : "POST"
      const payload = editingMode ? {
        amount: paymentPayload.amount,
        paymentDate: paymentPayload.paymentDate,
        paymentMethod: paymentPayload.paymentMethod,
        notes: paymentPayload.notes,
        has_been_edited: true,
      } : paymentPayload

      const paymentResponse = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json()
        throw new Error(`Error al registrar pago: ${errorData.error}`)
      }

      //const payment = await paymentResponse.json()

      // En modo edición: desasignar boletas removidas y asignar nuevas
      if (editingMode) {
        const removedBoletaIds = Array.from(originalBoletaIds).filter(
          (id) => !boletas.some((b) => b.id === id)
        )
        if (removedBoletaIds.length > 0) {
          const unassignResponse = await fetch("/api/boletas/unassign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentScheduleId,
              boletaIds: removedBoletaIds,
            }),
          })

          if (!unassignResponse.ok) {
            const errorData = await unassignResponse.json()
            console.error("Error unassigning boletas:", errorData)
            toast.error("Cambios guardados pero hubo error al desasignar boletas")
          }
        }
      }

      // Asignar solo boletas nuevas (evitar re-asignar las ya existentes)
      const newBoletas = boletas.filter(b => !originalBoletaIds.has(b.id))
      if (newBoletas.length > 0) {
        const assignResponse = await fetch("/api/boletas/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentScheduleId,
            boletaIds: newBoletas.map(b => b.id),
          }),
        })

        if (!assignResponse.ok) {
          const errorData = await assignResponse.json()
          console.error("Error assigning boletas:", errorData)
          // No lanzamos error aquí porque el pago ya se registró
          toast.error("Cambios guardados pero hubo error al asignar las boletas")
        }
      }

      const statusMessage = isEditing
        ? "Cambios de pago guardados exitosamente"
        : (isAmountMatch 
            ? "Pago completo registrado exitosamente" 
            : "Pago parcial registrado exitosamente")
      
      toast.success(statusMessage)
      onPaymentSuccess()
    } catch (error) {
      console.error("Error registering payment:", error)
      toast.error(error instanceof Error ? error.message : "Error de red al registrar el pago")
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  return (
    <div className="space-y-6">
          {/* Información de la cuota */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center justify-between">
            {isLoadingBoletas ? "Cargando boletas existentes..." : 
             initialPayment ? "Editar Pago" : (fullMode ? "Registrar Pago Completo" : (paidAmount > 0 ? "Completar Pago Parcial" : "Registrar Pago"))}
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className="text-lg font-semibold">
                {formatCurrency(fullMode ? validationAmount : amount)}
                  </Badge>
                  {paidAmount > 0 && (
                    <div className="text-sm text-muted-foreground">
                      Pagado: {formatCurrency(paidAmount)} / Total: {formatCurrency(totalAmount)}
                    </div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentDate">Fecha de Pago</Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    value={formData.paymentDate}
                    onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                    className="bg-background/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Método de Pago Principal</Label>
                  <Select
                    value={formData.paymentMethod}
                    onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                  >
                    <SelectTrigger className="bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="deposito">Depósito</SelectItem>
                      <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta de Crédito/Débito</SelectItem>
                      <SelectItem value="mixto">Mixto (Múltiples formas)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label htmlFor="notes">Notas (Opcional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Agregar notas sobre el pago..."
                  className="bg-background/50"
                />
              </div>
            </CardContent>
          </Card>

      {/* Gestor de boletas */}
      <BoletasManager 
        cuotaAmount={validationAmount}
        onBoletasChange={handleBoletasChange}
        initialBoletas={initialPayment ? initialBoletas : existingBoletas}
        existingBoletas={existingBoletas}
      />

      {/* Resumen y acciones */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="pt-6">
          {/* Estado del pago */}
          {boletas.length > 0 && (
            <div className="mb-4">
              {isAmountMatch && (
                <Alert className="bg-green-50 border-green-200 mb-4">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <strong>{fullMode ? "Pago de préstamo completo" : "Pago Completo"}:</strong> El monto total de las boletas coincide exactamente con {fullMode ? "el total del préstamo pendiente" : "la cuota"}.
                  </AlertDescription>
                </Alert>
              )}

              {isPartialPayment && (
                <Alert className="bg-orange-50 border-orange-200 mb-4">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800">
                    <strong>Pago Parcial:</strong> La cuota quedará marcada como Pagado Parcialmente. 
                    Faltante: Q {(validationAmount - totalAllBoletasAmount).toFixed(2)}
                  </AlertDescription>
                </Alert>
              )}

              {isOverpayment && (
                <Alert className="bg-red-50 border-red-200 mb-4">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>Monto Excedido:</strong> El total de boletas excede {fullMode ? "el monto total pendiente" : "el monto de la cuota"}. 
                    Exceso: Q {(totalAllBoletasAmount - validationAmount).toFixed(2)}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="bg-transparent">
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isLoading || !canSubmit}
              className={isPartialPayment ? "bg-orange-600 hover:bg-orange-700" : ""}
            >
              {isLoading ? (initialPayment ? "Guardando..." : "Registrando...") : 
               initialPayment ? "Guardar Cambios" : (
                 isAmountMatch ? (fullMode ? "Registrar Pago Completo" : "Registrar Pago Completo") :
                 isPartialPayment ? "Registrar Pago Parcial" :
                 "Registrar Pago"
               )}
            </Button>
          </div>

          {!canSubmit && boletas.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Debe agregar al menos una boleta para continuar
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
