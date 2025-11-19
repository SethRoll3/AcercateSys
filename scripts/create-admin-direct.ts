import { createClient } from "@supabase/supabase-js"
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function createAdminDirect() {
  console.log("Creating admin user directly in users table...")

  const adminId = randomUUID()
  const adminEmail = "admin@cooperativa.com"
  const adminFullName = "Administrator"
  const adminRole = "admin"

  try {
    // Delete existing admin user if exists
    console.log("Deleting existing admin user...")
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("email", adminEmail)
    
    if (deleteError) {
      console.error("Error deleting existing user:", deleteError.message)
    } else {
      console.log("✓ Deleted existing user")
    }

    // Insert new admin user directly
    console.log("Inserting new admin user...")
    const { data, error: insertError } = await supabase
      .from("users")
      .insert({
        id: adminId,
        email: adminEmail,
        full_name: adminFullName,
        role: adminRole,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()

    if (insertError) {
      console.error("Error inserting admin user:", insertError.message)
      return
    }

    console.log("✓ Admin user created successfully!")
    console.log("\n📋 Admin user details:")
    console.log(`👤 ID: ${adminId}`)
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`👤 Full Name: ${adminFullName}`)
    console.log(`👑 Role: ${adminRole}`)
    console.log("\n⚠️  Note: This user is created only in the users table.")
    console.log("   For authentication, you'll need to create the auth user separately")
    console.log("   or use the Supabase dashboard to create the auth user with this email.")

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

createAdminDirect()