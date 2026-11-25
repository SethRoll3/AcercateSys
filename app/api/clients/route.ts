import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cuiDigits, formatCui, normalizeDate } from '@/lib/dpi/normalize'

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

    // Never send DPI image paths or the raw extracted payload to the browser
    // from the general client list. Signed URLs are exposed only by
    // /api/clients/[id]/dpi after an explicit role check.
    const sanitizedClients = (clients || []).map((client: any) => {
      const {
        dpi_front_path,
        dpi_back_path,
        dpi_extracted_data,
        dpi_provider,
        dpi_scanned_at,
        ...safe
      } = client
      return safe
    })

    return NextResponse.json(sanitizedClients);
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
    const {
      first_name,
      last_name,
      email,
      phone,
      phone_country_code,
      emergency_phone,
      address,
      advisor_id,
      gender,
      dpi,
      actividad_economica,
      score_buro,
      birth_date,
      nationality,
      dpi_issue_date,
      dpi_expiry_date,
      dpi_front_path,
      dpi_back_path,
      dpi_extracted_data,
      dpi_provider,
      dpi_scanned_at,
    } = body;

    if (!first_name || !last_name || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!gender || !['hombre','mujer'].includes(String(gender))) {
      return NextResponse.json({ error: "Missing or invalid gender" }, { status: 400 });
    }

    const dpiFormatted = dpi ? formatCui(dpi) : null
    if (dpi && !dpiFormatted) {
      return NextResponse.json({ error: "El DPI debe tener exactamente 13 dígitos" }, { status: 400 })
    }
    if (!dpiFormatted) {
      return NextResponse.json({ error: "El número de DPI es obligatorio para crear el cliente" }, { status: 400 })
    }
    if (!dpi_front_path || !dpi_back_path) {
      return NextResponse.json({ error: "Debe subir el frente y el reverso del DPI para crear el cliente" }, { status: 400 })
    }

    const normalizedBirthDate = birth_date ? normalizeDate(birth_date) : null
    const normalizedIssueDate = dpi_issue_date ? normalizeDate(dpi_issue_date) : null
    const normalizedExpiryDate = dpi_expiry_date ? normalizeDate(dpi_expiry_date) : null
    if (birth_date && !normalizedBirthDate) {
      return NextResponse.json({ error: "Fecha de nacimiento inválida" }, { status: 400 })
    }
    if (dpi_issue_date && !normalizedIssueDate) {
      return NextResponse.json({ error: "Fecha de emisión del DPI inválida" }, { status: 400 })
    }
    if (dpi_expiry_date && !normalizedExpiryDate) {
      return NextResponse.json({ error: "Fecha de vencimiento del DPI inválida" }, { status: 400 })
    }

    if (dpiFormatted) {
      const digits = cuiDigits(dpiFormatted)
      const [formattedMatch, digitsMatch] = await Promise.all([
        admin.from("clients").select("id").eq("dpi", dpiFormatted).limit(1),
        admin.from("clients").select("id").eq("dpi", digits).limit(1),
      ])
      if ((formattedMatch.data && formattedMatch.data.length > 0) || (digitsMatch.data && digitsMatch.data.length > 0)) {
        return NextResponse.json({ error: "Ya existe un cliente con este DPI" }, { status: 409 })
      }
    }

    const insertData: Record<string, any> = {
      first_name,
      last_name,
      email,
      phone,
      phone_country_code,
      emergency_phone,
      address,
      advisor_id,
      gender,
      dpi: dpiFormatted,
      actividad_economica,
      score_buro,
    }

    if (normalizedBirthDate) insertData.birth_date = normalizedBirthDate
    if (nationality) insertData.nationality = String(nationality).trim()
    if (normalizedIssueDate) insertData.dpi_issue_date = normalizedIssueDate
    if (normalizedExpiryDate) insertData.dpi_expiry_date = normalizedExpiryDate
    if (dpi_front_path) insertData.dpi_front_path = String(dpi_front_path)
    if (dpi_back_path) insertData.dpi_back_path = String(dpi_back_path)
    if (dpi_extracted_data && typeof dpi_extracted_data === "object") {
      insertData.dpi_extracted_data = dpi_extracted_data
    }
    if (dpi_provider) insertData.dpi_provider = String(dpi_provider)
    if (dpi_front_path || dpi_back_path) {
      insertData.dpi_scanned_at = dpi_scanned_at || new Date().toISOString()
    }

    const { data: newClient, error } = await admin
      .from("clients")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error("Error creating client:", error);
      const missingDpiColumns = error.code === '42703' || /column .* does not exist/i.test(error.message || '')
      return NextResponse.json(
        {
          error: missingDpiColumns
            ? 'La migración de DPI aún no está aplicada. Ejecuta 20261120090000_add_dpi_documents_to_clients.sql en Supabase.'
            : error.message,
        },
        { status: 500 },
      );
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

    const { data: me } = await supabase.from("users").select("id, role").eq("auth_id", user.id).single()

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
    if (typeof updates.gender !== 'undefined' && updates.gender !== null) {
      const g = String(updates.gender)
      if (!['hombre','mujer'].includes(g)) {
        return NextResponse.json({ error: "Invalid gender value" }, { status: 400 })
      }
      updates.gender = g
    }

    if (typeof updates.dpi !== 'undefined') {
      const formatted = updates.dpi ? formatCui(updates.dpi) : null
      if (updates.dpi && !formatted) {
        return NextResponse.json({ error: "El DPI debe tener exactamente 13 dígitos" }, { status: 400 })
      }
      updates.dpi = formatted
    }

    for (const field of ['birth_date', 'dpi_issue_date', 'dpi_expiry_date'] as const) {
      if (typeof updates[field] !== 'undefined') {
        const normalized = updates[field] ? normalizeDate(updates[field]) : null
        if (updates[field] && !normalized) {
          return NextResponse.json({ error: `Fecha inválida en ${field}` }, { status: 400 })
        }
        updates[field] = normalized
      }
    }

    if (typeof updates.dpi_extracted_data !== 'undefined' && (updates.dpi_extracted_data === null || typeof updates.dpi_extracted_data !== 'object')) {
      updates.dpi_extracted_data = null
    }

    // Get current client data for log comparison and advisor scoping
    const { data: currentClient } = await admin.from("clients").select("*").eq("id", id).single()

    if (!currentClient) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    if (me.role === "asesor" && currentClient.advisor_id !== me.id) {
      return NextResponse.json({ error: "No autorizado para este cliente" }, { status: 403 })
    }

    if (updates.dpi) {
      const digits = cuiDigits(updates.dpi)
      const [formattedMatch, digitsMatch] = await Promise.all([
        admin.from("clients").select("id").eq("dpi", updates.dpi).neq("id", id).limit(1),
        admin.from("clients").select("id").eq("dpi", digits).neq("id", id).limit(1),
      ])
      if ((formattedMatch.data && formattedMatch.data.length > 0) || (digitsMatch.data && digitsMatch.data.length > 0)) {
        return NextResponse.json({ error: "Ya existe otro cliente con este DPI" }, { status: 409 })
      }
    }

    if ((updates.dpi_front_path || updates.dpi_back_path) && !updates.dpi_scanned_at) {
      updates.dpi_scanned_at = new Date().toISOString()
    }

    const { data: updatedClient, error } = await admin
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating client:", error)
      const missingDpiColumns = error.code === '42703' || /column .* does not exist/i.test(error.message || '')
      return NextResponse.json(
        {
          error: missingDpiColumns
            ? 'La migración de DPI aún no está aplicada. Ejecuta 20261120090000_add_dpi_documents_to_clients.sql en Supabase.'
            : error.message,
        },
        { status: 500 },
      )
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
