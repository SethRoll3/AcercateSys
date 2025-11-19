import { createClient } from "@supabase/supabase-js"
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function debugDatabase() {
  console.log("🔍 Debugging database state...")

  try {
    // Check users table structure
    console.log("\n1. Checking users table structure...")
    const { data: tableInfo, error: tableError } = await supabaseAdmin
      .from("information_schema.columns")
      .select("column_name, data_type, is_nullable")
      .eq("table_name", "users")
      .eq("table_schema", "public")

    if (tableError) {
      console.error("Error checking table structure:", tableError.message)
    } else {
      console.log("Users table columns:")
      tableInfo.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`)
      })
    }

    // Check if trigger exists
    console.log("\n2. Checking triggers...")
    const { data: triggers, error: triggerError } = await supabaseAdmin
      .from("information_schema.triggers")
      .select("trigger_name, event_manipulation, action_statement")
      .eq("trigger_schema", "public")

    if (triggerError) {
      console.error("Error checking triggers:", triggerError.message)
    } else {
      console.log("Triggers found:")
      triggers.forEach(trigger => {
        console.log(`  - ${trigger.trigger_name}: ${trigger.event_manipulation}`)
      })
    }

    // Check if handle_new_user function exists
    console.log("\n3. Checking handle_new_user function...")
    const { data: functions, error: functionError } = await supabaseAdmin
      .from("information_schema.routines")
      .select("routine_name, routine_type")
      .eq("routine_schema", "public")
      .eq("routine_name", "handle_new_user")

    if (functionError) {
      console.error("Error checking functions:", functionError.message)
    } else {
      console.log("handle_new_user function:", functions.length > 0 ? "EXISTS" : "NOT FOUND")
    }

    // Check current users in public.users
    console.log("\n4. Checking current users in public.users...")
    const { data: publicUsers, error: publicUsersError } = await supabaseAdmin
      .from("users")
      .select("*")

    if (publicUsersError) {
      console.error("Error checking public users:", publicUsersError.message)
    } else {
      console.log(`Found ${publicUsers.length} users in public.users:`)
      publicUsers.forEach(user => {
        console.log(`  - ${user.email} (${user.role}) - ID: ${user.id}`)
      })
    }

    // Check auth.users
    console.log("\n5. Checking auth.users...")
    const { data: authUsers, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers()

    if (authUsersError) {
      console.error("Error checking auth users:", authUsersError.message)
    } else {
      console.log(`Found ${authUsers.users.length} users in auth.users:`)
      authUsers.users.forEach(user => {
        console.log(`  - ${user.email} - ID: ${user.id}`)
      })
    }

    // Try to create a simple test user directly in auth
    console.log("\n6. Testing direct auth user creation...")
    const testEmail = "test@test.com"
    
    // First delete if exists
    const existingTestUser = authUsers.users.find(u => u.email === testEmail)
    if (existingTestUser) {
      console.log("Deleting existing test user...")
      await supabaseAdmin.auth.admin.deleteUser(existingTestUser.id)
    }

    const { data: testUser, error: testUserError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: "test123",
      email_confirm: true,
      user_metadata: {
        full_name: "Test User",
        role: "cliente"
      }
    })

    if (testUserError) {
      console.error("❌ Error creating test user:", testUserError.message)
    } else {
      console.log("✅ Test user created successfully:", testUser.user.id)
      
      // Wait and check if it synced
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const { data: syncedUser, error: syncError } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("email", testEmail)
        .single()

      if (syncError) {
        console.error("❌ Test user NOT synced to public.users:", syncError.message)
      } else {
        console.log("✅ Test user synced to public.users:", syncedUser.id)
      }

      // Clean up
      console.log("Cleaning up test user...")
      await supabaseAdmin.auth.admin.deleteUser(testUser.user.id)
      await supabaseAdmin.from("users").delete().eq("email", testEmail)
    }

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

debugDatabase()