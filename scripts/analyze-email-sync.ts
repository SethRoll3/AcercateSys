import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function analyzeEmailSync() {
  console.log("🔍 Analyzing email synchronization between tables...")
  
  try {
    // 1. Check auth.users emails
    console.log("\n1. Checking auth.users emails...")
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error("❌ Error fetching auth users:", authError.message)
      return
    }
    
    console.log(`📧 Found ${authUsers.users.length} users in auth.users:`)
    authUsers.users.forEach(user => {
      console.log(`   - ${user.email} (ID: ${user.id})`)
    })

    // 2. Check public.users emails
    console.log("\n2. Checking public.users emails...")
    const { data: publicUsers, error: publicError } = await supabase
      .from('users')
      .select('id, email, auth_id, full_name, role')
      .order('created_at', { ascending: false })
    
    if (publicError) {
      console.error("❌ Error fetching public users:", publicError.message)
      return
    }
    
    console.log(`👥 Found ${publicUsers.length} users in public.users:`)
    publicUsers.forEach(user => {
      console.log(`   - ${user.email} (ID: ${user.id}, auth_id: ${user.auth_id}, role: ${user.role})`)
    })

    // 3. Check clients emails
    console.log("\n3. Checking clients emails...")
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, email, first_name, last_name, advisor_id')
      .order('created_at', { ascending: false })
    
    if (clientsError) {
      console.error("❌ Error fetching clients:", clientsError.message)
      return
    }
    
    console.log(`🏢 Found ${clients.length} clients:`)
    clients.forEach(client => {
      console.log(`   - ${client.email || 'NO EMAIL'} (${client.first_name} ${client.last_name}, ID: ${client.id})`)
    })

    // 4. Analyze mismatches
    console.log("\n4. Analyzing email synchronization issues...")
    
    // Check auth.users vs public.users
    const authEmails = new Set(authUsers.users.map(u => u.email))
    const publicEmails = new Set(publicUsers.map(u => u.email))
    
    const authOnlyEmails = [...authEmails].filter(email => !publicEmails.has(email))
    const publicOnlyEmails = [...publicEmails].filter(email => !authEmails.has(email))
    
    if (authOnlyEmails.length > 0) {
      console.log("⚠️  Emails in auth.users but NOT in public.users:")
      authOnlyEmails.forEach(email => console.log(`   - ${email}`))
    }
    
    if (publicOnlyEmails.length > 0) {
      console.log("⚠️  Emails in public.users but NOT in auth.users:")
      publicOnlyEmails.forEach(email => console.log(`   - ${email}`))
    }

    // Check auth_id mapping
    console.log("\n5. Checking auth_id mapping...")
    const authUserIds = new Set(authUsers.users.map(u => u.id))
    const unmappedPublicUsers = publicUsers.filter(u => u.auth_id && !authUserIds.has(u.auth_id))
    
    if (unmappedPublicUsers.length > 0) {
      console.log("⚠️  public.users with invalid auth_id references:")
      unmappedPublicUsers.forEach(user => {
        console.log(`   - ${user.email} (auth_id: ${user.auth_id} not found in auth.users)`)
      })
    }

    // Check for missing auth_id
    const usersWithoutAuthId = publicUsers.filter(u => !u.auth_id)
    if (usersWithoutAuthId.length > 0) {
      console.log("⚠️  public.users without auth_id:")
      usersWithoutAuthId.forEach(user => {
        console.log(`   - ${user.email} (ID: ${user.id})`)
      })
    }

    // 6. Check existing triggers and functions
    console.log("\n6. Checking database triggers and functions...")
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type')
      .eq('routine_schema', 'public')
      .like('routine_name', '%handle_new_user%')
    
    if (!functionsError && functions.length > 0) {
      console.log("📋 Found handle_new_user function")
    } else {
      console.log("❌ handle_new_user function not found")
    }

    console.log("\n✅ Analysis complete!")
    
  } catch (error) {
    console.error("❌ Error during analysis:", error)
  }
}

// Run the analysis
analyzeEmailSync().catch(console.error)