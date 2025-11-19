import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const numeroBoleta = searchParams.get("numero")

    let query = supabase.from("boletas").select("*").order("created_at", { ascending: false })

    if (numeroBoleta) {
      query = query.ilike("numero_boleta", `%${numeroBoleta}%`)
    }

    const { data, error } = await query

    if (error) throw error

    const boletas = data.map((b: any) => ({
      id: b.id,
      numeroBoleta: b.numero_boleta,
      formaPago: b.forma_pago,
      fecha: b.fecha,
      referencia: b.referencia,
      banco: b.banco,
      monto: Number.parseFloat(b.monto),
      observaciones: b.observaciones,
      imageUrl: b.image_url,
      createdAt: b.created_at,
      createdBy: b.created_by,
    }))

    const responseData = boletas
    const body = stableJsonStringify(responseData)
    const headers = buildCacheHeaders({
      body,
      lastModified: latestUpdatedAt(responseData) ?? new Date(),
      cacheControl: 'no-store',
    })
    const etag = headers['ETag']
    const lastMod = headers['Last-Modified']
    if (isNotModified(request, { etag, lastModified: lastMod })) {
      return new NextResponse(null, { status: 304, headers })
    }
    return NextResponse.json(responseData, { headers })
  } catch (error) {
    console.error("[v0] Error fetching boletas:", error)
    return NextResponse.json({ error: "Error fetching boletas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { numeroBoleta, formaPago, fecha, referencia, banco, monto, observaciones, imageUrl } = body

    // Validations
    if (!numeroBoleta || !formaPago || !fecha || !monto || !imageUrl) {
      return NextResponse.json({ error: "Campos requeridos faltantes (incluyendo imagen)" }, { status: 400 })
    }

    // Get the user's ID from users table (not auth.id)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .single()

    if (userError || !userData) {
      console.error("Error getting user ID:", userError)
      return NextResponse.json({ error: "Error getting user ID" }, { status: 500 })
    }

    if (monto <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    // Check if numero_boleta already exists
    const { data: existing } = await supabase.from("boletas").select("id").eq("numero_boleta", numeroBoleta).single()

    if (existing) {
      return NextResponse.json({ error: "El número de boleta ya existe" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("boletas")
      .insert({
        numero_boleta: numeroBoleta,
        forma_pago: formaPago,
        fecha,
        referencia: referencia || null,
        banco: banco || null,
        monto,
        observaciones: observaciones || null,
        image_url: imageUrl,
        created_by: userData.id, // Use the correct user ID from the users table
      })
      .select()
      .single()

    if (error) throw error

    const boleta = {
      id: data.id,
      numeroBoleta: data.numero_boleta,
      formaPago: data.forma_pago,
      fecha: data.fecha,
      referencia: data.referencia,
      banco: data.banco,
      monto: Number.parseFloat(data.monto),
      observaciones: data.observaciones,
      imageUrl: data.image_url,
      createdAt: data.created_at,
      createdBy: data.created_by,
    }

    return NextResponse.json(boleta)
  } catch (error) {
    console.error("[v0] Error creating boleta:", error)
    return NextResponse.json({ error: "Error creating boleta" }, { status: 500 })
  }
}
