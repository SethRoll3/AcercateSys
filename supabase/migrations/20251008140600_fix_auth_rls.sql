-- Drop existing policy
DROP POLICY IF EXISTS "users_select_own" ON users;

-- Recreate policy to allow auth admin access
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id OR (get_my_claim('user_role') = to_jsonb('supabase_auth_admin'::text)));