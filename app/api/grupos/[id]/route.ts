import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: { id: string } }) {
  const { id } = await Promise.resolve(context.params);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: group, error } = await supabase
    .from("grupos")
    .select("*, clients(*)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json(group);
}

export async function PUT(request: Request, context: { params: { id: string } }) {
  const { id } = await Promise.resolve(context.params);
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
    .update({ nombre: name, clientes_ids: clients })
    .eq("id", id)
    .select()
    .single();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Reset group_id for clients no longer in this group
  const { error: resetError } = await supabase
    .from("clients")
    .update({ group_id: null, in_group: false })
    .eq("group_id", id)
    .not("id", "in", `(${clients.map((c: string) => `'${c}'`).join(',')})`);

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }

  // Update group_id for clients now in this group
  const { error: clientsError } = await supabase
    .from("clients")
    .update({ group_id: group.id, in_group: true })
    .in("id", clients);

  if (clientsError) {
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }

  return NextResponse.json(group);
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  const { id } = await Promise.resolve(context.params);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // First, remove group_id from all clients in this group
  const { error: updateClientsError } = await supabase
    .from("clients")
    .update({ group_id: null, in_group: false })
    .eq("group_id", id);

  if (updateClientsError) {
    return NextResponse.json({ error: updateClientsError.message }, { status: 500 });
  }

  // Then, delete the group
  const { error: deleteGroupError } = await supabase
    .from("grupos")
    .delete()
    .eq("id", id);

  if (deleteGroupError) {
    return NextResponse.json({ error: deleteGroupError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Group deleted successfully" });
}