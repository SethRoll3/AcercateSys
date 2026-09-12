import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

type AbonoType = "full" | "capital_only" | "no_mora" | "capital_interest_only" | "no_admin_fees"

interface AbonoRequest {
  amount: number
  paymentMethod: string
  paymentDate: string
  notes?: string
  type: AbonoType
  boletaIds?: string[]
}

interface DistributionItem {
  scheduleId: string
  paymentNumber: number
  dueDate: string
  totalDue: number
  alreadyPaid: number
  appliedAmount: number
  newPaidAmount: number
  extraCapital: number
  waivedInterest: number
  waivedMora: number
  waivedAdminFees: number
  status: string
}

const TYPE_LABELS: Record<AbonoType, string> = {
  full: "Completo",
  capital_only: "Solo capital",
  no_mora: "Sin mora",
  capital_interest_only: "Sin mora ni admin",
  no_admin_fees: "Sin admin",
}

function calculateTotalDue(sched: any, type: AbonoType): number {
  const principal = Number(sched.principal) || 0
  const interest = Number(sched.interest) || 0
  const mora = Number(sched.mora) || 0
  const adminFees = Number(sched.admin_fees) || 0

  switch (type) {
    case "full":
      return principal + interest + mora + adminFees
    case "capital_only":
      return principal
    case "no_mora":
      return principal + interest + adminFees
    case "capital_interest_only":
      return principal + interest
    case "no_admin_fees":
      return principal + interest + mora
  }
}

function calculateWaived(sched: any, type: AbonoType): { interest: number; mora: number; adminFees: number } {
  const interest = Number(sched.interest) || 0
  const mora = Number(sched.mora) || 0
  const adminFees = Number(sched.admin_fees) || 0

  switch (type) {
    case "full":
      return { interest: 0, mora: 0, adminFees: 0 }
    case "capital_only":
      return { interest, mora, adminFees }
    case "no_mora":
      return { interest: 0, mora, adminFees: 0 }
    case "capital_interest_only":
      return { interest: 0, mora, adminFees }
    case "no_admin_fees":
      return { interest: 0, mora: 0, adminFees }
  }
}

function isCuotaPaid(sched: any, newPaidAmount: number, type: AbonoType): boolean {
  const principal = Number(sched.principal) || 0
  const interest = Number(sched.interest) || 0
  const mora = Number(sched.mora) || 0
  const adminFees = Number(sched.admin_fees) || 0

  let fullDue: number
  switch (type) {
    case "full":
      fullDue = principal + interest + mora + adminFees
      break
    case "capital_only":
      fullDue = principal
      break
    case "no_mora":
      fullDue = principal + interest + adminFees
      break
    case "capital_interest_only":
      fullDue = principal + interest
      break
    case "no_admin_fees":
      fullDue = principal + interest + mora
      break
  }

  return newPaidAmount >= fullDue
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: AbonoRequest = await request.json()
    const { amount, paymentMethod, paymentDate, notes, type, boletaIds = [] } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }
    if (!paymentMethod || !paymentDate) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }
    if (!TYPE_LABELS[type]) {
      return NextResponse.json({ error: "Tipo de abono inválido" }, { status: 400 })
    }

    const { data: loan, error: loanError } = await admin
      .from("loans")
      .select("id, status, amount")
      .eq("id", loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 })
    }
    if (loan.status !== "active") {
      return NextResponse.json({ error: "El préstamo no está activo" }, { status: 400 })
    }

    const { data: schedules, error: schedError } = await admin
      .from("payment_schedule")
      .select("id, payment_number, due_date, amount, principal, interest, mora, admin_fees, paid_amount, extra_capital, status")
      .eq("loan_id", loanId)
      .in("status", ["pending", "overdue", "partially_paid"])
      .order("payment_number", { ascending: true })

    if (schedError || !schedules || schedules.length === 0) {
      return NextResponse.json({ error: "No hay cuotas pendientes" }, { status: 400 })
    }

    // Fase 1: Distribuir el abono entre cuotas según el tipo
    let remaining = Math.round(amount * 100) / 100
    const distribution: DistributionItem[] = []

    for (const sched of schedules) {
      if (remaining <= 0) break

      const alreadyPaid = Number(sched.paid_amount) || 0
      const totalDue = calculateTotalDue(sched, type)
      const pending = Math.round((totalDue - alreadyPaid) * 100) / 100
      if (pending <= 0) continue

      const applied = Math.round(Math.min(remaining, pending) * 100) / 100
      const newPaidAmount = Math.round((alreadyPaid + applied) * 100) / 100
      const paid = isCuotaPaid(sched, newPaidAmount, type)
      const waived = paid ? calculateWaived(sched, type) : { interest: 0, mora: 0, adminFees: 0 }

      distribution.push({
        scheduleId: sched.id,
        paymentNumber: sched.payment_number,
        dueDate: sched.due_date,
        totalDue,
        alreadyPaid,
        appliedAmount: applied,
        newPaidAmount,
        extraCapital: 0,
        waivedInterest: waived.interest,
        waivedMora: waived.mora,
        waivedAdminFees: waived.adminFees,
        status: paid ? "paid" : "partially_paid",
      })

      remaining = Math.round((remaining - applied) * 100) / 100
    }

    // Fase 2: Si sobra dinero, aplicarlo como capital extra a la siguiente cuota
    let extraCapitalApplied = 0
    let extraCapitalScheduleId = ""
    let extraCapitalPaymentNumber = 0

    if (remaining > 0 && distribution.length > 0) {
      const lastPaymentNumber = distribution[distribution.length - 1].paymentNumber
      const nextSched = schedules.find(
        (s) => s.payment_number === lastPaymentNumber + 1
      )
      if (nextSched) {
        extraCapitalApplied = remaining
        extraCapitalScheduleId = nextSched.id
        extraCapitalPaymentNumber = nextSched.payment_number
        remaining = 0
      }
    }

    if (distribution.length === 0 && extraCapitalApplied === 0) {
      return NextResponse.json({ error: "No se pudo distribuir el abono en cuotas pendientes" }, { status: 400 })
    }

    const { count } = await admin.from("payments").select("*", { count: "exact", head: true })
    const receiptPrefix = `REC-${String((count || 0) + 1).padStart(6, "0")}`
    const randomSegment = Math.random().toString(36).slice(2, 8).toUpperCase()
    const receiptNumber = `${receiptPrefix}-${randomSegment}`

    const createdPayments: any[] = []
    const typeLabel = TYPE_LABELS[type]

    // Crear pagos para cada cuota afectada
    for (const item of distribution) {
      const paymentNotes = `[ABONO] (${typeLabel}) ${notes || ""}`.trim()
      const { data: newPayment, error: payErr } = await admin
        .from("payments")
        .insert({
          loan_id: loanId,
          schedule_id: item.scheduleId,
          amount: item.appliedAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes: paymentNotes,
          receipt_number: receiptNumber,
          confirmation_status: "pending_confirmation",
          has_been_edited: false,
        })
        .select()
        .single()

      if (payErr) {
        console.error("Error creating abono payment:", payErr)
        continue
      }

      createdPayments.push(newPayment)

      await admin
        .from("payment_schedule")
        .update({
          status: item.status,
          paid_amount: item.newPaidAmount,
          waived_interest: item.waivedInterest,
          waived_mora: item.waivedMora,
          waived_admin_fees: item.waivedAdminFees,
        })
        .eq("id", item.scheduleId)
    }

    // Aplicar capital extra a la siguiente cuota
    if (extraCapitalApplied > 0 && extraCapitalScheduleId) {
      const { data: extraSched } = await admin
        .from("payment_schedule")
        .select("paid_amount, extra_capital")
        .eq("id", extraCapitalScheduleId)
        .single()

      const currentPaid = Number(extraSched?.paid_amount) || 0
      const currentExtra = Number(extraSched?.extra_capital) || 0

      await admin
        .from("payment_schedule")
        .update({
          extra_capital: Math.round((currentExtra + extraCapitalApplied) * 100) / 100,
          paid_amount: Math.round((currentPaid + extraCapitalApplied) * 100) / 100,
        })
        .eq("id", extraCapitalScheduleId)

      // Crear registro de pago para el capital extra
      const extraPaymentNotes = `[ABONO] (${typeLabel}) Capital extra de abono anterior: Q${extraCapitalApplied.toFixed(2)}`
      const { data: extraPayment } = await admin
        .from("payments")
        .insert({
          loan_id: loanId,
          schedule_id: extraCapitalScheduleId,
          amount: extraCapitalApplied,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes: extraPaymentNotes,
          receipt_number: receiptNumber,
          confirmation_status: "pending_confirmation",
          has_been_edited: false,
        })
        .select()
        .single()

      if (extraPayment) {
        createdPayments.push(extraPayment)
      }
    }

    // Asignar boletas a la primera cuota afectada
    if (boletaIds.length > 0 && distribution.length > 0) {
      const firstScheduleId = distribution[0].scheduleId
      const insertData = boletaIds.map((boletaId: string) => ({
        payment_schedule_id: firstScheduleId,
        boleta_id: boletaId,
      }))
      const { error: assignError } = await admin
        .from("cuota_boletas")
        .insert(insertData)

      if (assignError) {
        console.error("Error assigning boletas to abono schedule:", assignError)
      }
    }

    // Verificar si todas las cuotas están pagadas
    const { data: allSchedules } = await admin
      .from("payment_schedule")
      .select("status")
      .eq("loan_id", loanId)

    const allPaid = (allSchedules || []).length > 0 &&
      (allSchedules || []).every((s: any) => String(s.status).toLowerCase() === "paid")

    if (allPaid) {
      await admin.from("loans").update({ status: "paid" }).eq("id", loanId)
    }

    // Log
    const totalWaivedInterest = distribution.reduce((sum, d) => sum + d.waivedInterest, 0)
    const totalWaivedMora = distribution.reduce((sum, d) => sum + d.waivedMora, 0)
    const totalWaivedAdminFees = distribution.reduce((sum, d) => sum + d.waivedAdminFees, 0)
    const totalWaived = totalWaivedInterest + totalWaivedMora + totalWaivedAdminFees

    await admin.from("logs").insert({
      actor_user_id: user.id,
      action_type: "CREATE",
      entity_name: "abono",
      entity_id: loanId,
      action_at: new Date().toISOString(),
      details: {
        message: `Abono de Q${amount} (${typeLabel}). Cuotas: ${distribution.length}. Capital extra: Q${extraCapitalApplied.toFixed(2)}. Condонado: Q${totalWaived.toFixed(2)}`,
        loan_id: loanId,
        amount,
        type,
        typeLabel,
        boletaIds,
        extraCapitalApplied,
        extraCapitalScheduleId,
        waived: {
          interest: totalWaivedInterest,
          mora: totalWaivedMora,
          adminFees: totalWaivedAdminFees,
          total: totalWaived,
        },
        distribution: distribution.map(d => ({
          cuota: d.paymentNumber,
          monto: d.appliedAmount,
          waivedInterest: d.waivedInterest,
          waivedMora: d.waivedMora,
          waivedAdminFees: d.waivedAdminFees,
        })),
      },
    })

    const totalApplied = Math.round((amount - remaining) * 100) / 100

    return NextResponse.json({
      success: true,
      distribution,
      extraCapitalApplied,
      extraCapitalPaymentNumber,
      totalApplied,
      remaining: 0,
      paymentsCreated: createdPayments.length,
      loanPaidOff: allPaid,
      typeLabel,
    })
  } catch (error) {
    console.error("Error in POST /api/loans/[id]/abono:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
