'use client'

import type React from 'react'
import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { calculateMonthlyPayment, calculateEndDate, gtDateInputValue } from '@/lib/utils'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffect } from 'react'

interface Client {
  id: string
  fullName: string
}

interface CreateLoanDialogProps {
  clients: Client[]
  onLoanCreated: () => void
}

export function CreateLoanDialog({
  clients,
  onLoanCreated,
}: CreateLoanDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [activeTab, setActiveTab] = useState<'client' | 'group'>('client')
  const router = useRouter()
  const [formData, setFormData] = useState({
    clientId: '',
    amount: '',
    interestRate: '',
    termMonths: '',
    startDate: gtDateInputValue(),
    status: 'pending',
    frequency: 'mensual' as 'mensual' | 'quincenal',
  })

  const [groups, setGroups] = useState<any[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [assignments, setAssignments] = useState<Record<string, {
    amount: string
    interestRate: string
    termMonths: string
    startDate: string
    frequency?: 'mensual' | 'quincenal'
    monthlyPayment: number
    endDate: string
  }>>({})

  const monthlyPayment = useMemo(() => {
    const amount = parseFloat(formData.amount)
    const rateMonthly = parseFloat(formData.interestRate) || 0
    const termMonths = parseInt(formData.termMonths, 10)
    if (amount > 0 && termMonths > 0) {
      const capitalMes = amount / termMonths
      const interesMes = amount * (rateMonthly / 100)
      const aporte = 20
      return formData.frequency === 'quincenal'
        ? capitalMes + (interesMes / 2) + aporte
        : capitalMes + interesMes + aporte
    }
    return 0
  }, [formData.amount, formData.interestRate, formData.termMonths, formData.frequency])

  const endDate = useMemo(() => {
    const startDate = formData.startDate
    const termMonths = parseInt(formData.termMonths, 10)
    if (startDate && termMonths > 0) {
      return calculateEndDate(startDate, termMonths)
    }
    return ''
  }, [formData.startDate, formData.termMonths])

  const isStep1Valid = useMemo(() => {
    return (
      formData.clientId &&
      formData.amount &&
      formData.termMonths &&
      formData.startDate && formData.frequency
    )
  }, [
    formData.clientId,
    formData.amount,
    formData.termMonths,
    formData.startDate,
    formData.frequency,
  ])

  const selectedGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedGroupId)
  }, [groups, selectedGroupId])

  const groupTotal = useMemo(() => {
    return Object.values(assignments).reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
  }, [assignments])

  useEffect(() => {
    if (open && activeTab === 'group') {
      ;(async () => {
        try {
          const res = await fetch('/api/grupos')
          if (res.ok) {
            const data = await res.json()
            setGroups(Array.isArray(data) ? data : [])
          }
        } catch {}
      })()
    }
  }, [open, activeTab])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const submissionData = {
      ...formData,
      monthlyPayment: monthlyPayment.toFixed(2),
      endDate,
    }
    console.log('submissionData', submissionData)

    try {
      const response = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      })

      if (response.ok) {
        setOpen(false)
        setStep(1)
        setFormData({
          clientId: '',
          amount: '',
          interestRate: '',
          termMonths: '',
          startDate: gtDateInputValue(),
          status: 'pending',
          frequency: 'mensual',
        })
        onLoanCreated()
        toast.success('Préstamo creado con éxito')
      } else {
        // Handle errors from the server
        const errorData = await response.json()
        console.error('Error creating loan:', errorData.message)
        toast.error(`Error al crear el préstamo: ${errorData.message}`)
      }
    } catch (error) {
      console.error('Error creating loan:', error)
      toast.error('Error de red al crear el préstamo')
    } finally {
      setIsLoading(false)
    }
  }

  const assignClientLoan = (clientId: string, values: { amount: string; interestRate: string; termMonths: string; startDate: string; frequency?: 'mensual' | 'quincenal' }) => {
    const amountNum = parseFloat(values.amount)
    const rateNum = parseFloat(values.interestRate) || 0
    const termNum = parseInt(values.termMonths, 10)
    const capitalMes = amountNum / termNum
    const interesMes = amountNum * (rateNum / 100)
    const aporte = 20
    const mp = amountNum > 0 && termNum > 0
      ? ((values.frequency === 'quincenal')
          ? (capitalMes + (interesMes/2) + aporte)
          : (capitalMes + interesMes + aporte))
      : 0
    const ed = values.startDate && termNum > 0 ? calculateEndDate(values.startDate, termNum) : ''
    setAssignments((prev) => ({
      ...prev,
      [clientId]: {
        amount: values.amount,
        interestRate: values.interestRate,
        termMonths: values.termMonths,
        startDate: values.startDate,
        frequency: values.frequency || 'mensual',
        monthlyPayment: mp,
        endDate: ed,
      },
    }))
    toast.success('Asignación guardada')
  }

  const createGroupLoans = async () => {
    if (!selectedGroup || !selectedGroup.clients || selectedGroup.clients.length === 0) return
    const allAssigned = selectedGroup.clients.every((c: any) => assignments[c.id])
    if (!allAssigned) {
      toast.error('Todos los integrantes deben tener asignación')
      return
    }
    setIsLoading(true)
    try {
      const created: { client_id: string; loan_id: string }[] = []
      for (const c of selectedGroup.clients) {
        const a = assignments[c.id]
        const payload = {
          clientId: c.id,
          amount: a.amount,
          interestRate: a.interestRate,
          termMonths: a.termMonths,
          startDate: a.startDate,
          frequency: (a as any).frequency || 'mensual',
          status: 'pending',
          monthlyPayment: a.monthlyPayment.toFixed(2),
          endDate: a.endDate,
        }
        const res = await fetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json()
          toast.error(err.message || 'Error al crear préstamo')
          return
        }
        const data = await res.json()
        created.push({ client_id: c.id, loan_id: data.data?.id || data.id })
      }
      const lgRes = await fetch('/api/loans-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: selectedGroup.id, loans: created, total_amount: groupTotal }),
      })
      if (!lgRes.ok) {
        const err = await lgRes.json()
        toast.error(err.error || 'Error registrando préstamo de grupo')
        return
      }
      setOpen(false)
      setStep(1)
      setActiveTab('client')
      setSelectedGroupId('')
      setAssignments({})
      onLoanCreated()
      toast.success('Préstamos de grupo creados')
    } catch {
      toast.error('Error de red creando préstamos')
    } finally {
      setIsLoading(false)
    }
  }

  const nextStep = () => setStep((prev) => prev + 1)
  const prevStep = () => setStep((prev) => prev - 1)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nuevo Préstamo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Crear Nuevo Préstamo
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Ingrese los detalles del préstamo
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'client' | 'group')} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="client">Cliente</TabsTrigger>
            <TabsTrigger value="group">Grupo</TabsTrigger>
          </TabsList>
          <TabsContent value="client">
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="clientId" className="text-foreground">
                      Cliente
                    </Label>
                    <Select
                      value={formData.clientId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, clientId: value })
                      }
                    >
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Seleccione un cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount" className="text-foreground">
                        Monto del Préstamo
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="50000"
                        value={formData.amount}
                        onChange={(e) =>
                          setFormData({ ...formData, amount: e.target.value })
                        }
                        required
                        className="bg-background/50"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="interestRate" className="text-foreground">
                        Tasa de Interés (%)
                      </Label>
                      <Input
                        id="interestRate"
                        type="number"
                        step="0.1"
                        placeholder="12.5"
                        value={formData.interestRate}
                        onChange={(e) =>
                          setFormData({ ...formData, interestRate: e.target.value })
                        }
                        className="bg-background/50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="termMonths" className="text-foreground">
                        Plazo
                      </Label>
                      <Input
                        id="termMonths"
                        type="number"
                        placeholder="24"
                        value={formData.termMonths}
                        onChange={(e) =>
                          setFormData({ ...formData, termMonths: e.target.value })
                        }
                        required
                        className="bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-foreground">Frecuencia de pago</Label>
                      <Tabs value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v as 'mensual' | 'quincenal' })} className="w-full">
                        <TabsList className="grid grid-cols-2 w-full">
                          <TabsTrigger value="mensual" className="text-sm">Mensual</TabsTrigger>
                          <TabsTrigger value="quincenal" className="text-sm">Quincenal</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate" className="text-foreground">
                        Fecha de Inicio
                      </Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={formData.startDate}
                        onChange={(e) =>
                          setFormData({ ...formData, startDate: e.target.value })
                        }
                        required
                        className="bg-background/50"
                      />
                      <div className="text-xs text-muted-foreground">
                        La primera cuota será {formData.frequency === 'quincenal' ? 'una quincena' : 'un mes'} después de la fecha de inicio.
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="button" onClick={nextStep} disabled={!isStep1Valid}>
                      Siguiente
                    </Button>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-card p-4 shadow-sm">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Monto</span>
                          <span className="font-medium text-foreground">
                            {new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(parseFloat(formData.amount) || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tasa</span>
                          <span className="font-medium text-foreground">{formData.interestRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Plazo</span>
                          <span className="font-medium text-foreground">{formData.termMonths}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Inicio</span>
                          <span className="font-medium text-foreground">{formData.startDate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Fin</span>
                          <span className="font-medium text-foreground">{endDate}</span>
                        </div>
                        <div className="flex justify-between text-base font-semibold text-primary">
                          <span>Cuota {formData.frequency === 'quincenal' ? 'Quincenal' : 'Mensual'}</span>
                          <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(monthlyPayment)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between pt-4">
                    <Button type="button" variant="outline" onClick={prevStep}>Anterior</Button>
                    <Button type="submit" disabled={isLoading}>{isLoading ? 'Creando Préstamo...' : 'Confirmar y Crear'}</Button>
                  </div>
                </>
              )}
            </form>
          </TabsContent>
          <TabsContent value="group">
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-foreground">Grupo</Label>
                <Select value={selectedGroupId} onValueChange={(v) => setSelectedGroupId(v)}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Seleccione un grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g: any) => (
                      <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedGroup && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">Asignados {selectedGroup.clients.filter((c: any) => assignments[c.id]).length} de {selectedGroup.clients.length}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedGroup.clients.map((c: any) => {
                      const a = assignments[c.id] || { amount: '', interestRate: '', termMonths: '', startDate: '', frequency: 'mensual', monthlyPayment: 0, endDate: '' }
                      return (
                        <div key={c.id} className="rounded-lg border bg-card p-4">
                          <div className="font-semibold text-foreground mb-2">{c.first_name} {c.last_name}</div>
                          <div className="space-y-2">
                            <Input type="number" placeholder="Monto" value={a.amount} onChange={(e) => setAssignments((prev) => ({ ...prev, [c.id]: { ...a, amount: e.target.value } }))} className="bg-background/50" />
                            <Input type="number" step="0.1" placeholder="Tasa (%)" value={a.interestRate} onChange={(e) => setAssignments((prev) => ({ ...prev, [c.id]: { ...a, interestRate: e.target.value } }))} className="bg-background/50" />
                            <Input type="number" placeholder="Plazo" value={a.termMonths} onChange={(e) => setAssignments((prev) => ({ ...prev, [c.id]: { ...a, termMonths: e.target.value } }))} className="bg-background/50" />
                            <div className="grid grid-cols-1 gap-2">
                              <Input type="date" value={a.startDate} onChange={(e) => setAssignments((prev) => ({ ...prev, [c.id]: { ...a, startDate: e.target.value } }))} className="bg-background/50" />
                              <Tabs value={(a as any).frequency || 'mensual'} onValueChange={(v) => setAssignments((prev) => ({ ...prev, [c.id]: { ...a, frequency: v as 'mensual' | 'quincenal' } }))} className="w-full">
                                <TabsList className="grid grid-cols-2 w-full">
                                  <TabsTrigger value="mensual" className="text-sm">Mensual</TabsTrigger>
                                  <TabsTrigger value="quincenal" className="text-sm">Quincenal</TabsTrigger>
                                </TabsList>
                              </Tabs>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Cuota</span>
                              <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(a.monthlyPayment || 0)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Fin</span>
                              <span>{a.endDate || ''}</span>
                            </div>
                          </div>
                          <div className="flex justify-end pt-2">
                            <Button type="button" size="sm" onClick={() => assignClientLoan(c.id, { amount: a.amount, interestRate: a.interestRate, termMonths: a.termMonths, startDate: a.startDate, frequency: (a as any).frequency || 'mensual' })}>Asignar</Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total del Grupo</span>
                      <span className="font-semibold text-foreground">{new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(groupTotal)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={createGroupLoans} disabled={isLoading || !selectedGroup.clients.every((c: any) => assignments[c.id])}>{isLoading ? 'Creando...' : 'Guardar Grupo'}</Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
