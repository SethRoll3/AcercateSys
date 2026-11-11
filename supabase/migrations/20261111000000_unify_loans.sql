-- Consolidate outstanding contractual balances without capitalizing overdue fees.
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE public.loans ADD CONSTRAINT loans_status_check
  CHECK (status IN ('active', 'paid', 'defaulted', 'pending', 'cancelled', 'unified'));

CREATE TABLE IF NOT EXISTS public.loan_unifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_loan_id uuid NOT NULL UNIQUE REFERENCES public.loans(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  actor_user_id uuid NOT NULL REFERENCES public.users(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  excluded_mora numeric(12,2) NOT NULL DEFAULT 0 CHECK (excluded_mora >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loan_unification_sources (
  source_loan_id uuid PRIMARY KEY REFERENCES public.loans(id),
  unification_id uuid NOT NULL REFERENCES public.loan_unifications(id),
  balance_without_mora numeric(12,2) NOT NULL CHECK (balance_without_mora >= 0),
  excluded_mora numeric(12,2) NOT NULL CHECK (excluded_mora >= 0)
);
CREATE INDEX IF NOT EXISTS loan_unification_sources_unification_idx
  ON public.loan_unification_sources(unification_id);
ALTER TABLE public.loan_unifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_unification_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loan_unifications, public.loan_unification_sources FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.unify_client_loans(
  p_actor_auth_id uuid,
  p_source_ids uuid[],
  p_term integer DEFAULT NULL,
  p_frequency text DEFAULT NULL,
  p_interest_rate numeric DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_preview boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_loan public.loans%ROWTYPE;
  v_client_id uuid;
  v_count integer := 0;
  v_balance numeric(12,2);
  v_mora numeric(12,2);
  v_total numeric(12,2) := 0;
  v_excluded_mora numeric(12,2) := 0;
  v_sources jsonb := '[]'::jsonb;
  v_new_id uuid;
  v_unification_id uuid;
  v_number text;
  v_due date;
  v_principal numeric(12,2);
  v_interest numeric(12,2);
  v_monthly_payment numeric(12,2);
  v_end_date date;
  i integer;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE auth_id = p_actor_auth_id;
  IF NOT FOUND OR v_actor.role NOT IN ('admin', 'asesor') THEN
    RAISE EXCEPTION 'No autorizado para unificar préstamos';
  END IF;
  IF p_source_ids IS NULL OR cardinality(p_source_ids) < 2
    OR cardinality(p_source_ids) > 20
    OR (SELECT count(DISTINCT id) FROM unnest(p_source_ids) AS id) <> cardinality(p_source_ids) THEN
    RAISE EXCEPTION 'Seleccione entre 2 y 20 préstamos distintos';
  END IF;

  -- Lock source loans before reading schedules; payment review also locks its loan.
  FOR v_loan IN SELECT * FROM public.loans WHERE id = ANY(p_source_ids)
    ORDER BY id FOR UPDATE
  LOOP
    v_count := v_count + 1;
    IF v_loan.status NOT IN ('active', 'defaulted') THEN
      RAISE EXCEPTION 'El préstamo % ya no está activo o en mora', v_loan.loan_number;
    END IF;
    IF v_client_id IS NULL THEN v_client_id := v_loan.client_id; END IF;
    IF v_client_id IS DISTINCT FROM v_loan.client_id THEN
      RAISE EXCEPTION 'Los préstamos deben pertenecer al mismo cliente';
    END IF;
    IF v_actor.role = 'asesor' AND NOT EXISTS (
      SELECT 1 FROM public.clients WHERE id = v_loan.client_id AND advisor_id = v_actor.id
    ) THEN
      RAISE EXCEPTION 'El cliente no pertenece al asesor';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payments WHERE loan_id = v_loan.id
      AND confirmation_status::text IN ('pendiente', 'pending_confirmation')) THEN
      RAISE EXCEPTION 'El préstamo % tiene pagos pendientes de revisión', v_loan.loan_number;
    END IF;
    IF EXISTS (SELECT 1 FROM public.loan_unification_sources WHERE source_loan_id = v_loan.id) THEN
      RAISE EXCEPTION 'El préstamo % ya fue unificado', v_loan.loan_number;
    END IF;
    -- Existing payment accounting applies waivers and payments to mora first.
    SELECT coalesce(sum(greatest(0,
        coalesce(principal,0) + coalesce(interest,0) + coalesce(admin_fees,0)
        - greatest(0, coalesce(waived_amount,0) - coalesce(mora,0))
        - greatest(0, coalesce(paid_amount,0) - greatest(0, coalesce(mora,0) - coalesce(waived_amount,0))))),0),
      coalesce(sum(greatest(0, coalesce(mora,0) - coalesce(waived_amount,0) - coalesce(paid_amount,0))),0)
      INTO v_balance, v_mora
      FROM public.payment_schedule WHERE loan_id = v_loan.id;
    v_balance := round(v_balance, 2);
    v_mora := round(v_mora, 2);
    IF v_balance <= 0 THEN
      RAISE EXCEPTION 'El préstamo % no tiene saldo pendiente sin mora', v_loan.loan_number;
    END IF;
    v_total := v_total + v_balance;
    v_excluded_mora := v_excluded_mora + v_mora;
    v_sources := v_sources || jsonb_build_array(jsonb_build_object(
      'id', v_loan.id, 'loanNumber', v_loan.loan_number,
      'balance', v_balance, 'excludedMora', v_mora));
  END LOOP;
  IF v_count <> cardinality(p_source_ids) THEN
    RAISE EXCEPTION 'Uno o más préstamos no existen';
  END IF;
  IF p_preview THEN
    RETURN jsonb_build_object('clientId', v_client_id, 'amount', v_total,
      'excludedMora', v_excluded_mora, 'sources', v_sources);
  END IF;
  IF p_term IS NULL OR p_term < 1 OR p_term > 120 OR
     p_frequency NOT IN ('mensual', 'quincenal') OR
     p_interest_rate IS NULL OR p_interest_rate < 0 OR p_interest_rate > 100 OR
     p_start_date IS NULL OR p_start_date < (now() AT TIME ZONE 'America/Guatemala')::date THEN
    RAISE EXCEPTION 'Plazo, frecuencia, tasa o fecha inválidos';
  END IF;

  v_new_id := gen_random_uuid();
  v_number := 'UNI-' || upper(substr(replace(v_new_id::text, '-', ''), 1, 12));
  v_interest := round(v_total * p_interest_rate / 100 / CASE WHEN p_frequency = 'quincenal' THEN 2 ELSE 1 END, 2);
  v_monthly_payment := trunc(v_total / p_term, 2) + v_interest + 20;
  v_end_date := CASE WHEN p_frequency = 'quincenal' THEN p_start_date + (p_term * 15)
    ELSE (p_start_date + make_interval(months => p_term))::date END;
  INSERT INTO public.loans (id, client_id, loan_number, amount, interest_rate, term_months,
    monthly_payment, status, start_date, end_date, payment_frequency)
  VALUES (v_new_id, v_client_id, v_number, v_total, p_interest_rate, p_term,
    v_monthly_payment, 'pending', p_start_date, v_end_date, p_frequency);

  FOR i IN 1..p_term LOOP
    v_due := CASE WHEN p_frequency = 'quincenal' THEN p_start_date + (i * 15)
      ELSE (p_start_date + make_interval(months => i))::date END;
    v_principal := CASE WHEN i = p_term THEN v_total - trunc(v_total / p_term, 2) * (p_term - 1)
      ELSE trunc(v_total / p_term, 2) END;
    INSERT INTO public.payment_schedule (loan_id, payment_number, due_date, amount,
      principal, interest, admin_fees, status)
    VALUES (v_new_id, i, v_due, v_principal + v_interest + 20,
      v_principal, v_interest, 20, 'pending');
  END LOOP;

  INSERT INTO public.loan_unifications (new_loan_id, client_id, actor_user_id, amount, excluded_mora)
    VALUES (v_new_id, v_client_id, v_actor.id, v_total, v_excluded_mora) RETURNING id INTO v_unification_id;
  INSERT INTO public.loan_unification_sources (source_loan_id, unification_id, balance_without_mora, excluded_mora)
    SELECT (item->>'id')::uuid, v_unification_id, (item->>'balance')::numeric,
      (item->>'excludedMora')::numeric FROM jsonb_array_elements(v_sources) AS item;
  UPDATE public.loans SET status = 'unified', updated_at = now() WHERE id = ANY(p_source_ids);

  INSERT INTO public.logs (actor_user_id, action_type, entity_name, entity_id, action_at, details)
  VALUES (v_actor.id, 'CREATE', 'loan_unifications', v_unification_id::text, now(),
    jsonb_build_object('message', 'Préstamos unificados', 'actor_name', v_actor.full_name,
      'actor_email', v_actor.email, 'new_loan_id', v_new_id, 'new_loan_number', v_number,
      'client_id', v_client_id, 'amount_without_mora', v_total,
      'excluded_mora', v_excluded_mora, 'sources', v_sources));
  RETURN jsonb_build_object('id', v_new_id, 'loanNumber', v_number,
    'amount', v_total, 'excludedMora', v_excluded_mora,
    'clientId', v_client_id, 'sources', v_sources);
END;
$$;
REVOKE ALL ON FUNCTION public.unify_client_loans(uuid, uuid[], integer, text, numeric, date, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unify_client_loans(uuid, uuid[], integer, text, numeric, date, boolean) TO service_role;
