'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Info = {
  newLoanId: string; newLoanNumber: string; amount: number; excludedMora: number
  actorName: string; createdAt: string
  sources: { id: string; loanNumber: string; balance: number; excludedMora: number }[]
}
const money = (n: number) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n)

export function LoanUnificationInfo({ loanId }: { loanId: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  useEffect(() => {
    let active = true
    fetch(`/api/loans/unify?loanId=${encodeURIComponent(loanId)}`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (active) setInfo(data?.unification || null) })
      .catch(() => {})
    return () => { active = false }
  }, [loanId])
  if (!info) return null
  const isNew = info.newLoanId === loanId
  return <section className="rounded-lg border bg-card p-4 space-y-2 text-sm">
    <h3 className="font-semibold">{isNew ? 'Préstamo creado por unificación' : 'Préstamo unificado'}</h3>
    {!isNew && <p>Nuevo préstamo: <Link className="underline" href={`/dashboard/loans/${info.newLoanId}`}>{info.newLoanNumber}</Link></p>}
    <p>Monto del nuevo préstamo: <strong>{money(info.amount)}</strong></p>
    <p>Mora total excluida: <strong>{money(info.excludedMora)}</strong></p>
    <p>Unificado por {info.actorName} el {new Date(info.createdAt).toLocaleString('es-GT')}</p>
    <div>Préstamos de origen:
      <ul className="ml-5 list-disc">{info.sources.map((source) => <li key={source.id}>
        <Link className="underline" href={`/dashboard/loans/${source.id}`}>{source.loanNumber}</Link>
        {' · saldo '}{money(source.balance)}{' · mora excluida '}{money(source.excludedMora)}
      </li>)}</ul>
    </div>
  </section>
}
