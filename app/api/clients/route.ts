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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const admin = await (await import('@/lib/supabase/server')).createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: me } = await supabase.from("users").select("role").eq("auth_id", user.id).single();

    if (!me || (me.role !== "admin" && me.role !== "asesor")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { first_name, last_name, email, phone, phone_country_code, emergency_phone, address, advisor_id } = body;

    if (!first_name || !last_name || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: newClient, error } = await admin
      .from("clients")
      .insert([
        {
          first_name,
          last_name,
          email,
          phone,
          phone_country_code,
          emergency_phone,
          address,
          advisor_id,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating client:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the creation
    try {
      let actorId = null
      if (user) {
        const { data: userData } = await admin.from("users").select("id").eq("auth_id", user.id).single()
        actorId = userData?.id
      }
      
      await admin.from("logs").insert({
        actor_user_id: actorId,
        action_type: "CREATE",
        entity_name: "clients",
        entity_id: newClient.id,
        action_at: new Date().toISOString(),
        details: {
          message: `Creó al cliente ${first_name} ${last_name}`,
          client_name: `${first_name} ${last_name}`,
          email: email
        }
      })
    } catch (logErr) {
      console.error("Error creating log for client creation:", logErr)
    }

    return NextResponse.json(newClient);
  } catch (err) {
    console.error("Internal server error creating client:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const admin = await (await import('@/lib/supabase/server')).createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: me } = await supabase.from("users").select("role").eq("auth_id", user.id).single()

    if (!me || (me.role !== "admin" && me.role !== "asesor")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 })
    }

    // Sanitize updates
    if (updates.advisor_id === "") updates.advisor_id = null
    if (updates.group_id === "") updates.group_id = null

    // Get current client data for log comparison (optional, but good for details)
    const { data: currentClient } = await admin.from("clients").select("*").eq("id", id).single()

    const { data: updatedClient, error } = await admin
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating client:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log the update
    try {
      let actorId = null
      if (user) {
        const { data: userData } = await admin.from("users").select("id").eq("auth_id", user.id).single()
        actorId = userData?.id
      }

      await admin.from("logs").insert({
        actor_user_id: actorId,
        action_type: "UPDATE",
        entity_name: "clients",
        entity_id: id,
        action_at: new Date().toISOString(),
        details: {
          message: `Actualizó al cliente ${updatedClient.first_name} ${updatedClient.last_name}`,
          client_name: `${updatedClient.first_name} ${updatedClient.last_name}`,
          changes: Object.keys(updates)
        }
      })
    } catch (logErr) {
      console.error("Error creating log for client update:", logErr)
    }

    return NextResponse.json(updatedClient)
  } catch (err) {
    console.error("Internal server error updating client:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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

    // Log the deletion (inactivation)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let actorId = null
      if (user) {
        const { data: userData } = await admin.from("users").select("id").eq("auth_id", user.id).single()
        actorId = userData?.id
      }

      await admin.from("logs").insert({
        actor_user_id: actorId,
        action_type: "DELETE", // Logical delete (inactivation)
        entity_name: "clients",
        entity_id: id,
        action_at: new Date().toISOString(),
        details: {
          message: `Cliente ${clientRow?.email || id} inactivado.`,
          client_id: id,
          client_email: clientRow?.email,
        },
      })
    } catch (logErr) {
      console.error("Error creating log for client inactivation:", logErr)
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
