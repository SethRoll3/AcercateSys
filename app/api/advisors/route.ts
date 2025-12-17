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
  const { data: clientAdvisorRows } = await admin
    .from('clients')
    .select('*')
  console.log("clientAdvisorRows:", clientAdvisorRows)
  const advisorIds = Array.from(new Set((clientAdvisorRows || []).map((r: any) => String(r.advisor_id || '')).filter(Boolean)))
  const { data: advisorsById, error: byIdError } = advisorIds.length
    ? await admin
        .from('users')
        .select('id, email, full_name, role, auth_id')
        .or(`id.in.(${advisorIds.join(',')}),auth_id.in.(${advisorIds.join(',')})`)
    : { data: [], error: null as any }
  const { data: roleAdvisors, error: roleError } = await admin
    .from('users')
    .select('id, email, full_name, role')
    .eq('role', 'asesor')
  const byIdMap: Record<string, any> = {}
  for (const u of (advisorsById || [])) byIdMap[String(u.id)] = u
  const combined = [...(roleAdvisors || [])]
  for (const id of advisorIds) {
    if (!byIdMap[id]) continue
    if (!combined.find((u: any) => String(u.id) === id)) combined.push(byIdMap[id])
  }

  if (byIdError || roleError) {
    const err = (byIdError || roleError) as any
    return NextResponse.json({ error: err?.message || 'Failed to fetch advisors' }, { status: 500 })
  }

  const responseData = combined || []
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
