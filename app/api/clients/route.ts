import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: clients, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching clients:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(clients);
  } catch (err) {
    console.error("Internal server error fetching clients:", err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await (await import('@/lib/supabase/server')).createAdminClient()
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    // 0. Fetch client email (to inactivate linked user)
    const { data: clientRow, error: fetchClientError } = await supabase
      .from('clients')
      .select('email')
      .eq('id', id)
      .single()

    if (fetchClientError) {
      console.error('Error fetching client email before delete:', fetchClientError)
    }

    // 1. Update client status to inactive
    const { error: clientError } = await supabase
      .from('clients')
      .update({ status: 'inactive' })
      .eq('id', id)

    if (clientError) {
      console.error("Error updating client status:", clientError);
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    // 2. Update active/pending loans to inactive
    const { error: loansError } = await supabase
      .from('loans')
      .update({ status: 'inactive' })
      .eq('client_id', id)
      .in('status', ['active', 'pending'])

    if (loansError) {
      console.error('Error updating loans status:', loansError)
      // We continue even if updating loans fails, but ideally we should handle transactionally.
      // For now, just logging is consistent with simple patterns.
    }

    // 3. If client has a linked user (by email), mark user as inactive to block login
    if (clientRow?.email) {
      const { error: userUpdateError } = await admin
        .from('users')
        .update({ status: 'inactive' })
        .eq('email', clientRow.email)

      if (userUpdateError) {
        console.error('Error updating linked user status to inactive:', userUpdateError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Internal server error deleting client:", err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
