import { createClient } from '@/lib/supabase/server'
import { NextResponse, NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const advisorId = searchParams.get('advisor_id')

    if (!advisorId) {
      return NextResponse.json({ error: 'advisor_id is required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: me } = await supabase.from('users').select('role, id').eq('auth_id', user.id).single()
    if (!me) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only allow admin, contador, or the advisor themselves
    if (!['admin', 'contador'].includes(me.role) && me.id !== advisorId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: history, error: historyError } = await supabase
      .from('commission_payments')
      .select('*')
      .eq('advisor_id', advisorId)
      .order('created_at', { ascending: false })

    if (historyError) {
      console.error('[commission-history] Error fetching:', historyError)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    return NextResponse.json(history || [])
  } catch (error) {
    console.error('[commission-history] Server error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
