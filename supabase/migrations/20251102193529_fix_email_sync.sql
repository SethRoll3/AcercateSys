-- Migration: Fix email synchronization
-- Created: 2025-11-02T19:35:29.456Z


-- Function to handle new user registration
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

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Function to sync email changes from auth.users to public.users
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

-- Trigger for email updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_email();

-- Function to sync email changes from public.users to clients
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

-- Trigger for public.users email updates
DROP TRIGGER IF EXISTS on_public_user_email_updated ON public.users;
CREATE TRIGGER on_public_user_email_updated
  AFTER UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_email();
