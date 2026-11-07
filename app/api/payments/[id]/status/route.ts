import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Legacy endpoint: keep its schedule-based contract, but use the same atomic
// review as the payment review screen.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { status } = await request.json()
  if (!['paid', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('auth_id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: scheduleId } = await params
  const admin = createAdminClient()
  const { data: pending, error: lookupError } = await admin.from('payments')
    .select('id').eq('schedule_id', scheduleId)
    .in('confirmation_status', ['pendiente', 'pending_confirmation'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (lookupError || !pending) {
    return NextResponse.json({ error: 'No pending payment for this schedule' }, { status: 404 })
  }

  const { data, error } = await admin.rpc('review_payment_atomically', {
    p_payment_id: pending.id,
    p_reviewer_id: user.id,
    p_action: status === 'paid' ? 'aprobar' : 'rechazar',
    p_rejection_reason: null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ message: 'Status updated successfully', review: data })
}
