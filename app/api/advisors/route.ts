import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from '@/lib/http-cache'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: advisors, error } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('role', 'asesor')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const responseData = advisors || []
  const body = stableJsonStringify(responseData)
  const headers = buildCacheHeaders({
    body,
    lastModified: latestUpdatedAt(responseData) ?? new Date(),
    cacheControl: 'private, max-age=60, stale-while-revalidate=300',
  })
  const etag = headers['ETag']
  const lastMod = headers['Last-Modified']
  if (isNotModified(request, { etag, lastModified: lastMod })) {
    return new NextResponse(null, { status: 304, headers })
  }
  return NextResponse.json(responseData, { headers })
}
