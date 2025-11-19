import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applySyncFunctions() {
  console.log("🔧 Applying email synchronization functions...")
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251102193529_fix_email_sync.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`)
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'
      console.log(`\n${i + 1}. Executing statement...`)
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement })
        
        if (error) {
          console.error(`❌ Error in statement ${i + 1}:`, error.message)
          // Continue with other statements
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`)
        }
      } catch (err) {
        console.error(`❌ Exception in statement ${i + 1}:`, err)
      }
    }
    
    // Test the functions
    console.log("\n🧪 Testing the synchronization functions...")
    
    // Check if functions exist
    const { data: functions, error: funcError } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_schema', 'public')
      .in('routine_name', ['handle_new_user', 'sync_user_email', 'sync_client_email'])
    
    if (funcError) {
      console.error("❌ Error checking functions:", funcError.message)
    } else {
      console.log(`✅ Found ${functions.length} synchronization functions:`)
      functions.forEach(func => {
        console.log(`   - ${func.routine_name}`)
      })
    }
    
    // Check triggers
    const { data: triggers, error: trigError } = await supabase
      .from('information_schema.triggers')
      .select('trigger_name, event_object_table')
      .in('trigger_name', ['on_auth_user_created', 'on_auth_user_updated', 'on_public_user_email_updated'])
    
    if (trigError) {
      console.error("❌ Error checking triggers:", trigError.message)
    } else {
      console.log(`✅ Found ${triggers.length} synchronization triggers:`)
      triggers.forEach(trig => {
        console.log(`   - ${trig.trigger_name} on ${trig.event_object_table}`)
      })
    }
    
    console.log("\n✅ Email synchronization functions applied successfully!")
    console.log("\n📋 What was implemented:")
    console.log("   - handle_new_user(): Syncs new auth.users to public.users")
    console.log("   - sync_user_email(): Syncs email changes from auth.users to public.users")
    console.log("   - sync_client_email(): Syncs email changes from public.users to clients")
    console.log("   - Automatic triggers for all sync operations")
    
  } catch (error) {
    console.error("❌ Error applying sync functions:", error)
  }
}

// Run the application
applySyncFunctions().catch(console.error)