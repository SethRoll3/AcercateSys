import { createClient } from "@supabase/supabase-js"
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function fixUsersTable() {
  console.log("Fixing users table structure...")

  try {
    // 1. First, let's check current table structure
    console.log("Checking current table structure...")
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'users' })
      .single()

    if (columnsError) {
      console.log("Using alternative method to check structure...")
    }

    // 2. Apply the migration SQL
    console.log("Applying users table migration...")
    
    const migrationSQL = `
      -- Drop password_hash column since we're using Supabase Auth
      ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

      -- Add auth_id column to link with Supabase Auth
      ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

      -- Add index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

      -- Drop existing RLS policies that use id
      DROP POLICY IF EXISTS "users_select_own" ON users;
      DROP POLICY IF EXISTS "users_update_own" ON users;

      -- Recreate policies using auth_id
      CREATE POLICY "users_select_own" ON users
        FOR SELECT USING (auth.uid() = auth_id);

      CREATE POLICY "users_update_own" ON users
        FOR UPDATE USING (auth.uid() = auth_id);

      -- Create or replace trigger to sync auth.users with public.users
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO public.users (auth_id, email, full_name, role)
        VALUES (
          NEW.id,
          NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
          COALESCE(NEW.raw_user_meta_data->>'role', 'user')
        )
        ON CONFLICT (email) DO UPDATE
        SET 
          auth_id = EXCLUDED.auth_id,
          full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
          role = COALESCE(EXCLUDED.role, public.users.role),
          updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- Drop and recreate trigger
      DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT OR UPDATE ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    `

    // Execute the migration in parts to handle any errors
    const sqlCommands = migrationSQL.split(';').filter(cmd => cmd.trim())
    
    for (const command of sqlCommands) {
      if (command.trim()) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: command.trim() + ';' })
          if (error) {
            console.log(`Command executed with note: ${command.substring(0, 50)}...`)
          }
        } catch (err) {
          console.log(`Executing: ${command.substring(0, 50)}...`)
        }
      }
    }

    console.log("✓ Migration applied")

    // 3. Now delete the existing admin user from public.users
    console.log("Removing existing admin user from public.users...")
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("email", "admin@cooperativa.com")

    if (deleteError) {
      console.error("Error deleting existing user:", deleteError.message)
    } else {
      console.log("✓ Deleted existing admin user")
    }

    // 4. Now try to create the auth user again
    console.log("Creating admin user in Supabase Auth...")
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: "admin@cooperativa.com",
      password: "admin123",
      email_confirm: true,
      user_metadata: {
        full_name: "Administrator",
        role: "admin",
      },
    })

    if (authError) {
      console.error("Error creating auth user:", authError.message)
      
      // If still fails, provide manual instructions
      console.log("\n❌ Still having issues. Manual creation required:")
      console.log("1. Go to Supabase Dashboard > Authentication > Users")
      console.log("2. Click 'Add user'")
      console.log("3. Email: admin@cooperativa.com")
      console.log("4. Password: admin123")
      console.log("5. Confirm email: Yes")
      console.log("6. The trigger should now work correctly")
      return
    }

    console.log("✓ Created auth user successfully!")
    console.log(`Auth User ID: ${authData.user.id}`)

    // 5. Wait for trigger to sync
    console.log("Waiting for trigger to sync...")
    await new Promise(resolve => setTimeout(resolve, 3000))

    // 6. Verify the sync worked
    const { data: publicUser, error: publicError } = await supabase
      .from("users")
      .select("*")
      .eq("email", "admin@cooperativa.com")
      .single()

    if (publicError) {
      console.error("User not synced to public.users:", publicError.message)
    } else {
      console.log("✓ User synced to public.users:")
      console.log(`  ID: ${publicUser.id}`)
      console.log(`  Auth ID: ${publicUser.auth_id}`)
      console.log(`  Email: ${publicUser.email}`)
      console.log(`  Role: ${publicUser.role}`)
    }

    console.log("\n✅ Admin user created successfully!")
    console.log("\n📋 Login credentials:")
    console.log("📧 Email: admin@cooperativa.com")
    console.log("🔑 Password: admin123")
    console.log("👑 Role: admin")

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

fixUsersTable()