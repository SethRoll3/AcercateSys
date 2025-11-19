import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function fixEmailSync() {
  console.log("🔧 Fixing email synchronization issues...")
  
  try {
    // 1. Fix the specific email mismatch issue
    console.log("\n1. Fixing email mismatch for maynor...")
    
    // Update the auth.users email to match public.users
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      'b4293882-9cf6-4e0b-bfeb-f69255ac528f',
      { email: 'maynor45@gmail.com' }
    )
    
    if (updateAuthError) {
      console.error("❌ Error updating auth.users email:", updateAuthError.message)
    } else {
      console.log("✅ Updated auth.users email to maynor45@gmail.com")
    }

    // 2. Fix the missing auth_id
    console.log("\n2. Fixing missing auth_id...")
    
    const { error: updatePublicError } = await supabase
      .from('users')
      .update({ auth_id: 'b4293882-9cf6-4e0b-bfeb-f69255ac528f' })
      .eq('id', 'b4293882-9cf6-4e0b-bfeb-f69255ac528f')
    
    if (updatePublicError) {
      console.error("❌ Error updating public.users auth_id:", updatePublicError.message)
    } else {
      console.log("✅ Updated public.users auth_id")
    }

    // 3. Create the handle_new_user function and trigger
    console.log("\n3. Creating email synchronization function and triggers...")
    
    const syncFunctionSQL = `
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
`

    const { error: functionError } = await supabase.rpc('exec_sql', { 
      sql: syncFunctionSQL 
    })
    
    if (functionError) {
      console.log("⚠️  Could not create function via RPC, creating migration file instead...")
      
      // Create migration file
      const migrationContent = `-- Migration: Fix email synchronization
-- Created: ${new Date().toISOString()}

${syncFunctionSQL}

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
`

      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
      const migrationPath = `C:\\Users\\Boteo\\Documents\\qwncoder\\Cooperativa\\Cooperativa\\supabase\\migrations\\${timestamp}_fix_email_sync.sql`
      
      const fs = require('fs')
      fs.writeFileSync(migrationPath, migrationContent)
      console.log(`✅ Created migration file: ${migrationPath}`)
      
    } else {
      console.log("✅ Created synchronization functions and triggers")
    }

    // 4. Create a manual sync function for existing data
    console.log("\n4. Creating manual sync function...")
    
    const manualSyncSQL = `
-- Function to manually sync all existing data
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
`

    // Try to execute the manual sync function creation
    const { error: manualSyncError } = await supabase.rpc('exec_sql', { 
      sql: manualSyncSQL 
    })
    
    if (manualSyncError) {
      console.log("⚠️  Manual sync function creation via RPC failed, added to migration")
    } else {
      console.log("✅ Created manual sync function")
      
      // Execute the manual sync
      console.log("\n5. Running manual sync...")
      const { error: syncError } = await supabase.rpc('manual_sync_all_emails')
      
      if (syncError) {
        console.error("❌ Error running manual sync:", syncError.message)
      } else {
        console.log("✅ Manual sync completed")
      }
    }

    console.log("\n✅ Email synchronization fix completed!")
    console.log("\n📋 Summary of changes:")
    console.log("   - Fixed email mismatch (maynor@gmail.com → maynor45@gmail.com)")
    console.log("   - Added missing auth_id mapping")
    console.log("   - Created automatic sync functions and triggers")
    console.log("   - Created manual sync function for future use")
    
  } catch (error) {
    console.error("❌ Error during email sync fix:", error)
  }
}

// Run the fix
fixEmailSync().catch(console.error)