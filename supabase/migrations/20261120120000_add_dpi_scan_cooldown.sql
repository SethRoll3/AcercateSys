-- Global DPI scan cooldown. The free vision service can read roughly one
-- document per minute, so the slot is shared by every advisor.
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS last_dpi_scan_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_dpi_scan_slot(p_cooldown_seconds integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.system_settings%ROWTYPE;
  v_remaining integer;
BEGIN
  -- Serialize concurrent scans across all server instances.
  PERFORM pg_advisory_xact_lock(918273645);

  SELECT * INTO v_row
  FROM public.system_settings
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.system_settings (last_dpi_scan_at)
    VALUES (now())
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
      'allowed', true,
      'retryAfter', 0,
      'lastScanAt', v_row.last_dpi_scan_at
    );
  END IF;

  IF v_row.last_dpi_scan_at IS NULL THEN
    UPDATE public.system_settings
    SET last_dpi_scan_at = now(), updated_at = now()
    WHERE id = v_row.id;

    RETURN jsonb_build_object(
      'allowed', true,
      'retryAfter', 0,
      'lastScanAt', now()
    );
  END IF;

  v_remaining := p_cooldown_seconds - FLOOR(EXTRACT(EPOCH FROM (now() - v_row.last_dpi_scan_at)))::integer;

  IF v_remaining <= 0 THEN
    UPDATE public.system_settings
    SET last_dpi_scan_at = now(), updated_at = now()
    WHERE id = v_row.id;

    RETURN jsonb_build_object(
      'allowed', true,
      'retryAfter', 0,
      'lastScanAt', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'retryAfter', GREATEST(1, v_remaining),
    'lastScanAt', v_row.last_dpi_scan_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dpi_scan_slot(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dpi_scan_slot(integer) TO service_role;
