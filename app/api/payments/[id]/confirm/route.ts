import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendWhatsAppTemplate } from "@/lib/messaging";
import { getSystemSettings } from "@/lib/messaging/settings";
import { getTemplate, renderTemplate, getTemplateRow } from "@/lib/messaging/templates";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    console.log(`[PAYMENT_CONFIRM_API] Received request for payment ID: ${id}`);
    const supabase = await createClient();
    const body = await request.json();
    // Aceptar tanto 'confirm'/'reject' como 'aprobar'/'rechazar'
    const rawAction: string = body.action;
    const action = rawAction === 'confirm' ? 'aprobar' : rawAction === 'reject' ? 'rechazar' : rawAction;
    const rejectionReason: string | null = body.rejection_reason ?? body.rejectionReason ?? null;
    console.log(`[PAYMENT_CONFIRM_API] Action(normalized): ${action}, Reason: ${rejectionReason}`);

    // 1. Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[PAYMENT_CONFIRM_API] Auth error: Unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log(`[PAYMENT_CONFIRM_API] Authenticated user: ${user.email}`);


    // 2. Get user data to check role
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("auth_id", user.id)
      .single();

    if (userError || !userData) {
      console.error("[PAYMENT_CONFIRM_API] User not found in users table.");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.log(`[PAYMENT_CONFIRM_API] User role: ${userData.role}`);

    // 3. Create service role client to bypass RLS
    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 4. Fetch payment with loan and client information using service client
    console.log(`[PAYMENT_CONFIRM_API] Attempting to fetch payment with ID: ${id} using service role client.`);
    const { data: payment, error: paymentError } = await serviceSupabase
      .from("payments")
      .select(
        `
        *,
        loan:loans (
          status,
          client:clients (
            email,
            advisor:users!advisor_id(email)
          )
        )
      `
      )
      .eq("id", id)
      .single();

    if (paymentError || !payment) {
      console.error(`[PAYMENT_CONFIRM_API] Fetch failed for ID ${id}. Error:`, paymentError);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // 5. Role-based access control
    if (userData.role === "asesor") {
      const clientAdvisorEmail = payment.loan?.client?.advisor?.email;
      if (clientAdvisorEmail !== userData.email) {
        return NextResponse.json(
          { error: "You can only confirm payments for your assigned clients" },
          { status: 403 }
        );
      }
    }

    if (payment.loan?.status !== "active") {
      return NextResponse.json({ error: "Loan is not active" }, { status: 409 })
    }
    // Admin can confirm any payment

    // 6. Check payment status
    if (payment.confirmation_status === "aprobado") {
      return NextResponse.json(
        { error: "Payment is already aprobado" },
        { status: 400 }
      );
    }

    if (payment.confirmation_status === "rechazado") {
      return NextResponse.json(
        { error: "Payment is already rechazado" },
        { status: 400 }
      );
    }

    // 7. Prepare update data
    const updateData: any = {
      confirmation_status: action === "aprobar" ? "aprobado" : "rechazado",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    };

    if (action === "rechazar") {
      updateData.rejection_reason = rejectionReason;
      // Permitir que el cliente vuelva a editar después de un rechazo
      updateData.has_been_edited = false;
    } else {
      updateData.rejection_reason = null;
    }

    // 8. Update the payment using service client
    const { data: updatedPayment, error: updateError } = await serviceSupabase
      .from("payments")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating payment:", updateError);
      return NextResponse.json(
        { error: "Failed to update payment" },
        { status: 500 }
      );
    }

    // 9. Update the payment schedule status
    if (action === "aprobar") {
      const { data: scheduleData, error: scheduleError } =
        await serviceSupabase
          .from("payment_schedule")
          .select("amount, paid_amount, mora, admin_fees")
          .eq("id", payment.schedule_id)
          .single();

      if (!scheduleError && scheduleData) {
        const currentPaidAmount = Number(scheduleData.paid_amount) || 0;
        const paymentAmount = Number(payment.amount);
        const totalPaidAmount = currentPaidAmount + paymentAmount;
        const scheduledAmount =
          Number(scheduleData.amount) +
          (Number(scheduleData.mora) || 0) +
          (Number(scheduleData.admin_fees) || 0);

        let scheduleStatus = "pending";
        if (totalPaidAmount >= scheduledAmount) {
          scheduleStatus = "paid";
        } else if (totalPaidAmount > 0) {
          scheduleStatus = "partially_paid";
        }

        await serviceSupabase
          .from("payment_schedule")
          .update({
            status: scheduleStatus,
            paid_amount: totalPaidAmount,
          })
          .eq("id", payment.schedule_id);

        // After approving and updating the schedule, if all schedules of the loan are paid, mark loan as paid
        const { data: schedules } = await serviceSupabase
          .from('payment_schedule')
          .select('status')
          .eq('loan_id', updatedPayment.loan_id)
        const allPaid = (schedules || []).length > 0 && (schedules || []).every((s: any) => String(s.status).toLowerCase() === 'paid')
        if (allPaid) {
          await serviceSupabase
            .from('loans')
            .update({ status: 'paid' })
            .eq('id', updatedPayment.loan_id)
        }
      }
    } else if (action === "rechazar") {
      await serviceSupabase
        .from("payment_schedule")
        .update({
          status: "rejected",
        })
        .eq("id", payment.schedule_id);
    }

    // 10. Transform and return response
    const transformedPayment = {
      id: updatedPayment.id,
      loanId: updatedPayment.loan_id,
      scheduleId: updatedPayment.schedule_id,
      amount: Number(updatedPayment.amount),
      paymentDate: updatedPayment.payment_date,
      receiptNumber: updatedPayment.receipt_number,
      paymentMethod: updatedPayment.payment_method,
      notes: updatedPayment.notes,
      confirmationStatus: updatedPayment.confirmation_status,
      receiptImageUrl: updatedPayment.receipt_image_url,
      confirmedBy: updatedPayment.confirmed_by,
      confirmedAt: updatedPayment.confirmed_at,
      rejectionReason: updatedPayment.rejection_reason,
      createdAt: updatedPayment.created_at,
    };

    // 11. Send notification to client (SMS/WhatsApp) based on settings
    let notificationError: string | null = null;
    try {
      const client = payment.loan?.client
      const clientId = client?.id
      const phone = client?.phone || ''
      const settings = await getSystemSettings()

      // Fetch per-client notification settings
      const { data: settingsRows } = await serviceSupabase
        .from('notifications_settings')
        .select('*')
        .eq('client_id', clientId)
        .limit(1)
      const ns = Array.isArray(settingsRows) ? settingsRows[0] : null

      const channels: ('sms'|'whatsapp')[] = []
      const pref = ns?.preferred_channel || 'both'
      const smsOk = ns?.sms_opt_in !== false
      const waOk = ns?.whatsapp_opt_in !== false
      if ((pref === 'both' || pref === 'sms') && smsOk) channels.push('sms')
      if ((pref === 'both' || pref === 'whatsapp') && waOk) channels.push('whatsapp')

      if (channels.length && phone) {
        const tkey = action === 'aprobar' ? 'payment_confirmed' : 'payment_rejected'
        const vars = {
          cliente_nombre: `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
          monto_pagado: new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(updatedPayment.amount) || 0),
          fecha_pago: transformedPayment.paymentDate || new Date().toLocaleDateString('es-GT'),
          numero_recibo: transformedPayment.receiptNumber || '-',
          motivo_rechazo: transformedPayment.rejectionReason || '-',
          instrucciones_pago: settings.payment_instructions,
          soporte_contacto: settings.support_contact,
        } as Record<string, string>

        const smsTpl = await getTemplate(tkey, 'sms')
        const waTpl = await getTemplate(tkey, 'whatsapp')
        const smsText = renderTemplate(smsTpl, vars)
        const waText = renderTemplate(waTpl, vars)

        const textByChannel: Record<'sms'|'whatsapp', string> = { sms: smsText, whatsapp: waText }
        const countryCode = (client?.phone_country_code as string) || settings.default_country_code
        let sendRes = await sendMessage(channels, phone, channels.length === 1 ? textByChannel[channels[0]] : smsText, countryCode)

        const envTemplateNameKey = `WHATSAPP_TEMPLATE_${tkey}`
        const autoTemplateName = (process.env as any)[envTemplateNameKey]
        if (channels.includes('whatsapp') && autoTemplateName) {
          const tname = String(autoTemplateName || process.env.WHATSAPP_DEFAULT_TEMPLATE || 'hello_world')
          const tlang = String(process.env.WHATSAPP_DEFAULT_TEMPLATE_LANG || 'es')
          const varNamesRow: any = await getTemplateRow(tkey as any, 'whatsapp')
          const varNames: string[] = Array.isArray(varNamesRow?.variables) ? varNamesRow.variables : []
          const headerEndIndex = varNames.indexOf('HEADER_END')
          let components: any[] = []
          if (headerEndIndex !== -1) {
            const headerVarNames = varNames.slice(0, headerEndIndex)
            const bodyVarNames = varNames.slice(headerEndIndex + 1)
            if (headerVarNames.length) components.push({ type: 'header', parameters: headerVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) })
            if (bodyVarNames.length) components.push({ type: 'body', parameters: bodyVarNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) })
          } else if (varNames.length) {
            components = [{ type: 'body', parameters: varNames.map(vn => ({ type: 'text', text: String((vars as any)[vn] ?? '') })) }]
          }
          try { console.log('PAYMENT_CONFIRM_WA_COMPONENTS', { tkey, components }) } catch {}
          const waRes = await sendWhatsAppTemplate(phone, tname, tlang, components, countryCode)
          sendRes = { ...sendRes, whatsapp: waRes }
        }

        // Log result
        for (const ch of channels) {
          const r = (sendRes as any)[ch]
          await serviceSupabase.from('notifications_log').insert({
            client_id: clientId,
            loan_id: payment.loan?.id,
            schedule_id: payment.schedule_id,
            channel: ch,
            stage: tkey,
            message_template: tkey,
            payload_json: { vars, textByChannel, provider: r?.provider },
            status: r?.ok ? 'sent' : (r?.provider?.includes('dry-run') ? 'ignored' : 'failed'),
            error_code: r?.errorCode || null,
            attempts: 1,
            sent_at: r?.ok ? new Date().toISOString() : null,
          })
        }
      }
    } catch (e) {
      // Non-blocking: do not fail the confirmation if messaging fails
      console.error('Notification sending error:', e)
      notificationError = e instanceof Error ? e.message : 'Failed to send notification.';
    }

    try {
      const clientEmail: string | null = payment?.loan?.client?.email || null
      const advisorEmail: string | null = payment?.loan?.client?.advisor?.email || null
      const fmt = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
      const amountText = fmt.format(Number(updatedPayment.amount) || 0)
      const actionUrl = `/dashboard/loans/${updatedPayment.loan_id}`

      const rows: any[] = []
      if (clientEmail) {
        rows.push({
          recipient_email: clientEmail,
          recipient_role: 'cliente',
          title: action === 'aprobar' ? 'Pago aprobado' : 'Pago rechazado',
          body: action === 'aprobar'
            ? `Tu pago de ${amountText} fue aprobado. Recibo ${updatedPayment.receipt_number || '-'}.`
            : `Tu pago de ${amountText} fue rechazado. Motivo: ${updatedPayment.rejection_reason || '-'}.`,
          type: action === 'aprobar' ? 'payment_confirmed' : 'payment_rejected',
          status: 'unread',
          related_entity_type: 'payment',
          related_entity_id: updatedPayment.id,
          action_url: actionUrl,
          meta_json: { loan_id: updatedPayment.loan_id, schedule_id: updatedPayment.schedule_id },
        })
      }

      if (userData.role === 'asesor') {
        rows.push({
          recipient_role: 'admin',
          recipient_email: null,
          title: action === 'aprobar' ? 'Asesor aprobó un pago' : 'Asesor rechazó un pago',
          body: `El asesor ${userData.email} ${action === 'aprobar' ? 'aprobó' : 'rechazó'} el pago ${updatedPayment.receipt_number || '-'} (${amountText}).`,
          type: action === 'aprobar' ? 'advisor_payment_approved' : 'advisor_payment_rejected',
          status: 'unread',
          related_entity_type: 'payment',
          related_entity_id: updatedPayment.id,
          action_url: actionUrl,
          meta_json: { loan_id: updatedPayment.loan_id, schedule_id: updatedPayment.schedule_id },
        })
      }

      if (rows.length) {
        await serviceSupabase.from('notifications').insert(rows)
      }
    } catch (e) {
      console.error('[IN-APP NOTIFS] Failed to insert notifications:', e)
    }

    return NextResponse.json({
      message: `Payment ${action === "aprobar" ? "aprobado" : "rechazado"} successfully`,
      payment: transformedPayment,
      notificationError,
    });
  } catch (error) {
    console.error("Error updating payment confirmation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
