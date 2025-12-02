import { createClient, createAdminClient } from "@/lib/supabase/server";
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
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load loans in this group
  const { data: lgRows } = await admin
    .from('loans_groups')
    .select('loans')
    .eq('group_id', id)
    .limit(1)
  const lg = Array.isArray(lgRows) ? lgRows[0] : null
  const loanIds: string[] = (lg?.loans || []).map((e: any) => String(e.loan_id)).filter(Boolean)

  // If there are loans, delete their payments, schedule, links and the loan itself
  if (loanIds.length) {
    const { error: delPaymentsErr } = await admin
      .from('payments')
      .delete()
      .in('loan_id', loanIds)
    if (delPaymentsErr) {
      return NextResponse.json({ error: delPaymentsErr.message }, { status: 500 })
    }

    const { data: schedules } = await admin
      .from('payment_schedule')
      .select('id')
      .in('loan_id', loanIds)
    const scheduleIds = (schedules || []).map((r: any) => r.id)

    if (scheduleIds.length) {
      const { error: delLinksErr } = await admin
        .from('cuota_boletas')
        .delete()
        .in('payment_schedule_id', scheduleIds)
      if (delLinksErr) {
        return NextResponse.json({ error: delLinksErr.message }, { status: 500 })
      }
    }

    const { error: delSchedulesErr } = await admin
      .from('payment_schedule')
      .delete()
      .in('loan_id', loanIds)
    if (delSchedulesErr) {
      return NextResponse.json({ error: delSchedulesErr.message }, { status: 500 })
    }

    const { error: delLoansErr } = await admin
      .from('loans')
      .delete()
      .in('id', loanIds)
    if (delLoansErr) {
      return NextResponse.json({ error: delLoansErr.message }, { status: 500 })
    }
  }

  // First, remove group_id from all clients in this group
  const { error: updateClientsError } = await admin
    .from("clients")
    .update({ group_id: null, in_group: false })
    .eq("group_id", id);

  if (updateClientsError) {
    return NextResponse.json({ error: updateClientsError.message }, { status: 500 });
  }

  // Delete mapping row
  const { error: deleteMapError } = await admin
    .from('loans_groups')
    .delete()
    .eq('group_id', id)
  if (deleteMapError) {
    return NextResponse.json({ error: deleteMapError.message }, { status: 500 })
  }

  // Then, delete the group
  const { error: deleteGroupError } = await admin
    .from("grupos")
    .delete()
    .eq("id", id);

  if (deleteGroupError) {
    return NextResponse.json({ error: deleteGroupError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Group deleted successfully" });
}
