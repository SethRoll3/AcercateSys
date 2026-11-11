-- Keep the reviewed amount and excluded mora stable through the final transaction.
CREATE OR REPLACE FUNCTION public.unify_client_loans_confirmed(
  p_actor_auth_id uuid,
  p_source_ids uuid[],
  p_term integer,
  p_frequency text,
  p_interest_rate numeric,
  p_start_date date,
  p_expected_amount numeric,
  p_expected_excluded_mora numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_quote jsonb;
BEGIN
  IF p_expected_amount IS NULL OR p_expected_excluded_mora IS NULL THEN
    RAISE EXCEPTION 'Calcule el saldo antes de confirmar';
  END IF;
  PERFORM 1 FROM public.loans WHERE id = ANY(p_source_ids) ORDER BY id FOR UPDATE;
  v_quote := public.unify_client_loans(p_actor_auth_id, p_source_ids,
    p_term, p_frequency, p_interest_rate, p_start_date, true);
  IF (v_quote->>'amount')::numeric <> p_expected_amount OR
     (v_quote->>'excludedMora')::numeric <> p_expected_excluded_mora THEN
    RAISE EXCEPTION 'El saldo o la mora cambiaron. Vuelva a calcular antes de confirmar';
  END IF;
  RETURN public.unify_client_loans(p_actor_auth_id, p_source_ids,
    p_term, p_frequency, p_interest_rate, p_start_date, false);
END;
$$;
REVOKE ALL ON FUNCTION public.unify_client_loans_confirmed(uuid, uuid[], integer, text, numeric, date, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unify_client_loans_confirmed(uuid, uuid[], integer, text, numeric, date, numeric, numeric)
  TO service_role;
