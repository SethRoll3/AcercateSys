import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { status } = await request.json()
  const scheduleId = params.id

  if (!status || !['paid', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createClient()

  try {
    // Obtener el usuario actual para verificar el rol
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Actualizar el estado de la cuota
    const { error: updateError } = await supabase
      .from('payment_schedule')
      .update({ status })
      .eq('id', scheduleId)

    if (updateError) {
      console.error('Error updating payment schedule status:', updateError)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    // Actualizar el estado de confirmación en la tabla de pagos
    const newConfirmationStatus = status === 'paid' ? 'confirmed' : 'rejected'
    const { error: paymentUpdateError } = await supabase
      .from('payments')
      .update({
        confirmation_status: newConfirmationStatus,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('schedule_id', scheduleId)

    if (paymentUpdateError) {
      console.error('Error updating payment confirmation status:', paymentUpdateError)
      // No fallar la operación completa, pero registrar el error
    }

    return NextResponse.json({ message: 'Status updated successfully' })
  } catch (error) {
    console.error('Error in PATCH /api/payments/[id]/status:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}