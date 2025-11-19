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

async function createAdminFinal() {
  console.log("🎯 Creating admin user (final attempt)...")

  try {
    const adminEmail = "admin@cooperativa.com"
    const adminPassword = "admin123"
    
    // Step 1: Create admin user in auth
    console.log("\n1. Creating admin user in auth...")
    
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
      return
    }

    console.log("✅ Admin user created successfully!")
    console.log(`Auth ID: ${adminUser.user.id}`)

    // Step 2: Manually insert into public.users
    console.log("\n2. Inserting into public.users...")
    
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
      
      // Try upsert instead
      console.log("Trying upsert...")
      const { error: upsertError } = await supabaseAdmin
        .from("users")
        .upsert({
          auth_id: adminUser.user.id,
          email: adminEmail,
          full_name: "Administrator",
          role: "admin"
        })

      if (upsertError) {
        console.error("❌ Upsert also failed:", upsertError.message)
      } else {
        console.log("✅ Upserted into public.users")
      }
    } else {
      console.log("✅ Inserted into public.users")
    }

    // Step 3: Verify the user
    console.log("\n3. Verifying user...")
    
    const { data: publicUser, error: verifyError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", adminEmail)
      .single()

    if (verifyError) {
      console.error("❌ Error verifying user:", verifyError.message)
    } else {
      console.log("✅ User verified in public.users:")
      console.log(publicUser)
    }

    console.log("\n🎉 ADMIN USER CREATED SUCCESSFULLY!")
    console.log("\n📋 Login credentials:")
    console.log(`📧 Email: ${adminEmail}`)
    console.log(`🔑 Password: ${adminPassword}`)
    console.log(`👑 Role: admin`)
    console.log(`🆔 Auth ID: ${adminUser.user.id}`)

  } catch (error) {
    console.error("Unexpected error:", error)
  }
}

createAdminFinal()