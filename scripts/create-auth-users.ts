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

async function createUsers() {
  console.log("Creating test users in Supabase Auth...")

  const users = [
    {
      email: "admin@cooperativa.com",
      password: "admin123",
      full_name: "Administrator",
      role: "admin",
    },
  ]

  for (const user of users) {
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.full_name,
          role: user.role,
        },
      })

      if (authError) {
        console.error(`Error creating ${user.email}:`, authError.message)
        continue
      }

      console.log(`✓ Created user: ${user.email}`)

      // But we can also manually ensure it's there
      const { error: dbError } = await supabase.from("users").upsert(
        {
          id: authData.user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "email",
        },
      )

      if (dbError) {
        console.error(`Error updating users table for ${user.email}:`, dbError.message)
      }
    } catch (error) {
      console.error(`Unexpected error for ${user.email}:`, error)
    }
  }

  console.log("\n✅ Users created successfully!")
  console.log("\n📋 Test credentials:")
  console.log("👤 Admin: admin@cooperativa.com / admin123")
}

createUsers()
