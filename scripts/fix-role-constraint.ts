import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('Supabase URL:', supabaseUrl ? 'Found' : 'Missing')
console.log('Service Key:', supabaseServiceKey ? 'Found' : 'Missing')

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixRoleConstraint() {
  console.log('🔧 Fixing users table role constraint...')
  
  try {
    // Let's try a different approach - check if we can create a user with 'asesor' role
    console.log('Testing current role constraint...')
    
    // First, let's see what the current role column type is
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, udt_name')
      .eq('table_name', 'users')
      .eq('column_name', 'role')
    
    if (tableError) {
      console.error('Error checking table info:', tableError)
    } else {
      console.log('Current role column info:', tableInfo)
    }
    
    // Try to create a test user with 'asesor' role to see if the constraint is still there
    const testEmail = `test-${Date.now()}@example.com`
    const { data: testUser, error: testError } = await supabase
      .from('users')
      .insert({
        email: testEmail,
        full_name: 'Test User',
        role: 'asesor'
      })
      .select()
    
    if (testError) {
      console.log('❌ Constraint still exists:', testError.message)
      
      // If the error mentions the constraint, we need to fix it
      if (testError.message.includes('users_role_check') || testError.message.includes('check constraint')) {
        console.log('🔧 Attempting to fix the constraint...')
        
        // We'll need to use a more direct approach
        // Let's try to update an existing user's role to see what happens
        const { data: existingUsers, error: fetchError } = await supabase
          .from('users')
          .select('id, email, role')
          .limit(1)
        
        if (fetchError) {
          console.error('Error fetching existing users:', fetchError)
        } else {
          console.log('Existing users:', existingUsers)
          console.log('❌ The constraint is preventing role updates. Manual database intervention required.')
          console.log('Please run the following SQL directly in your Supabase SQL editor:')
          console.log(`
-- Find and drop the old CHECK constraint
DO $$ 
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint 
    WHERE conrelid = 'users'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%role%IN%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || constraint_name;
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    END IF;
END $$;

-- Ensure the role column uses the user_role ENUM type
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
          `)
        }
      }
    } else {
      console.log('✅ Role constraint is already fixed! Test user created:', testUser)
      
      // Clean up test user
      await supabase
        .from('users')
        .delete()
        .eq('email', testEmail)
      
      console.log('🧹 Test user cleaned up')
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

fixRoleConstraint()