-- Serialize new payment submissions with loan unification.
CREATE OR REPLACE FUNCTION public.prevent_payment_on_unified_loan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.loans WHERE id = NEW.loan_id FOR UPDATE;
  IF v_status = 'unified' THEN
    RAISE EXCEPTION 'No se permiten pagos en un préstamo unificado';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_payment_on_unified_loan ON public.payments;
CREATE TRIGGER prevent_payment_on_unified_loan
  BEFORE INSERT ON public.payments FOR EACH ROW
  EXECUTE FUNCTION public.prevent_payment_on_unified_loan();
