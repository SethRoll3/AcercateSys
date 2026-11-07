-- Review a payment and update its schedules in one database transaction.
-- paid_amount is incremented, never rebuilt from payments.
CREATE TABLE IF NOT EXISTS public.payment_abono_metadata (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
  waiver_type text NOT NULL CHECK (waiver_type IN
    ('full', 'capital_only', 'no_mora', 'capital_interest_only', 'no_admin_fees'))
);
ALTER TABLE public.payment_abono_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_abono_metadata FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.payment_abono_metadata TO service_role;

CREATE OR REPLACE FUNCTION public.review_payment_atomically(
  p_payment_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_rejection_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_schedule public.payment_schedule%ROWTYPE;
  v_target_ids uuid[];
  v_last_target_id uuid;
  v_json jsonb;
  v_balance numeric(12,2);
  v_due numeric(12,2);
  v_applied numeric(12,2);
  v_left numeric(12,2);
  v_all_paid boolean;
  v_loan_finalized boolean := false;
  v_waiver numeric(12,2);
  v_abono_type text;
BEGIN
  IF p_action NOT IN ('aprobar', 'rechazar') THEN
    RAISE EXCEPTION 'Acción de revisión no válida';
  END IF;

  SELECT * INTO v_payment FROM public.payments
    WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_payment.confirmation_status::text NOT IN ('pendiente', 'pending_confirmation') THEN
    RAISE EXCEPTION 'El pago ya fue revisado';
  END IF;

  PERFORM 1 FROM public.loans WHERE id = v_payment.loan_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no está activo';
  END IF;

  v_target_ids := ARRAY[v_payment.schedule_id];
  IF left(coalesce(v_payment.notes, ''), 14) = '[FULL_PAYMENT]' THEN
    v_json := substring(v_payment.notes from '\{[^}]*\}')::jsonb;
    IF jsonb_typeof(v_json->'scheduleIds') <> 'array' THEN
      RAISE EXCEPTION 'Las cuotas del pago completo no son válidas';
    END IF;
    SELECT array_agg(DISTINCT item::uuid) INTO v_target_ids
    FROM jsonb_array_elements_text(v_json->'scheduleIds') AS item;
    IF v_target_ids IS NULL OR NOT v_payment.schedule_id = ANY(v_target_ids) THEN
      RAISE EXCEPTION 'La cuota principal falta en el pago completo';
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.payment_schedule
      WHERE loan_id = v_payment.loan_id AND id = ANY(v_target_ids)) <> array_length(v_target_ids, 1) THEN
    RAISE EXCEPTION 'El pago incluye cuotas de otro préstamo o inexistentes';
  END IF;

  -- Lock in stable order so simultaneous reviews cannot overwrite each other.
  PERFORM 1 FROM public.payment_schedule
    WHERE loan_id = v_payment.loan_id AND id = ANY(v_target_ids)
    ORDER BY id FOR UPDATE;

  SELECT id INTO v_last_target_id FROM public.payment_schedule
    WHERE loan_id = v_payment.loan_id AND id = ANY(v_target_ids)
    ORDER BY payment_number DESC, id DESC LIMIT 1;

  IF p_action = 'aprobar' THEN
    v_left := round(v_payment.amount::numeric, 2);
    IF v_left <= 0 THEN RAISE EXCEPTION 'El monto del pago no es válido'; END IF;
    SELECT waiver_type INTO v_abono_type FROM public.payment_abono_metadata
      WHERE payment_id = p_payment_id;
    FOR v_schedule IN
      SELECT * FROM public.payment_schedule
      WHERE loan_id = v_payment.loan_id AND id = ANY(v_target_ids)
      ORDER BY payment_number, id
    LOOP
      -- Some schedule writers include fees in amount, others store them apart.
      v_due := CASE WHEN v_schedule.principal IS NOT NULL OR v_schedule.interest IS NOT NULL
        THEN coalesce(v_schedule.principal, 0) + coalesce(v_schedule.interest, 0)
        ELSE coalesce(v_schedule.amount, 0) END
        + coalesce(v_schedule.mora, 0) + coalesce(v_schedule.admin_fees, 0)
        - coalesce(v_schedule.waived_amount, 0);
      -- Abonos request a waiver only when the approved amount completes the
      -- reduced balance. Before review, no money or waiver is posted.
      v_waiver := CASE v_abono_type
        WHEN 'capital_only' THEN
          coalesce(v_schedule.interest, 0) + coalesce(v_schedule.mora, 0) + coalesce(v_schedule.admin_fees, 0)
        WHEN 'capital_interest_only' THEN
          coalesce(v_schedule.mora, 0) + coalesce(v_schedule.admin_fees, 0)
        WHEN 'no_mora' THEN coalesce(v_schedule.mora, 0)
        WHEN 'no_admin_fees' THEN coalesce(v_schedule.admin_fees, 0)
        ELSE 0 END;
      v_waiver := greatest(0, v_waiver - coalesce(v_schedule.waived_amount, 0));
      IF v_waiver > 0 AND coalesce(v_schedule.paid_amount, 0) + v_left >= v_due - v_waiver - 1 THEN
        UPDATE public.payment_schedule SET waived_amount = coalesce(waived_amount, 0) + v_waiver
          WHERE id = v_schedule.id;
        v_due := v_due - v_waiver;
      END IF;
      v_balance := greatest(0, round(v_due - coalesce(v_schedule.paid_amount, 0), 2));
      v_applied := least(v_left, v_balance);
      IF v_schedule.id = v_last_target_id AND v_left - v_applied <= 1 THEN
        v_applied := v_left;
      END IF;
      IF v_applied > 0 THEN
        IF coalesce(v_schedule.paid_amount, 0) + v_applied >= v_due - 1 THEN
          UPDATE public.payment_schedule SET
            paid_amount = round(coalesce(paid_amount, 0) + v_applied, 2), status = 'paid'
          WHERE id = v_schedule.id;
        ELSE
          UPDATE public.payment_schedule SET
            paid_amount = round(coalesce(paid_amount, 0) + v_applied, 2), status = 'pending'
          WHERE id = v_schedule.id;
        END IF;
        v_left := round(v_left - v_applied, 2);
      END IF;
    END LOOP;
    IF v_left > 0 THEN
      RAISE EXCEPTION 'El monto excede el saldo pendiente de las cuotas';
    END IF;
    UPDATE public.payments SET confirmation_status = 'aprobado',
      confirmed_by = p_reviewer_id, confirmed_at = now(), rejection_reason = NULL
      WHERE id = p_payment_id RETURNING * INTO v_payment;
  ELSE
    UPDATE public.payments SET confirmation_status = 'rechazado',
      confirmed_by = p_reviewer_id, confirmed_at = now(),
      rejection_reason = p_rejection_reason, has_been_edited = false
      WHERE id = p_payment_id RETURNING * INTO v_payment;
    FOR v_schedule IN
      SELECT * FROM public.payment_schedule
      WHERE loan_id = v_payment.loan_id AND id = ANY(v_target_ids)
    LOOP
      IF v_schedule.status = 'pending_confirmation' THEN
        v_due := CASE WHEN v_schedule.principal IS NOT NULL OR v_schedule.interest IS NOT NULL
          THEN coalesce(v_schedule.principal, 0) + coalesce(v_schedule.interest, 0)
          ELSE coalesce(v_schedule.amount, 0) END
          + coalesce(v_schedule.mora, 0) + coalesce(v_schedule.admin_fees, 0)
          - coalesce(v_schedule.waived_amount, 0);
        IF coalesce(v_schedule.paid_amount, 0) >= v_due - 1 THEN
          UPDATE public.payment_schedule SET status = 'paid' WHERE id = v_schedule.id;
        ELSE
          UPDATE public.payment_schedule SET status = 'rejected' WHERE id = v_schedule.id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF p_action = 'aprobar' THEN
    SELECT bool_and(status = 'paid') INTO v_all_paid
    FROM public.payment_schedule WHERE loan_id = v_payment.loan_id;
    IF coalesce(v_all_paid, false) THEN
      UPDATE public.loans SET status = 'paid' WHERE id = v_payment.loan_id;
      v_loan_finalized := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'loanFinalized', v_loan_finalized);
END;
$$;

REVOKE ALL ON FUNCTION public.review_payment_atomically(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_payment_atomically(uuid, uuid, text, text) TO service_role;
