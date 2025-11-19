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

async function fixCurrentUser() {
  console.log("🔍 Verificando usuarios en auth.users...")

  try {
    // Get all auth users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error("Error getting auth users:", authError.message)
      return
    }

    console.log(`📊 Encontrados ${authUsers.users.length} usuarios en auth.users`)

    // Get all public users
    const { data: publicUsers, error: publicError } = await supabase
      .from('users')
      .select('*')

    if (publicError) {
      console.error("Error getting public users:", publicError.message)
      return
    }

    console.log(`📊 Encontrados ${publicUsers?.length || 0} usuarios en public.users`)

    // Sync each auth user to public.users
    for (const authUser of authUsers.users) {
      console.log(`\n🔄 Procesando usuario: ${authUser.email}`)
      
      // Check if user exists in public.users by email
      const existingPublicUser = publicUsers?.find(u => u.email === authUser.email)
      
      if (existingPublicUser) {
        console.log(`✓ Usuario encontrado en public.users`)
        
        // Update auth_id if missing
        if (!existingPublicUser.auth_id) {
          console.log(`🔧 Actualizando auth_id...`)
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              auth_id: authUser.id,
              updated_at: new Date().toISOString()
            })
            .eq('email', authUser.email)

          if (updateError) {
            console.error("Error updating auth_id:", updateError.message)
          } else {
            console.log("✓ auth_id actualizado")
          }
        }
        
        // If user doesn't have admin or asesor role, update it
        if (!['admin', 'asesor'].includes(existingPublicUser.role)) {
          console.log(`🔧 Actualizando rol a 'asesor'...`)
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              role: 'asesor',
              updated_at: new Date().toISOString()
            })
            .eq('email', authUser.email)

          if (updateError) {
            console.error("Error updating role:", updateError.message)
          } else {
            console.log("✓ Rol actualizado a 'asesor'")
          }
        }
      } else {
        console.log(`➕ Creando usuario en public.users...`)
        
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            auth_id: authUser.id,
            email: authUser.email || '',
            full_name: authUser.user_metadata?.full_name || authUser.email || 'Usuario',
            role: 'asesor',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

        if (insertError) {
          console.error("Error inserting user:", insertError.message)
        } else {
          console.log("✓ Usuario creado en public.users con rol 'asesor'")
        }
      }
    }

    // Show final state
    console.log("\n📋 Estado final de usuarios:")
    const { data: finalUsers } = await supabase
      .from('users')
      .select('*')

    finalUsers?.forEach(user => {
      console.log(`👤 ${user.email} - Rol: ${user.role} - Auth ID: ${user.auth_id}`)
    })

    console.log("\n✅ Proceso completado!")

  } catch (error) {
    console.error("Error inesperado:", error)
  }
}

fixCurrentUser()