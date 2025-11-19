import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: boletas, error } = await supabase
      .from('boletas')
      .select(`
        id,
        numero_boleta,
        forma_pago,
        fecha,
        monto,
        referencia,
        banco,
        observaciones,
        created_at,
        created_by,
        image_url
      `)
      .ilike('numero_boleta', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Error searching boletas:', error)
      return NextResponse.json({ error: 'Failed to search boletas' }, { status: 500 })
    }

    // Transform the data to match frontend expectations
    const transformedBoletas = boletas?.map((boleta: { id: any; numero_boleta: any; forma_pago: any; fecha: any; monto: any; referencia: any; banco: any; observaciones: any; created_at: any; created_by: any, image_url: any }) => ({
      id: boleta.id,
      numeroBoleta: boleta.numero_boleta,
      formaPago: boleta.forma_pago,
      fecha: boleta.fecha,
      monto: boleta.monto,
      referencia: boleta.referencia,
      banco: boleta.banco,
      observaciones: boleta.observaciones,
      createdAt: boleta.created_at,
      createdBy: boleta.created_by,
      imageUrl: boleta.image_url
    })) || []

    const responseData = transformedBoletas
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
    console.error('Error in boletas search API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
