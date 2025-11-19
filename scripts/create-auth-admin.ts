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

async function createAuthAdmin() {
  console.log("Creating admin user in Supabase Auth...")

  const adminEmail = "admin@cooperativa.com"
  const adminPassword = "admin123"
  const adminFullName = "Administrator"
  const adminRole = "admin"

  try {
    // First, let's list all users to see what's there
    console.log("Listing all auth users...")
    const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      console.error("Error listing users:", listError.message)
      return
    }

    console.log(`Found ${allUsers.users.length} existing auth users`)
    
    // Find existing user with this email
    const existingUser = allUsers.users.find(user => user.email === adminEmail)
    
    if (existingUser) {
      console.log(`Found existing user with ID: ${existingUser.id}`)
      console.log("Deleting existing auth user...")
      
      const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id)
      if (deleteError) {
        console.error("Error deleting existing auth user:", deleteError.message)
        console.log("Trying to update password instead...")
        
        // Try to update the existing user's password
        const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
          existingUser.id,
          {
            password: adminPassword,
            user_metadata: {
              full_name: adminFullName,
              role: adminRole,
            },
          }
        )
        
        if (updateError) {
          console.error("Error updating user:", updateError.message)
          return
        }
        
        console.log("✓ Updated existing user password and metadata")
        console.log(`User ID: ${existingUser.id}`)
        
        // Update public.users table
        const { error: publicUpdateError } = await supabase
          .from("users")
          .upsert({
            id: existingUser.id,
            email: adminEmail,
            full_name: adminFullName,
            role: adminRole,
            updated_at: new Date().toISOString(),
          })

        if (publicUpdateError) {
          console.error("Error updating public.users:", publicUpdateError.message)
        } else {
          console.log("✓ Updated public.users table")
        }

        console.log("\n✅ Admin user updated successfully!")
        console.log("\n📋 Login credentials:")
        console.log(`📧 Email: ${adminEmail}`)
        console.log(`🔑 Password: ${adminPassword}`)
        console.log(`👑 Role: ${adminRole}`)
        console.log(`🆔 Auth ID: ${existingUser.id}`)
        return
      } else {
        console.log("✓ Deleted existing auth user")
        // Wait for deletion to propagate
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    // Create new user in Supabase Auth
    console.log("Creating new user in Supabase Auth...")
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
      console.error("Error creating auth user:", authError.message)
      console.error("Full error:", authError)
      return
    }

    console.log("✓ Created user in Supabase Auth")
    console.log(`User ID: ${authData.user.id}`)

    // Wait for trigger to sync
    console.log("Waiting for trigger to sync to public.users...")
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check if user was synced to public.users
    const { data: publicUser, error: publicError } = await supabase
      .from("users")
      .select("*")
      .eq("email", adminEmail)
      .single()

    if (publicError) {
      console.error("Error checking public.users:", publicError.message)
      
      // If trigger didn't work, manually insert
      console.log("Manually inserting into public.users...")
      const { error: insertError } = await supabase
        .from("users")
        .upsert({
          id: authData.user.id,
          email: adminEmail,
          full_name: adminFullName,
          role: adminRole,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error("Error inserting into public.users:", insertError.message)
      } else {
        console.log("✓ Manually inserted into public.users")
      }
    } else {
      console.log("✓ User automatically synced to public.users")
      console.log("Public user data:", publicUser)
    }

    console.log("\n✅ Admin user created successfully!")
    console.log("\n📋 Login credentials:")
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`🔑 Password: ${adminPassword}`)
    console.log(`👑 Role: ${adminRole}`)
    console.log(`🆔 Auth ID: ${authData.user.id}`)

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

createAuthAdmin()