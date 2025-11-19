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

async function updateAdminPassword() {
  console.log("Updating admin password...")

  const adminEmail = "admin@cooperativa.com"
  const adminPassword = "admin123"

  try {
    // First, check if user exists in public.users
    console.log("Checking public.users table...")
    const { data: publicUser, error: publicError } = await supabase
      .from("users")
      .select("*")
      .eq("email", adminEmail)
      .single()

    if (publicError) {
      console.error("User not found in public.users:", publicError.message)
      return
    }

    console.log("✓ Found user in public.users:")
    console.log(`  ID: ${publicUser.id}`)
    console.log(`  Email: ${publicUser.email}`)
    console.log(`  Name: ${publicUser.full_name}`)
    console.log(`  Role: ${publicUser.role}`)

    // Now try to create/update the auth user using SQL
    console.log("Creating/updating auth user with SQL...")
    
    const { data: sqlResult, error: sqlError } = await supabase.rpc('create_auth_user', {
      user_id: publicUser.id,
      user_email: adminEmail,
      user_password: adminPassword,
      user_metadata: {
        full_name: publicUser.full_name,
        role: publicUser.role
      }
    })

    if (sqlError) {
      console.error("Error with SQL function:", sqlError.message)
      
      // Try direct SQL approach
      console.log("Trying direct SQL approach...")
      const { error: directSqlError } = await supabase
        .from('auth.users')
        .upsert({
          id: publicUser.id,
          email: adminEmail,
          encrypted_password: `crypt('${adminPassword}', gen_salt('bf'))`,
          email_confirmed_at: new Date().toISOString(),
          raw_user_meta_data: {
            full_name: publicUser.full_name,
            role: publicUser.role
          },
          aud: 'authenticated',
          role: 'authenticated',
          instance_id: '00000000-0000-0000-0000-000000000000',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (directSqlError) {
        console.error("Direct SQL also failed:", directSqlError.message)
        console.log("\n❌ Could not create auth user programmatically.")
        console.log("\n📋 Manual steps required:")
        console.log("1. Go to Supabase Dashboard > Authentication > Users")
        console.log("2. Click 'Add user'")
        console.log(`3. Email: ${adminEmail}`)
        console.log(`4. Password: ${adminPassword}`)
        console.log("5. Confirm email: Yes")
        console.log("6. The user should automatically sync with public.users")
        return
      }
    }

    console.log("✅ Auth user created/updated successfully!")
    console.log("\n📋 Login credentials:")
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`🔑 Password: ${adminPassword}`)
    console.log(`👑 Role: ${publicUser.role}`)
    console.log(`🆔 User ID: ${publicUser.id}`)

  } catch (error) {
    console.error("Unexpected error:", error)
    console.log("\n❌ Could not create auth user programmatically.")
    console.log("\n📋 Manual steps required:")
    console.log("1. Go to Supabase Dashboard > Authentication > Users")
    console.log("2. Click 'Add user'")
    console.log(`3. Email: ${adminEmail}`)
    console.log(`4. Password: ${adminPassword}`)
    console.log("5. Confirm email: Yes")
    console.log("6. The user should automatically sync with public.users")
  }
}

updateAdminPassword()