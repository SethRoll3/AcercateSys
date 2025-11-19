import { createClient } from "@supabase/supabase-js"
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client for signup
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

// Admin client for updates
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function createAuthAdminViaSignup() {
  console.log("Creating admin user via signup...")

  const adminEmail = "admin@cooperativa.com"
  const adminPassword = "admin123"
  const adminFullName = "Administrator"
  const adminRole = "admin"

  try {
    // First, try to sign up the user
    console.log("Signing up user...")
    const { data: signupData, error: signupError } = await supabaseClient.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: {
        data: {
          full_name: adminFullName,
          role: adminRole,
        },
      },
    })

    if (signupError) {
      console.error("Error during signup:", signupError.message)
      
      // If user already exists, try to sign in
      if (signupError.message.includes("already registered")) {
        console.log("User already exists, trying to sign in...")
        
        const { data: signinData, error: signinError } = await supabaseClient.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        })
        
        if (signinError) {
          console.error("Error signing in:", signinError.message)
          console.log("Trying to reset password...")
          
          // Try to reset password using admin API
          const { data: users } = await supabaseAdmin.auth.admin.listUsers()
          const existingUser = users.users.find(user => user.email === adminEmail)
          
          if (existingUser) {
            console.log(`Found existing user: ${existingUser.id}`)
            
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
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
              console.error("Error updating password:", updateError.message)
              return
            }
            
            console.log("✓ Updated user password and metadata")
            
            // Update public.users table
            const { error: publicUpdateError } = await supabaseAdmin
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
          }
        } else {
          console.log("✓ Successfully signed in existing user")
          console.log(`User ID: ${signinData.user.id}`)
          
          // Update public.users table to ensure role is correct
          const { error: publicUpdateError } = await supabaseAdmin
            .from("users")
            .upsert({
              id: signinData.user.id,
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

          console.log("\n✅ Admin user verified successfully!")
          console.log("\n📋 Login credentials:")
          console.log(`📧 Email: ${adminEmail}`)
          console.log(`🔑 Password: ${adminPassword}`)
          console.log(`👑 Role: ${adminRole}`)
          console.log(`🆔 Auth ID: ${signinData.user.id}`)
          return
        }
      }
      return
    }

    if (!signupData.user) {
      console.error("No user data returned from signup")
      return
    }

    console.log("✓ User signed up successfully")
    console.log(`User ID: ${signupData.user.id}`)

    // Wait for trigger to sync
    console.log("Waiting for trigger to sync to public.users...")
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check if user was synced to public.users
    const { data: publicUser, error: publicError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", adminEmail)
      .single()

    if (publicError) {
      console.error("Error checking public.users:", publicError.message)
      
      // If trigger didn't work, manually insert
      console.log("Manually inserting into public.users...")
      const { error: insertError } = await supabaseAdmin
        .from("users")
        .upsert({
          id: signupData.user.id,
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
      
      // Update role if needed
      if (publicUser.role !== adminRole) {
        console.log("Updating role in public.users...")
        const { error: roleUpdateError } = await supabaseAdmin
          .from("users")
          .update({ role: adminRole, updated_at: new Date().toISOString() })
          .eq("id", signupData.user.id)

        if (roleUpdateError) {
          console.error("Error updating role:", roleUpdateError.message)
        } else {
          console.log("✓ Updated role in public.users")
        }
      }
    }

    console.log("\n✅ Admin user created successfully!")
    console.log("\n📋 Login credentials:")
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`🔑 Password: ${adminPassword}`)
    console.log(`👑 Role: ${adminRole}`)
    console.log(`🆔 Auth ID: ${signupData.user.id}`)

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

createAuthAdminViaSignup()