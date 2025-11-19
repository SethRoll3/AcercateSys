import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Found' : 'Missing')
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Found' : 'Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixRoleConstraintWithView() {
  console.log('🔧 Iniciando corrección de restricción de role con manejo de vista...')
  
  try {
    // Paso 1: Guardar la definición actual de la vista advisor_clients
    console.log('📋 Paso 1: Obteniendo definición de la vista advisor_clients...')
    
    const viewDefinition = `
CREATE VIEW advisor_clients 
WITH (security_invoker = true) AS
SELECT 
    u.id as advisor_id,
    u.email as advisor_email,
    u.full_name as advisor_name,
    c.id as client_id,
    CONCAT(c.first_name, ' ', c.last_name) as client_name,
    c.phone as client_phone,
    c.address as client_address,
    c.created_at as client_created_at
FROM users u
LEFT JOIN clients c ON u.id = c.advisor_id
WHERE u.role = 'asesor';`

    // Paso 2: Eliminar la vista advisor_clients temporalmente
    console.log('🗑️ Paso 2: Eliminando vista advisor_clients temporalmente...')
    
    const { error: dropViewError } = await supabase.rpc('exec_sql', {
      sql: 'DROP VIEW IF EXISTS advisor_clients CASCADE;'
    })
    
    if (dropViewError) {
      console.error('❌ Error eliminando vista:', dropViewError)
      throw dropViewError
    }
    
    console.log('✅ Vista advisor_clients eliminada temporalmente')

    // Paso 3: Eliminar la restricción CHECK antigua
    console.log('🔧 Paso 3: Eliminando restricción CHECK antigua...')
    
    const dropConstraintSQL = `
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
    ELSE
        RAISE NOTICE 'No role constraint found to drop';
    END IF;
END $$;`

    const { error: dropConstraintError } = await supabase.rpc('exec_sql', {
      sql: dropConstraintSQL
    })
    
    if (dropConstraintError) {
      console.error('❌ Error eliminando restricción:', dropConstraintError)
      throw dropConstraintError
    }
    
    console.log('✅ Restricción CHECK eliminada')

    // Paso 4: Alterar la columna role para usar el tipo ENUM
    console.log('🔄 Paso 4: Alterando columna role para usar tipo ENUM...')
    
    const alterColumnSQL = `
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;`

    const { error: alterColumnError } = await supabase.rpc('exec_sql', {
      sql: alterColumnSQL
    })
    
    if (alterColumnError) {
      console.error('❌ Error alterando columna:', alterColumnError)
      throw alterColumnError
    }
    
    console.log('✅ Columna role alterada para usar tipo ENUM')

    // Paso 5: Recrear la vista advisor_clients
    console.log('🔄 Paso 5: Recreando vista advisor_clients...')
    
    const { error: createViewError } = await supabase.rpc('exec_sql', {
      sql: viewDefinition
    })
    
    if (createViewError) {
      console.error('❌ Error recreando vista:', createViewError)
      throw createViewError
    }
    
    console.log('✅ Vista advisor_clients recreada')

    // Paso 6: Restaurar permisos en la vista
    console.log('🔐 Paso 6: Restaurando permisos en la vista...')
    
    const grantPermissionsSQL = `
GRANT SELECT ON advisor_clients TO authenticated;
COMMENT ON VIEW advisor_clients IS 'View showing advisors and their assigned clients (SECURITY INVOKER)';`

    const { error: grantError } = await supabase.rpc('exec_sql', {
      sql: grantPermissionsSQL
    })
    
    if (grantError) {
      console.error('❌ Error restaurando permisos:', grantError)
      throw grantError
    }
    
    console.log('✅ Permisos restaurados en la vista')

    // Paso 7: Verificar que todo funciona
    console.log('🧪 Paso 7: Verificando que la corrección funciona...')
    
    const { data: testData, error: testError } = await supabase
      .from('advisor_clients')
      .select('*')
      .limit(1)
    
    if (testError) {
      console.error('❌ Error verificando vista:', testError)
      throw testError
    }
    
    console.log('✅ Vista advisor_clients funciona correctamente')
    
    console.log('🎉 ¡Corrección completada exitosamente!')
    console.log('📝 Ahora puedes crear usuarios con roles "asesor" y "cliente" sin problemas.')
    
  } catch (error) {
    console.error('💥 Error durante la corrección:', error)
    console.log('\n📋 Si el script falló, puedes ejecutar manualmente en el SQL Editor de Supabase:')
    console.log(`
-- 1. Eliminar vista temporalmente
DROP VIEW IF EXISTS advisor_clients CASCADE;

-- 2. Eliminar restricción CHECK
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

-- 3. Alterar columna
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- 4. Recrear vista
CREATE VIEW advisor_clients 
WITH (security_invoker = true) AS
SELECT 
    u.id as advisor_id,
    u.email as advisor_email,
    u.full_name as advisor_name,
    c.id as client_id,
    CONCAT(c.first_name, ' ', c.last_name) as client_name,
    c.phone as client_phone,
    c.address as client_address,
    c.created_at as client_created_at
FROM users u
LEFT JOIN clients c ON u.id = c.advisor_id
WHERE u.role = 'asesor';

-- 5. Restaurar permisos
GRANT SELECT ON advisor_clients TO authenticated;
COMMENT ON VIEW advisor_clients IS 'View showing advisors and their assigned clients (SECURITY INVOKER)';
`)
    process.exit(1)
  }
}

// Ejecutar la función
fixRoleConstraintWithView()