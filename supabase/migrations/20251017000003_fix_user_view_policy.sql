-- Step 1: Create a helper function to safely get the current user's role
-- This function uses SECURITY DEFINER to bypass the caller's RLS policies, preventing infinite recursion.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Grant permission for any authenticated user to execute this function
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Step 2: Drop all existing (and potentially broken) policies on the users table for a clean slate.
DROP POLICY IF EXISTS "Users can view own data and admins can view all" ON public.users;
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can view own data, and admins/advisors can view all" ON public.users;
DROP POLICY IF EXISTS "EMERGENCY FIX - Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data and admins can update all" ON public.users;
DROP POLICY IF EXISTS "EMERGENCY FIX - Users can update their own data" ON public.users;

-- Step 3: Create the correct SELECT policy using the helper function.
-- This allows users to see their own data, and admins/advisors to see all users.
CREATE POLICY "Users can view own data, and admins/advisors can view all" ON public.users
    FOR SELECT USING (
        public.get_my_role() IN ('admin', 'asesor') OR
        auth.uid() = auth_id
    );

-- Step 4: Create the correct UPDATE policy.
-- This allows users to update their own data and admins to update any user.
CREATE POLICY "Users can update own data and admins can update all" ON public.users
    FOR UPDATE USING (
        public.get_my_role() = 'admin' OR
        auth.uid() = auth_id
    );