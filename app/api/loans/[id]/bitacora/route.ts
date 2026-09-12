import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export async function GET(
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

    // Verificar si la tabla existe primero
    const { error: tableCheckError } = await admin
      .from("bitacora_atrasos")
      .select("id", { count: "exact", head: true })
      .limit(0)

    if (tableCheckError) {
      // Tabla no existe o error de conexión — devolver resultado vacío
      console.warn("bitacora_atrasos table not available:", tableCheckError.message)
      return NextResponse.json({ bitacora: [], summary: {
        totalRegistros: 0,
        maxDiasAtraso: 0,
        totalInteresPerdido: 0,
        totalMora: 0,
      }})
    }

    const { data: bitacora, error: bitacoraError } = await admin
      .from("bitacora_atrasos")
      .select(`
        id,
        fecha_atraso,
        dias_atraso,
        capital_pendiente,
        interes_perdido,
        mora_acumulada,
        notas,
        created_at,
        schedule:payment_schedule(
          payment_number,
          due_date
        )
      `)
      .eq("loan_id", loanId)
      .order("fecha_atraso", { ascending: false })

    if (bitacoraError) {
      console.error("Error fetching bitacora:", bitacoraError)
      return NextResponse.json({ error: "Error al obtener bitácora" }, { status: 500 })
    }

    const transformed = (bitacora || []).map((b: any) => ({
      id: b.id,
      fechaAtraso: b.fecha_atraso,
      diasAtraso: b.dias_atraso,
      capitalPendiente: Number(b.capital_pendiente),
      interesPerdido: Number(b.interes_perdido),
      moraAcumulada: Number(b.mora_acumulada),
      notas: b.notas,
      createdAt: b.created_at,
      schedule: b.schedule
        ? {
            paymentNumber: b.schedule.payment_number,
            dueDate: b.schedule.due_date,
          }
        : null,
    }))

    const summary = {
      totalRegistros: transformed.length,
      maxDiasAtraso: transformed.reduce((max, b) => Math.max(max, b.diasAtraso), 0),
      totalInteresPerdido: transformed.reduce((sum, b) => sum + b.interesPerdido, 0),
      totalMora: transformed.reduce((sum, b) => sum + b.moraAcumulada, 0),
    }

    return NextResponse.json({ bitacora: transformed, summary })
  } catch (error) {
    console.error("Error in GET /api/loans/[id]/bitacora:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
