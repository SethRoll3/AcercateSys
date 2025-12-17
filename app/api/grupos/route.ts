import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, clients } = await request.json();

  if (!name || !clients || clients.length < 3 || clients.length > 5) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const { data: group, error: groupError } = await supabase
    .from("grupos")
    .insert([{ nombre: name, clientes_ids: clients }])
    .select()
    .single();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  const { error: clientsError } = await supabase
    .from("clients")
    .update({ group_id: group.id, in_group: true })
    .in("id", clients);

  if (clientsError) {
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }

  // Log the group creation
  try {
    const admin = await createAdminClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    let actorId = caller?.id;

    await admin.from("logs").insert({
      actor_user_id: actorId,
      action_type: "CREATE",
      entity_name: "grupos",
      entity_id: group.id,
      action_at: new Date().toISOString(),
      details: {
        message: `Creó el grupo "${name}" con ${clients.length} clientes.`,
        group_id: group.id,
        group_name: name,
        client_count: clients.length,
      },
    });
  } catch (logErr) {
    console.error("Error creating log for group creation:", logErr);
  }

  return NextResponse.json(group);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', user.id)
    .single();

  if (userError || !userData) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let { data, error } = await supabase.from("grupos").select("*, clients(*)");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (userData.role === 'asesor' && data) {
    data = data.filter(grupo => 
      grupo.clients.some((client: { advisor_id: any; }) => client.advisor_id === userData.id)
    );
  }

  const responseData = data || []
  const body = stableJsonStringify(responseData)
  const headers = buildCacheHeaders({
    body,
    lastModified: latestUpdatedAt(responseData) ?? new Date(),
    cacheControl: 'private, max-age=0, must-revalidate',
  })
  const etag = headers['ETag']
  const lastMod = headers['Last-Modified']
  if (isNotModified(request, { etag, lastModified: lastMod })) {
    return new NextResponse(null, { status: 304, headers })
  }
  return NextResponse.json(responseData, { headers });
}
