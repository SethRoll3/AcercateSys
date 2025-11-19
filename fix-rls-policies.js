const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://rnqjqvqhqjqjqjqjqjqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJucWpxdnFocWpxanFqcWpxanFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjk3NzI5NCwiZXhwIjoyMDUyNTUzMjk0fQ.Ej7Ej7Ej7Ej7Ej7Ej7Ej7Ej7Ej7Ej7Ej7Ej7Ej7E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixRLSPolicies() {
  console.log('🔧 Fixing RLS policies...');
  
  try {
    // Read the SQL script
    const sqlScript = fs.readFileSync(path.join(__dirname, 'scripts', 'fix-rls-auth-mapping.sql'), 'utf8');
    
    // Split the script into individual statements
    const statements = sqlScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error);
        // Continue with other statements even if one fails
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log('🎉 RLS policies update completed!');
    
  } catch (error) {
    console.error('❌ Error fixing RLS policies:', error);
  }
}

// Alternative approach using direct SQL execution
async function fixRLSPoliciesAlternative() {
  console.log('🔧 Fixing RLS policies (alternative approach)...');
  
  const policies = [
    // Drop existing loan policies
    `DROP POLICY IF EXISTS "Role-based loan insert" ON loans`,
    `DROP POLICY IF EXISTS "loans_insert_admin" ON loans`,
    
    // Create corrected loan insert policy
    `CREATE POLICY "Role-based loan insert" ON loans
     FOR INSERT WITH CHECK (
         (SELECT role FROM users WHERE auth_id = auth.uid()) IN ('admin', 'asesor')
     )`,
    
    // Drop and recreate loan access policy
    `DROP POLICY IF EXISTS "Role-based loan access" ON loans`,
    `CREATE POLICY "Role-based loan access" ON loans
     FOR SELECT USING (
         (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
         ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
          client_id IN (SELECT id FROM clients WHERE advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid()))) OR
         ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'cliente' AND client_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
     )`,
    
    // Drop and recreate loan update policy
    `DROP POLICY IF EXISTS "Role-based loan update" ON loans`,
    `CREATE POLICY "Role-based loan update" ON loans
     FOR UPDATE USING (
         (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin' OR
         ((SELECT role FROM users WHERE auth_id = auth.uid()) = 'asesor' AND 
          client_id IN (SELECT id FROM clients WHERE advisor_id = (SELECT id FROM users WHERE auth_id = auth.uid())))
     )`,
    
    // Drop and recreate loan delete policy
    `DROP POLICY IF EXISTS "Only admins can delete loans" ON loans`,
    `CREATE POLICY "Only admins can delete loans" ON loans
     FOR DELETE USING (
         (SELECT role FROM users WHERE auth_id = auth.uid()) = 'admin'
     )`
  ];
  
  for (let i = 0; i < policies.length; i++) {
    const policy = policies[i];
    console.log(`⚡ Executing policy ${i + 1}/${policies.length}...`);
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: policy });
      
      if (error) {
        console.error(`❌ Error in policy ${i + 1}:`, error);
      } else {
        console.log(`✅ Policy ${i + 1} executed successfully`);
      }
    } catch (err) {
      console.error(`❌ Exception in policy ${i + 1}:`, err);
    }
  }
  
  console.log('🎉 RLS policies update completed!');
}

// Try the alternative approach first
fixRLSPoliciesAlternative().catch(console.error);