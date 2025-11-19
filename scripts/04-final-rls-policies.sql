-- =================================================================
-- |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
-- |||                                                           |||
-- |||      FINAL, COMPLETE, AND CORRECTED RLS POLICIES          |||
-- |||                                                           |||
-- |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
-- =================================================================
-- This script replaces all previous RLS policies for loans,
-- payment_schedule, and payments with a correct and unified set.
-- RUN THIS SCRIPT ALONE. It handles dropping old policies.

-- First, drop all potentially existing policies on these tables to ensure a clean slate.
DROP POLICY IF EXISTS "loans_select_own" ON public.loans;
DROP POLICY IF EXISTS "loans_select_admin" ON public.loans;
DROP POLICY IF EXISTS "loans_insert_admin" ON public.loans;
DROP POLICY IF EXISTS "loans_update_admin" ON public.loans;
DROP POLICY IF EXISTS "loans_delete_admin" ON public.loans;
DROP POLICY IF EXISTS "Allow ALL access for ADMINS on loans" ON public.loans;
DROP POLICY IF EXISTS "Allow SELECT for CLIENTS on their own loans" ON public.loans;
DROP POLICY IF EXISTS "Allow SELECT for ADVISORS on their clients loans" ON public.loans;


DROP POLICY IF EXISTS "payment_schedule_select_own" ON public.payment_schedule;
DROP POLICY IF EXISTS "payment_schedule_select_admin" ON public.payment_schedule;
DROP POLICY IF EXISTS "payment_schedule_insert_admin" ON public.payment_schedule;
DROP POLICY IF EXISTS "payment_schedule_update_admin" ON public.payment_schedule;
DROP POLICY IF EXISTS "Allow ALL access for ADMINS on payment_schedule" ON public.payment_schedule;
DROP POLICY IF EXISTS "Allow SELECT for CLIENTS on their own payment_schedules" ON public.payment_schedule;
DROP POLICY IF EXISTS "Allow SELECT for ADVISORS on their clients payment_schedules" ON public.payment_schedule;


DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_own" ON public.payments;
DROP POLICY IF EXISTS "payments_select_admin" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_admin" ON public.payments;
DROP POLICY IF EXISTS "payments_update_admin" ON public.payments;
DROP POLICY IF EXISTS "Allow ALL access for ADMINS on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow SELECT/INSERT for CLIENTS on their own payments" ON public.payments;
DROP POLICY IF EXISTS "Allow SELECT for ADVISORS on their clients payments" ON public.payments;


-- Enable RLS on tables if not already enabled
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Helper sub-query to get the client_id of the currently logged-in user.
-- (SELECT id FROM public.clients WHERE email = (SELECT email FROM public.users WHERE auth_id = auth.uid()))

-- Helper sub-query to get the user_id of the currently logged-in advisor.
-- (SELECT id FROM public.users WHERE auth_id = auth.uid())

-- =================================================================
-- LOANS TABLE POLICIES
-- =================================================================

CREATE POLICY "Allow ALL access for ADMINS on loans" ON public.loans
  FOR ALL USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'admin')))
  WITH CHECK ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'admin')));

CREATE POLICY "Allow SELECT for CLIENTS on their own loans" ON public.loans
  FOR SELECT USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'cliente'))
    AND client_id = (SELECT id FROM public.clients WHERE email = (SELECT email FROM public.users WHERE auth_id = auth.uid()))
  );

CREATE POLICY "Allow SELECT for ADVISORS on their clients loans" ON public.loans
  FOR SELECT USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'asesor'))
    AND client_id IN (SELECT id FROM public.clients WHERE advisor_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  );

-- =================================================================
-- PAYMENT_SCHEDULE TABLE POLICIES
-- =================================================================

CREATE POLICY "Allow ALL access for ADMINS on payment_schedule" ON public.payment_schedule
  FOR ALL USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'admin')))
  WITH CHECK ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'admin')));

CREATE POLICY "Allow SELECT for CLIENTS on their own payment_schedules" ON public.payment_schedule
  FOR SELECT USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'cliente'))
    AND EXISTS (SELECT 1 FROM public.loans WHERE loans.id = payment_schedule.loan_id AND loans.client_id = (SELECT id FROM public.clients WHERE email = (SELECT email FROM public.users WHERE auth_id = auth.uid())))
  );

CREATE POLICY "Allow SELECT for ADVISORS on their clients payment_schedules" ON public.payment_schedule
  FOR SELECT USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'asesor'))
    AND EXISTS (SELECT 1 FROM public.loans WHERE loans.id = payment_schedule.loan_id AND loans.client_id IN (SELECT id FROM public.clients WHERE advisor_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())))
  );

-- =================================================================
-- PAYMENTS TABLE POLICIES
-- =================================================================

CREATE POLICY "Allow ALL access for ADMINS on payments" ON public.payments
  FOR ALL USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'admin')))
  WITH CHECK ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'admin')));

CREATE POLICY "Allow SELECT/INSERT for CLIENTS on their own payments" ON public.payments
  FOR ALL USING (
    (EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'cliente')) AND
    (loan_id IN (SELECT id FROM public.loans WHERE client_id = (SELECT id FROM public.clients WHERE email = (SELECT email FROM public.users WHERE auth_id = auth.uid()))))
  )
  WITH CHECK (
    (EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'cliente')) AND
    (loan_id IN (SELECT id FROM public.loans WHERE client_id = (SELECT id FROM public.clients WHERE email = (SELECT email FROM public.users WHERE auth_id = auth.uid()))))
  );

CREATE POLICY "Allow SELECT for ADVISORS on their clients payments" ON public.payments
  FOR SELECT USING ((EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'asesor'))
    AND EXISTS (SELECT 1 FROM public.loans WHERE loans.id = payments.loan_id AND loans.client_id IN (SELECT id FROM public.clients WHERE advisor_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())))
  );