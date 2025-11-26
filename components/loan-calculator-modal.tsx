"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface LoanCalculatorModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function LoanCalculatorModal({ open, onOpenChange }: LoanCalculatorModalProps) {
  const [amount, setAmount] = useState<string>("")
  const [rate, setRate] = useState<string>("")
  const [months, setMonths] = useState<string>("")
  const [frequency, setFrequency] = useState<"mensual" | "quincenal">("mensual")

  const amountNum = useMemo(() => Math.max(0, parseFloat(amount) || 0), [amount])
  const rateNum = useMemo(() => Math.max(0, parseFloat(rate) || 0), [rate])
  const monthsNum = useMemo(() => Math.max(0, parseInt(months || "0", 10) || 0), [months])

  const aporte = 20
  const capital = useMemo(() => (monthsNum > 0 ? amountNum / monthsNum : 0), [amountNum, monthsNum])
  const interes = useMemo(() => (amountNum * (rateNum / 100)), [amountNum, rateNum])
  const totalCuota = useMemo(() => {
    const base = (amountNum > 0 && monthsNum > 0) ? aporte : 0
    if (frequency === "quincenal") return capital + (interes / 2) + base
    return capital + interes + base
  }, [capital, interes, amountNum, monthsNum, frequency])

  const formatQ = (n: number) => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n)

  const canCalculate = amountNum > 0 && rateNum >= 0 && monthsNum > 0

  const copyResults = async () => {
    const interesDisplay = frequency === 'quincenal' ? (interes / 2) : interes
    const text = `Monto: ${formatQ(amountNum)}\nTasa mensual: ${rateNum}%\nPlazo: ${monthsNum}\nFrecuencia: ${frequency}\n\nCapital mensual: ${formatQ(capital)}\nInterés ${frequency}: ${formatQ(interesDisplay)}\nAporte por cuota: ${formatQ(aporte)}\n\nTotal cuota ${frequency}: ${formatQ(totalCuota)}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-card border-border max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Calculadora de Préstamos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground" htmlFor="calc-amount">Monto</Label>
              <Input id="calc-amount" type="number" inputMode="decimal" placeholder="5000" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground" htmlFor="calc-rate">Tasa mensual (%)</Label>
              <Input id="calc-rate" type="number" inputMode="decimal" step="0.1" placeholder="3.5" value={rate} onChange={(e) => setRate(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground" htmlFor="calc-months">Plazo</Label>
              <Input id="calc-months" type="number" inputMode="numeric" placeholder="8" value={months} onChange={(e) => setMonths(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Frecuencia de pago</Label>
              <Tabs value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="mensual">Mensual</TabsTrigger>
                  <TabsTrigger value="quincenal">Quincenal</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            {!canCalculate ? (
              <div className="text-sm text-muted-foreground">Ingresa monto, tasa y plazo para calcular.</div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Capital</span><span className="font-medium text-foreground">{formatQ(capital)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Interés</span><span className="font-medium text-foreground">{formatQ(frequency === 'quincenal' ? (interes / 2) : interes)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Aporte</span><span className="font-medium text-foreground">{formatQ(aporte)}</span></div>
                <div className="pt-2 border-t border-border/50 flex justify-between text-base font-semibold text-primary"><span>Total cuota {frequency}</span><span>{formatQ(totalCuota)}</span></div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={copyResults} disabled={!canCalculate}>Copiar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
