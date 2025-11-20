import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Obtener el rol del usuario desde la tabla 'users'
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      console.error('Error fetching user role from DB:', userError)
      return NextResponse.json({ error: 'User role not found' }, { status: 404 })
    }

    return NextResponse.json({ id: user.id, email: user.email, role: userData.role })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}