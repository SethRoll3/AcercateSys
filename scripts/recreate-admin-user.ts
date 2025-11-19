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

async function recreateAdminUser() {
  console.log("Recreating admin user...")

  const adminEmail = "admin@cooperativa.com"
  const adminPassword = "admin123"
  const adminFullName = "Administrator"
  const adminRole = "admin"

  try {
    // First, try to delete existing user from auth.users
    console.log("Checking for existing admin user...")
    
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers.users.find(user => user.email === adminEmail)
    
    if (existingUser) {
      console.log("Deleting existing admin user from auth...")
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(existingUser.id)
      if (deleteAuthError) {
        console.error("Error deleting user from auth:", deleteAuthError.message)
      } else {
        console.log("✓ Deleted existing user from auth")
      }
    }

    // Delete from public.users table
    console.log("Deleting from public.users table...")
    const { error: deleteDbError } = await supabase
      .from("users")
      .delete()
      .eq("email", adminEmail)
    
    if (deleteDbError) {
      console.error("Error deleting from users table:", deleteDbError.message)
    } else {
      console.log("✓ Deleted from public.users table")
    }

    // Wait a moment for the deletion to propagate
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Create new admin user
    console.log("Creating new admin user...")
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminFullName,
        role: adminRole,
      },
    })

    if (authError) {
      console.error(`Error creating admin user:`, authError.message)
      return
    }

    console.log(`✓ Created auth user: ${adminEmail}`)

    // Insert into public.users table
    const { error: dbError } = await supabase.from("users").insert({
      id: authData.user.id,
      email: adminEmail,
      full_name: adminFullName,
      role: adminRole,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (dbError) {
      console.error(`Error inserting into users table:`, dbError.message)
      return
    }

    console.log("✓ Inserted into public.users table")
    console.log("\n✅ Admin user recreated successfully!")
    console.log("\n📋 Admin credentials:")
    console.log(`👤 Email: ${adminEmail}`)
    console.log(`🔑 Password: ${adminPassword}`)
    console.log(`👑 Role: ${adminRole}`)

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

recreateAdminUser()