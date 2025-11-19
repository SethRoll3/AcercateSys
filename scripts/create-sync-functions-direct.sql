-- Email Synchronization Functions and Triggers
-- Execute this script in Supabase SQL Editor

-- 1. Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into public.users table when a new user is created in auth.users
  INSERT INTO public.users (id, auth_id, email, full_name, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cliente'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    auth_id = EXCLUDED.auth_id,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Function to sync email changes from auth.users to public.users
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS trigger AS $$
BEGIN
  -- Update email in public.users when changed in auth.users
  UPDATE public.users 
  SET 
    email = NEW.email,
    updated_at = NOW()
  WHERE auth_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger for email updates in auth.users
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_email();

-- 5. Function to sync email changes from public.users to clients
CREATE OR REPLACE FUNCTION public.sync_client_email()
RETURNS trigger AS $$
BEGIN
  -- Update email in clients table when changed in public.users (for clients only)
  IF NEW.role = 'cliente' THEN
    UPDATE clients 
    SET 
      email = NEW.email,
      updated_at = NOW()
    WHERE email = OLD.email OR id IN (
      SELECT id FROM clients WHERE first_name || ' ' || last_name = NEW.full_name
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger for public.users email updates
DROP TRIGGER IF EXISTS on_public_user_email_updated ON public.users;
CREATE TRIGGER on_public_user_email_updated
  AFTER UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_email();

-- 7. Manual sync function for existing data
CREATE OR REPLACE FUNCTION public.manual_sync_all_emails()
RETURNS void AS $$
DECLARE
  auth_user RECORD;
  public_user RECORD;
BEGIN
  -- Sync from auth.users to public.users
  FOR auth_user IN SELECT id, email FROM auth.users LOOP
    UPDATE public.users 
    SET 
      email = auth_user.email,
      auth_id = auth_user.id,
      updated_at = NOW()
    WHERE id = auth_user.id;
    
    -- If no match by id, try to match by similar email
    IF NOT FOUND THEN
      UPDATE public.users 
      SET 
        email = auth_user.email,
        auth_id = auth_user.id,
        updated_at = NOW()
      WHERE email SIMILAR TO '%' || split_part(auth_user.email, '@', 1) || '%'
        AND auth_id IS NULL;
    END IF;
  END LOOP;
  
  -- Sync from public.users to clients (for role = 'cliente')
  FOR public_user IN SELECT id, email, full_name FROM public.users WHERE role = 'cliente' LOOP
    UPDATE clients 
    SET 
      email = public_user.email,
      updated_at = NOW()
    WHERE first_name || ' ' || last_name = public_user.full_name
       OR email = public_user.email;
  END LOOP;
  
  RAISE NOTICE 'Email synchronization completed successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the functions (optional)
-- SELECT public.manual_sync_all_emails();

-- Verify functions were created
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('handle_new_user', 'sync_user_email', 'sync_client_email', 'manual_sync_all_emails');

-- Verify triggers were created
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers 
WHERE trigger_name IN ('on_auth_user_created', 'on_auth_user_updated', 'on_public_user_email_updated');