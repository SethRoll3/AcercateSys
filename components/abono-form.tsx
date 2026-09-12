"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Plus, Search, Trash2, Receipt, Eye, X, Upload, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { gtDateInputValue, formatYMDGT } from "@/lib/utils"

interface ScheduleItem {
  id: string
  paymentNumber: number
  dueDate: string
  principal: number
  interest: number
  mora: number
  adminFees: number
  amount: number
  paidAmount: number
  status: string
}

interface AbonoFormProps {
  loanId: string
  schedule: ScheduleItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type AbonoType = "full" | "capital_only" | "no_mora" | "capital_interest_only" | "no_admin_fees"

interface DistributionPreview {
  scheduleId: string
  paymentNumber: number
  dueDate: string
  totalDue: number
  alreadyPaid: number
  appliedAmount: number
  newPaidAmount: number
  status: string
}

interface Boleta {
  id: string
  numeroBoleta: string
  formaPago: string
  fecha: string
  referencia: string
  banco: string
  monto: number
  observaciones: string
  imageUrl: string | null
}

interface NewBoletaForm {
  numeroBoleta: string
  formaPago: string
  fecha: string
  referencia: string
  banco: string
  monto: string
  observaciones: string
  imageFile: File | null
}

const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "deposito", label: "Depósito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "mixto", label: "Mixto" },
]

const ABONO_TYPES: { value: AbonoType; label: string; description: string }[] = [
  { value: "full", label: "Completo", description: "Capital + Interés + Mora + Admin" },
  { value: "capital_only", label: "Solo capital", description: "Solo capital (condona interés, mora y admin)" },
  { value: "no_mora", label: "Sin mora", description: "Capital + Interés + Admin (condona mora)" },
  { value: "capital_interest_only", label: "Sin mora ni admin", description: "Capital + Interés (condona mora y admin)" },
  { value: "no_admin_fees", label: "Sin admin", description: "Capital + Interés + Mora (condona admin)" },
]

const STEPS = ["Datos del Abono", "Boletas", "Revisión"]

export function AbonoForm({ loanId, schedule, open, onOpenChange, onSuccess }: AbonoFormProps) {
  const [step, setStep] = useState(0)
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("efectivo")
  const [paymentDate, setPaymentDate] = useState(gtDateInputValue())
  const [type, setType] = useState<AbonoType>("capital_only")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Boleta state
  const [boletas, setBoletas] = useState<Boleta[]>([])
  const [isBoletaDialogOpen, setIsBoletaDialogOpen] = useState(false)
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false)
  const [isCreatingBoleta, setIsCreatingBoleta] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Boleta[]>([])
  const [selectedBoletaIds, setSelectedBoletaIds] = useState<Set<string>>(new Set())
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [boletaForm, setBoletaForm] = useState<NewBoletaForm>({
    numeroBoleta: "",
    formaPago: "efectivo",
    fecha: gtDateInputValue(),
    referencia: "",
    banco: "",
    monto: "",
    observaciones: "",
    imageFile: null,
  })

  const pendingSchedules = useMemo(
    () => schedule.filter((s) => s.status !== "paid").sort((a, b) => a.paymentNumber - b.paymentNumber),
    [schedule]
  )

  const distribution = useMemo<DistributionPreview[]>(() => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) return []

    let remaining = numAmount
    const result: DistributionPreview[] = []

    for (const sched of pendingSchedules) {
      if (remaining <= 0) break

      const alreadyPaid = Number(sched.paidAmount) || 0
      const principal = Number(sched.principal) || 0
      const interest = Number(sched.interest) || 0
      const mora = Number(sched.mora) || 0
      const adminFees = Number(sched.adminFees) || 0

      let totalDue: number
      switch (type) {
        case "full":
          totalDue = principal + interest + mora + adminFees
          break
        case "capital_only":
          totalDue = principal
          break
        case "no_mora":
          totalDue = principal + interest + adminFees
          break
        case "capital_interest_only":
          totalDue = principal + interest
          break
        case "no_admin_fees":
          totalDue = principal + interest + mora
          break
      }

      const pending = Math.round((totalDue - alreadyPaid) * 100) / 100
      if (pending <= 0) continue

      const applied = Math.round(Math.min(remaining, pending) * 100) / 100
      const newPaidAmount = Math.round((alreadyPaid + applied) * 100) / 100

      let status: string
      switch (type) {
        case "full":
          status = newPaidAmount >= totalDue ? "paid" : "partially_paid"
          break
        case "capital_only":
          status = newPaidAmount >= principal ? "paid" : "partially_paid"
          break
        case "no_mora":
          status = newPaidAmount >= (principal + interest + adminFees) ? "paid" : "partially_paid"
          break
        case "capital_interest_only":
          status = newPaidAmount >= (principal + interest) ? "paid" : "partially_paid"
          break
        case "no_admin_fees":
          status = newPaidAmount >= (principal + interest + mora) ? "paid" : "partially_paid"
          break
      }

      result.push({
        scheduleId: sched.id,
        paymentNumber: sched.paymentNumber,
        dueDate: sched.dueDate,
        totalDue,
        alreadyPaid,
        appliedAmount: applied,
        newPaidAmount,
        status,
      })

      remaining = Math.round((remaining - applied) * 100) / 100
    }

    // Si sobra, indicar que se aplica como capital extra
    if (remaining > 0 && result.length > 0) {
      const lastPaymentNumber = result[result.length - 1].paymentNumber
      const nextSched = pendingSchedules.find(
        (s) => s.paymentNumber === lastPaymentNumber + 1
      )
      if (nextSched) {
        result.push({
          scheduleId: nextSched.id,
          paymentNumber: nextSched.paymentNumber,
          dueDate: nextSched.dueDate,
          totalDue: Number(nextSched.principal) || 0,
          alreadyPaid: Number(nextSched.paidAmount) || 0,
          appliedAmount: remaining,
          newPaidAmount: (Number(nextSched.paidAmount) || 0) + remaining,
          status: "extra_capital",
        })
        remaining = 0
      }
    }

    return result
  }, [amount, type, pendingSchedules])

  const totalApplied = useMemo(
    () => distribution.reduce((sum, d) => sum + d.appliedAmount, 0),
    [distribution]
  )

  const totalBoletasAmount = useMemo(
    () => Math.round(boletas.reduce((sum, b) => sum + b.monto, 0) * 100) / 100,
    [boletas]
  )

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(val)

  const canGoNext = () => {
    if (step === 0) {
      const num = parseFloat(amount)
      return num > 0 && distribution.length > 0
    }
    if (step === 1) {
      const numAmount = parseFloat(amount) || 0
      const diff = Math.abs(totalBoletasAmount - numAmount)
      return boletas.length > 0 && diff <= 1
    }
    return true
  }

  const handleNext = () => {
    if (step === 0) {
      const num = parseFloat(amount)
      if (!num || num <= 0) {
        toast.error("Ingresa un monto válido")
        return
      }
      if (distribution.length === 0) {
        toast.error("El monto no cubre ninguna cuota")
        return
      }
    }
    if (step === 1) {
      const numAmount = parseFloat(amount) || 0
      const diff = Math.abs(totalBoletasAmount - numAmount)
      if (boletas.length === 0) {
        toast.error("Debe agregar al menos una boleta")
        return
      }
      if (diff > 1) {
        toast.error(`El total de boletas (Q${totalBoletasAmount.toFixed(2)}) no coincide con el abono (Q${numAmount.toFixed(2)}). Diferencia: Q${diff.toFixed(2)}`)
        return
      }
    }
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  // Boleta handlers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Seleccione un archivo de imagen válido")
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("La imagen no puede ser mayor a 5MB")
        return
      }
      setBoletaForm({ ...boletaForm, imageFile: file })
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const uploadImageToSupabase = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append("file", file)
    const response = await fetch("/api/upload-image", { method: "POST", body: formData })
    if (!response.ok) throw new Error("Error al subir la imagen")
    const { imageUrl } = await response.json()
    return imageUrl
  }

  const handleCreateBoleta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!boletaForm.imageFile) {
      toast.error("Debe seleccionar una imagen de la boleta")
      return
    }
    setIsCreatingBoleta(true)
    try {
      const imageUrl = await uploadImageToSupabase(boletaForm.imageFile)
      const response = await fetch("/api/boletas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroBoleta: boletaForm.numeroBoleta,
          formaPago: boletaForm.formaPago,
          fecha: boletaForm.fecha,
          referencia: boletaForm.referencia || null,
          banco: boletaForm.banco || null,
          monto: parseFloat(boletaForm.monto),
          observaciones: boletaForm.observaciones || null,
          imageUrl,
        }),
      })
      if (response.ok) {
        const newBoleta = await response.json()
        setBoletas([...boletas, newBoleta])
        setBoletaForm({
          numeroBoleta: "", formaPago: "efectivo", fecha: gtDateInputValue(),
          referencia: "", banco: "", monto: "", observaciones: "", imageFile: null,
        })
        setImagePreview(null)
        setIsBoletaDialogOpen(false)
        toast.success("Boleta agregada exitosamente")
      } else {
        const err = await response.json()
        toast.error(`Error: ${err.error}`)
      }
    } catch {
      toast.error("Error de red al crear la boleta")
    } finally {
      setIsCreatingBoleta(false)
    }
  }

  const handleSearchBoletas = async () => {
    if (!searchQuery.trim()) {
      toast.error("Ingrese un número de boleta para buscar")
      return
    }
    setIsSearching(true)
    try {
      const response = await fetch(`/api/boletas/search?query=${encodeURIComponent(searchQuery.trim())}`)
      if (!response.ok) throw new Error("Error al buscar")
      const data = await response.json()
      setSearchResults(data || [])
      if ((data || []).length === 0) toast.info("No se encontraron boletas")
      else toast.success(`Se encontraron ${data.length} boleta(s)`)
    } catch {
      toast.error("Error al buscar boletas")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectSearchBoleta = (boletaId: string) => {
    const newSelected = new Set(selectedBoletaIds)
    if (newSelected.has(boletaId)) newSelected.delete(boletaId)
    else newSelected.add(boletaId)
    setSelectedBoletaIds(newSelected)
  }

  const handleAddSelectedBoletas = () => {
    const toAdd = searchResults.filter((b) => selectedBoletaIds.has(b.id))
    const existingIds = new Set(boletas.map((b) => b.id))
    const newBoletas = toAdd.filter((b) => !existingIds.has(b.id))
    if (newBoletas.length === 0) {
      toast.error("Las boletas seleccionadas ya están agregadas")
      return
    }
    setBoletas([...boletas, ...newBoletas])
    toast.success(`${newBoletas.length} boleta(s) agregada(s)`)
    setSelectedBoletaIds(new Set())
    setSearchResults([])
    setSearchQuery("")
    setIsSearchDialogOpen(false)
  }

  const handleRemoveBoleta = (id: string) => {
    setBoletas(boletas.filter((b) => b.id !== id))
  }

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/abono`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: numAmount,
          paymentMethod,
          paymentDate,
          type,
          notes: notes.trim() || undefined,
          boletaIds: boletas.map((b) => b.id),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Error al registrar abono")
        return
      }

      toast.success(
        `Abono registrado. ${data.paymentsCreated} cuota(s) afectadas. ` +
        `Monto aplicado: ${formatCurrency(data.totalApplied)}`
      )
      resetForm()
      onOpenChange(false)
      onSuccess()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setStep(0)
    setAmount("")
    setNotes("")
    setBoletas([])
    setPaymentMethod("efectivo")
    setPaymentDate(gtDateInputValue())
    setType("capital_only")
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) resetForm()
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Abono</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                      ? "bg-green-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${i === step ? "font-semibold" : "text-muted-foreground"}`}>
                  {s}
                </span>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Step 0: Datos del Abono */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="abono-amount">Monto del abono (Q)</Label>
              <Input
                id="abono-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de abono</Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as AbonoType)}
                className="flex flex-col gap-2"
              >
                {ABONO_TYPES.map((t) => (
                  <div key={t.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={t.value} id={`type-${t.value}`} />
                    <Label htmlFor={`type-${t.value}`} className="font-normal cursor-pointer">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground text-xs ml-1">— {t.description}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha de pago</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="abono-notes">Notas (opcional)</Label>
              <Input
                id="abono-notes"
                placeholder="Ej: Abono parcial sin intereses"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Preview de distribución */}
            {distribution.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <p className="text-sm font-semibold">Distribución del abono:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {distribution.map((d) => (
                    <div key={d.scheduleId} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Cuota #{d.paymentNumber} ({formatYMDGT(d.dueDate)})
                      </span>
                      <span className="font-medium">
                        {formatCurrency(d.appliedAmount)}
                        {d.status === "paid" && <span className="ml-1 text-green-600 text-xs">✓ Pagada</span>}
                        {d.status === "extra_capital" && <span className="ml-1 text-blue-600 text-xs">+ Capital extra</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span>Total aplicado:</span>
                  <span>{formatCurrency(totalApplied)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Boletas */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Monto del abono: <strong>{formatCurrency(parseFloat(amount) || 0)}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Boletas: <strong>{formatCurrency(totalBoletasAmount)}</strong>
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsBoletaDialogOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" /> Agregar Boleta
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsSearchDialogOpen(true)} className="gap-1">
                <Search className="h-4 w-4" /> Buscar Boleta
              </Button>
            </div>

            {Math.abs(totalBoletasAmount - (parseFloat(amount) || 0)) > 1 && boletas.length > 0 && (
              <Alert className="bg-orange-50 border-orange-200">
                <AlertDescription className="text-orange-800 text-sm">
                  El total de boletas (Q{totalBoletasAmount.toFixed(2)}) no coincide con el abono (Q{(parseFloat(amount) || 0).toFixed(2)}).
                  Diferencia: Q{Math.abs(totalBoletasAmount - (parseFloat(amount) || 0)).toFixed(2)}
                </AlertDescription>
              </Alert>
            )}

            {boletas.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Boleta</TableHead>
                      <TableHead>Forma Pago</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boletas.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            <Receipt className="h-3 w-3 text-muted-foreground" />
                            {b.numeroBoleta}
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{b.formaPago}</Badge></TableCell>
                        <TableCell className="text-sm">{formatYMDGT(b.fecha)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(b.monto)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveBoleta(b.id)} className="h-6 w-6 p-0 text-red-600">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay boletas agregadas</p>
                <p className="text-xs">Agregue o busque boletas para continuar</p>
              </div>
            )}

            {/* Dialog: Crear Boleta */}
            <Dialog open={isBoletaDialogOpen} onOpenChange={setIsBoletaDialogOpen}>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nueva Boleta</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateBoleta} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Número de Boleta *</Label>
                    <Input
                      value={boletaForm.numeroBoleta}
                      onChange={(e) => setBoletaForm({ ...boletaForm, numeroBoleta: e.target.value })}
                      placeholder="B-001"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Forma de Pago *</Label>
                      <Select value={boletaForm.formaPago} onValueChange={(v) => setBoletaForm({ ...boletaForm, formaPago: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="efectivo">Efectivo</SelectItem>
                          <SelectItem value="deposito">Depósito</SelectItem>
                          <SelectItem value="transferencia">Transferencia</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="tarjeta">Tarjeta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fecha *</Label>
                      <Input
                        type="date"
                        value={boletaForm.fecha}
                        onChange={(e) => setBoletaForm({ ...boletaForm, fecha: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Monto *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={boletaForm.monto}
                      onChange={(e) => setBoletaForm({ ...boletaForm, monto: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Referencia</Label>
                      <Input
                        value={boletaForm.referencia}
                        onChange={(e) => setBoletaForm({ ...boletaForm, referencia: e.target.value })}
                        placeholder="REF-123"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Banco</Label>
                      <Input
                        value={boletaForm.banco}
                        onChange={(e) => setBoletaForm({ ...boletaForm, banco: e.target.value })}
                        placeholder="Banco Industrial"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observaciones</Label>
                    <Textarea
                      value={boletaForm.observaciones}
                      onChange={(e) => setBoletaForm({ ...boletaForm, observaciones: e.target.value })}
                      placeholder="Notas adicionales..."
                      className="min-h-[50px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Imagen de la Boleta *</Label>
                    <div className="flex items-center gap-2">
                      <Input type="file" accept="image/*" onChange={handleImageChange} />
                      {imagePreview && (
                        <Button type="button" variant="outline" size="sm" onClick={() => { setImagePreview(null); setBoletaForm({ ...boletaForm, imageFile: null }) }}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {imagePreview && (
                      <img src={imagePreview} alt="Preview" className="w-full max-h-32 object-cover rounded border mt-1" />
                    )}
                    {!imagePreview && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Upload className="h-3 w-3" /> Seleccione una imagen (máx. 5MB)
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsBoletaDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={isCreatingBoleta}>
                      {isCreatingBoleta ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando...</> : "Crear Boleta"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {/* Dialog: Buscar Boleta */}
            <Dialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen}>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Buscar Boletas Existentes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Número de boleta (ej: B-001)"
                      onKeyDown={(e) => e.key === "Enter" && handleSearchBoletas()}
                    />
                    <Button onClick={handleSearchBoletas} disabled={isSearching}>
                      {isSearching ? "Buscando..." : "Buscar"}
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">{searchResults.length} resultado(s)</p>
                        <Button size="sm" onClick={handleAddSelectedBoletas} disabled={selectedBoletaIds.size === 0}>
                          Agregar ({selectedBoletaIds.size})
                        </Button>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead>Número</TableHead>
                              <TableHead>Fecha</TableHead>
                              <TableHead className="text-right">Monto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {searchResults.map((b) => (
                              <TableRow key={b.id}>
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={selectedBoletaIds.has(b.id)}
                                    onChange={(e) => handleSelectSearchBoleta(b.id)}
                                    className="rounded"
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{b.numeroBoleta}</TableCell>
                                <TableCell className="text-sm">{formatYMDGT(b.fecha)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(b.monto)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Step 2: Revisión */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold">Datos del Abono</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Monto:</span> <strong>{formatCurrency(parseFloat(amount) || 0)}</strong></div>
                <div><span className="text-muted-foreground">Tipo:</span> <strong>{ABONO_TYPES.find((t) => t.value === type)?.label}</strong></div>
                <div><span className="text-muted-foreground">Método:</span> <strong>{PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label}</strong></div>
                <div><span className="text-muted-foreground">Fecha:</span> <strong>{formatYMDGT(paymentDate)}</strong></div>
              </div>
              {notes && <p className="text-xs text-muted-foreground mt-1">Notas: {notes}</p>}
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold">Distribución en Cuotas ({distribution.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {distribution.map((d) => (
                  <div key={d.scheduleId} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {d.status === "extra_capital" ? `Cuota #${d.paymentNumber} (capital extra)` : `Cuota #${d.paymentNumber}`}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(d.appliedAmount)}
                      {d.status === "paid" && <span className="ml-1 text-green-600 text-xs">✓</span>}
                      {d.status === "extra_capital" && <span className="ml-1 text-blue-600 text-xs">+ Capital</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Total aplicado:</span>
                <span>{formatCurrency(totalApplied)}</span>
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold">Boletas ({boletas.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {boletas.map((b) => (
                  <div key={b.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{b.numeroBoleta}</span>
                    <span className="font-medium">{formatCurrency(b.monto)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Total boletas:</span>
                <span>{formatCurrency(totalBoletasAmount)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => step === 0 ? handleDialogClose(false) : handleBack()} disabled={isSubmitting}>
            {step === 0 ? "Cancelar" : "Atrás"}
          </Button>
          {step < 2 ? (
            <Button onClick={handleNext} disabled={!canGoNext()}>
              Siguiente
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registrando...</> : "Registrar Abono"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
