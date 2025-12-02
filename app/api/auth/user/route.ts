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

    // Obtener el rol y estado del usuario desde la tabla 'users'
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, status')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      console.error('Error fetching user role from DB:', userError)
      return NextResponse.json({ error: 'User role not found' }, { status: 404 })
    }

    if (userData.status && userData.status !== 'active') {
      return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
    }

    return NextResponse.json({ id: user.id, email: user.email, role: userData.role, status: userData.status || 'active' })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
