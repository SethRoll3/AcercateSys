'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { GitMerge, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ClientOption = { id: string; fullName: string }
type Candidate = { id: string; loanNumber: string; status: string; balance: number; excludedMora: number }
type Quote = { amount: number; excludedMora: number; sources: Candidate[] }
const money = (n: number) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n)
const todayGT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function UnifyLoansDialog({ clients, onUnified }: { clients: ClientOption[]; onUnified: () => void }) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [loans, setLoans] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [term, setTerm] = useState('')
  const [rate, setRate] = useState('')
  const [frequency, setFrequency] = useState<'mensual' | 'quincenal'>('mensual')
  const [startDate, setStartDate] = useState(todayGT())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !clientId) { setLoans([]); setSelected([]); setQuote(null); return }
    let alive = true
    setLoading(true)
    fetch(`/api/loans/unify?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data })
      .then((data) => { if (alive) { setLoans(data.loans || []); setSelected([]); setQuote(null) } })
      .catch((e) => { if (alive) toast.error(e.message || 'Error al consultar préstamos') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [clientId, open])

  const toggle = (id: string) => {
    setQuote(null)
    setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }

  const requestQuote = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/loans/unify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: selected, preview: true }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setQuote(data)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo calcular el saldo') }
    finally { setLoading(false) }
  }

  const confirm = async () => {
    if (!quote || !term || !rate || !startDate) return
    setLoading(true)
    try {
      const res = await fetch('/api/loans/unify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: selected, term: Number(term), interestRate: Number(rate), frequency, startDate,
          expectedAmount: quote.amount, expectedExcludedMora: quote.excludedMora }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Préstamo ${data.loanNumber} creado por ${money(data.amount)}`)
      setOpen(false)
      setClientId('')
      setClientSearch('')
      setSelected([])
      setQuote(null)
      onUnified()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudieron unificar los préstamos') }
    finally { setLoading(false) }
  }

  const installment = quote && Number(term) > 0
    ? quote.amount / Number(term) + quote.amount * (Number(rate || 0) / 100) / (frequency === 'quincenal' ? 2 : 1) + 20 : 0
  const matchingClients = clients.filter((client) => client.fullName.toLowerCase().includes(clientSearch.trim().toLowerCase())).slice(0, 8)
  const selectedClient = clients.find((client) => client.id === clientId)

  return <>
    <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}><GitMerge className="h-4 w-4" />Unificar préstamos</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!loading) setOpen(value) }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Unificar préstamos</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Seleccione dos o más préstamos del mismo cliente. El nuevo monto suma solo el saldo pendiente de las cuotas, sin mora. Los préstamos originales quedarán como unificados y conservarán su historial.</p>
        {!clientId ? <div className="space-y-2">
          <Label htmlFor="unify-client-search">Buscar cliente por nombre</Label>
          <Input id="unify-client-search" placeholder="Escriba el nombre del cliente" value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)} disabled={loading} autoComplete="off" />
          {clientSearch.trim() && <div className="max-h-48 overflow-y-auto rounded-md border">
            {matchingClients.length ? matchingClients.map((client) => <button key={client.id} type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" disabled={loading}
              onClick={() => setClientId(client.id)}>{client.fullName}</button>)
              : <p className="p-3 text-sm text-muted-foreground">No se encontraron clientes.</p>}
          </div>}
        </div> : <div className="flex items-center justify-between rounded-md border p-3">
          <div><div className="text-xs text-muted-foreground">Cliente seleccionado</div><div className="font-medium">{selectedClient?.fullName}</div></div>
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => {
            setClientId(''); setClientSearch(''); setSelected([]); setQuote(null); setTerm(''); setRate('')
          }}>Cambiar cliente</Button>
        </div>}
        {clientId && <div className="space-y-2"><Label>Préstamos activos o en mora</Label>
          {loans.length === 0 && !loading && <p className="text-sm text-muted-foreground">No hay préstamos con saldo elegibles.</p>}
          {loans.map((loan) => <label key={loan.id} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer">
            <input type="checkbox" checked={selected.includes(loan.id)} onChange={() => toggle(loan.id)} disabled={loading} />
            <span className="flex-1 text-sm">{loan.loanNumber} · {loan.status === 'defaulted' ? 'En mora' : 'Activo'}</span>
            <span className="text-sm text-right">{money(loan.balance)}<br /><span className="text-xs text-muted-foreground">Mora excluida: {money(loan.excludedMora)}</span></span>
          </label>)}
          <Button variant="secondary" onClick={requestQuote} disabled={loading || selected.length < 2}>Calcular monto exacto</Button>
        </div>}
        {quote && <div className="space-y-4 border-t pt-4">
          <div className="rounded-md bg-muted p-3 text-sm"><strong>Nuevo monto: {money(quote.amount)}</strong><div className="font-medium">Mora total excluida: {money(quote.excludedMora)}</div><div className="mt-2 space-y-1">{quote.sources.map((s) => <div key={s.id}>{s.loanNumber}: {money(s.balance)} · mora excluida {money(s.excludedMora)}</div>)}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="unify-term">Número de cuotas</Label><Input id="unify-term" type="number" min="1" max="120" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="unify-frequency">Frecuencia</Label><select id="unify-frequency" className="w-full h-10 rounded-md border bg-background px-3" value={frequency} onChange={(e) => setFrequency(e.target.value as 'mensual' | 'quincenal')}><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option></select></div>
            <div className="space-y-2"><Label htmlFor="unify-rate">Interés mensual (%)</Label><Input id="unify-rate" type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="unify-date">Fecha de inicio</Label><Input id="unify-date" type="date" min={todayGT()} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          </div>
          {installment > 0 && <p className="text-sm">Cuota estimada: <strong>{money(installment)}</strong></p>}
          <p className="text-xs text-muted-foreground">El préstamo nuevo quedará pendiente de activación, como uno creado normalmente. La operación registrará al usuario y los saldos de origen en auditoría.</p>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cerrar</Button>
          {quote && <Button onClick={confirm} disabled={loading || !term || !rate || !startDate}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar unificación</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
