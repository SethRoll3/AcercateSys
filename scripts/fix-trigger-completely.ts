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

async function fixTriggerCompletely() {
  console.log("🔧 Fixing trigger completely...")

  try {
    // Step 1: Clear existing users
    console.log("\n1. Clearing existing users...")
    
    // Delete all auth users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    for (const user of existingUsers.users) {
      console.log(`Deleting user: ${user.email}`)
      await supabaseAdmin.auth.admin.deleteUser(user.id)
    }

    // Clear public.users
    const { error: clearError } = await supabaseAdmin
      .from("users")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // Delete all

    if (clearError) {
      console.log("Note:", clearError.message)
    } else {
      console.log("✅ Cleared public.users")
    }

    // Step 2: Test creating admin user without trigger interference
    console.log("\n2. Creating admin user directly...")
    
    const adminEmail = "admin@cooperativa.com"
    const adminPassword = "admin123"
    
    // Create admin user in auth
    const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Administrator",
        role: "admin"
      }
    })

    if (adminError) {
      console.error("❌ Error creating admin user:", adminError.message)
      
      // If still failing, let's try a different approach
      console.log("\n3. Trying alternative approach...")
      
      // Create user via signup instead
      const supabaseClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      
      const { data: signupData, error: signupError } = await supabaseClient.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: {
          data: {
            full_name: "Administrator",
            role: "admin"
          }
        }
      })

      if (signupError) {
        console.error("❌ Signup also failed:", signupError.message)
        return
      }

      console.log("✅ User created via signup!")
      
      // Manually confirm the user
      if (signupData.user) {
        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
          signupData.user.id,
          { email_confirm: true }
        )
        
        if (confirmError) {
          console.log("Note: Could not confirm user:", confirmError.message)
        } else {
          console.log("✅ User confirmed")
        }
      }

      // Manually insert into public.users
      if (signupData.user) {
        const { error: insertError } = await supabaseAdmin
          .from("users")
          .insert({
            auth_id: signupData.user.id,
            email: adminEmail,
            full_name: "Administrator",
            role: "admin"
          })

        if (insertError) {
          console.error("❌ Error inserting into public.users:", insertError.message)
        } else {
          console.log("✅ Manually inserted into public.users")
        }
      }

      console.log("\n🎉 ADMIN USER CREATED VIA ALTERNATIVE METHOD!")
      console.log("\n📋 Login credentials:")
      console.log(`📧 Email: ${adminEmail}`)
      console.log(`🔑 Password: ${adminPassword}`)
      console.log(`👑 Role: admin`)
      
      return
    }

    console.log("✅ Admin user created successfully!")
    console.log(`Auth ID: ${adminUser.user.id}`)

    // Manually insert into public.users since trigger might not be working
    const { error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        auth_id: adminUser.user.id,
        email: adminEmail,
        full_name: "Administrator",
        role: "admin"
      })

    if (insertError) {
      console.error("❌ Error inserting into public.users:", insertError.message)
    } else {
      console.log("✅ Manually inserted into public.users")
    }

    console.log("\n🎉 ADMIN USER CREATED!")
    console.log("\n📋 Login credentials:")
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`🔑 Password: ${adminPassword}`)
    console.log(`👑 Role: admin`)

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

fixTriggerCompletely()