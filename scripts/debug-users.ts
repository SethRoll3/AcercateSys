import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugUsers() {
  console.log('🔍 Debugging users table...')
  
  // Check all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
  
  console.log('👥 All users:', users)
  console.log('❌ Users error:', usersError)
  
  // Check auth users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
  
  console.log('🔐 Auth users:', authUsers.users?.map(u => ({ id: u.id, email: u.email })))
  console.log('❌ Auth error:', authError)
  
  // Check if there's a mismatch
  if (users && authUsers.users) {
    console.log('\n🔄 Checking auth_id matches:')
    for (const authUser of authUsers.users) {
      const matchingUser = users.find(u => u.auth_id === authUser.id)
      console.log(`Auth user ${authUser.email} (${authUser.id}):`, matchingUser ? '✅ Found' : '❌ Not found')
    }
  }
}

debugUsers().catch(console.error)