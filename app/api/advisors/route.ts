import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from '@/lib/http-cache'

export async function GET(request: Request) {
  const regular = await createClient()
  const { data: { user }, error: authError } = await regular.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: me, error: meError } = await regular
    .from('users')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (meError || !me || !['admin','asesor'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = await createAdminClient()
  const { data: advisors, error } = await admin
    .from('users')
    .select('id, email, full_name, role')
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
