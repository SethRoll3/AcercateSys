import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: scheduleId } = await params

    if (!scheduleId) {
      return NextResponse.json({ error: "Schedule ID is required" }, { status: 400 })
    }

    // Get boletas for this payment schedule
    const { data: cuotaBoletas, error } = await supabase
      .from("cuota_boletas")
      .select(`
        id,
        payment_schedule_id,
        boleta_id,
        created_at,
        boletas (
          id,
          numero_boleta,
          forma_pago,
          fecha,
          referencia,
          banco,
          monto,
          observaciones,
          created_at,
          created_by,
          image_url
        )
      `)
      .eq("payment_schedule_id", scheduleId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching boletas for schedule:", error)
      return NextResponse.json({ error: "Failed to fetch boletas" }, { status: 500 })
    }

    // Transform the data to match frontend expectations
    const boletas = cuotaBoletas?.map((cb: any) => ({
      id: cb.boletas.id,
      numeroBoleta: cb.boletas.numero_boleta,
      formaPago: cb.boletas.forma_pago,
      fecha: cb.boletas.fecha,
      referencia: cb.boletas.referencia,
      banco: cb.boletas.banco,
      monto: Number.parseFloat(cb.boletas.monto),
      observaciones: cb.boletas.observaciones,
      createdAt: cb.boletas.created_at,
      createdBy: cb.boletas.created_by,
      imageUrl: cb.boletas.image_url
    })) || []

    const responseData = { boletas }
    const body = stableJsonStringify(responseData)
    const headers = buildCacheHeaders({
      body,
      lastModified: latestUpdatedAt(boletas) ?? new Date(),
      cacheControl: 'private, max-age=0, must-revalidate',
    })
    const etag = headers['ETag']
    const lastMod = headers['Last-Modified']
    if (isNotModified(request, { etag, lastModified: lastMod })) {
      return new NextResponse(null, { status: 304, headers })
    }
    return NextResponse.json(responseData, { headers })
  } catch (error) {
    console.error("Error in payment schedule boletas API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
