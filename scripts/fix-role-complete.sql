-- =====================================================
-- SCRIPT COMPLETO PARA CORREGIR LA RESTRICCIÓN DE ROLE
-- =====================================================
-- Este script elimina todas las dependencias de la columna role,
-- corrige la restricción CHECK, y recrea todas las dependencias.

-- PASO 1: ELIMINAR TODAS LAS POLÍTICAS RLS QUE DEPENDEN DE LA COLUMNA ROLE
-- ========================================================================

-- Eliminar políticas de la tabla users
DROP POLICY IF EXISTS "Users can view own data and admins can view all" ON users;
DROP POLICY IF EXISTS "Users can update own data and admins can update all" ON users;
DROP POLICY IF EXISTS "Only admins can insert users" ON users;

-- Eliminar políticas de la tabla clients
DROP POLICY IF EXISTS "Role-based client access" ON clients;
DROP POLICY IF EXISTS "Role-based client insert" ON clients;
DROP POLICY IF EXISTS "Role-based client update" ON clients;
DROP POLICY IF EXISTS "Only admins can delete clients" ON clients;

-- Eliminar políticas de la tabla loans
DROP POLICY IF EXISTS "Role-based loan access" ON loans;
DROP POLICY IF EXISTS "Role-based loan insert" ON loans;
DROP POLICY IF EXISTS "Role-based loan update" ON loans;
DROP POLICY IF EXISTS "Only admins can delete loans" ON loans;

-- Eliminar políticas de la tabla payments
DROP POLICY IF EXISTS "Role-based payment access" ON payments;
DROP POLICY IF EXISTS "Role-based payment insert" ON payments;
DROP POLICY IF EXISTS "Role-based payment update" ON payments;
DROP POLICY IF EXISTS "Only admins can delete payments" ON payments;

-- Eliminar políticas de la tabla payment_schedules
DROP POLICY IF EXISTS "Role-based payment schedule access" ON payment_schedules;
DROP POLICY IF EXISTS "Role-based payment schedule insert" ON payment_schedules;
DROP POLICY IF EXISTS "Role-based payment schedule update" ON payment_schedules;
DROP POLICY IF EXISTS "Only admins can delete payment schedules" ON payment_schedules;

-- Eliminar políticas de la tabla cuota_boletas
DROP POLICY IF EXISTS "cuota_boletas_select_admin" ON cuota_boletas;
DROP POLICY IF EXISTS "cuota_boletas_insert_admin" ON cuota_boletas;
DROP POLICY IF EXISTS "cuota_boletas_update_admin" ON cuota_boletas;
DROP POLICY IF EXISTS "cuota_boletas_delete_admin" ON cuota_boletas;

-- PASO 2: ELIMINAR LA VISTA ADVISOR_CLIENTS
-- ==========================================
DROP VIEW IF EXISTS advisor_clients CASCADE;

-- PASO 3: ELIMINAR LA RESTRICCIÓN CHECK ANTIGUA
-- ==============================================
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
END $$;

-- PASO 4: ALTERAR LA COLUMNA ROLE PARA USAR EL TIPO ENUM
-- =======================================================
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- PASO 5: RECREAR LA VISTA ADVISOR_CLIENTS
-- =========================================
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

-- PASO 6: RECREAR TODAS LAS POLÍTICAS RLS
-- ========================================

-- Políticas para la tabla users
CREATE POLICY "Users can view own data and admins can view all" ON users
    FOR SELECT USING (
        auth.uid() = id OR 
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Users can update own data and admins can update all" ON users
    FOR UPDATE USING (
        auth.uid() = id OR 
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Only admins can insert users" ON users
    FOR INSERT WITH CHECK (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Políticas para la tabla clients
CREATE POLICY "Role-based client access" ON clients
    FOR SELECT USING (
        -- Admin can see all clients
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND advisor_id = auth.uid()) OR
        -- Client can see their own record
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND id = auth.uid())
    );

CREATE POLICY "Role-based client insert" ON clients
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create clients
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based client update" ON clients
    FOR UPDATE USING (
        -- Admin can update all clients
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND advisor_id = auth.uid())
    );

CREATE POLICY "Only admins can delete clients" ON clients
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Políticas para la tabla loans
CREATE POLICY "Role-based loan access" ON loans
    FOR SELECT USING (
        -- Admin can see all loans
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see loans of their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         client_id IN (SELECT id FROM clients WHERE advisor_id = auth.uid())) OR
        -- Client can see their own loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND client_id = auth.uid())
    );

CREATE POLICY "Role-based loan insert" ON loans
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create loans
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based loan update" ON loans
    FOR UPDATE USING (
        -- Admin can update all loans
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update loans of their assigned clients
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         client_id IN (SELECT id FROM clients WHERE advisor_id = auth.uid()))
    );

CREATE POLICY "Only admins can delete loans" ON loans
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Políticas para la tabla payments
CREATE POLICY "Role-based payment access" ON payments
    FOR SELECT USING (
        -- Admin can see all payments
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see payments of their assigned clients' loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = auth.uid()
         )) OR
        -- Client can see their own payments
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND 
         loan_id IN (SELECT id FROM loans WHERE client_id = auth.uid()))
    );

CREATE POLICY "Role-based payment insert" ON payments
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create payments
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based payment update" ON payments
    FOR UPDATE USING (
        -- Admin can update all payments
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update payments of their assigned clients' loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = auth.uid()
         ))
    );

CREATE POLICY "Only admins can delete payments" ON payments
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Políticas para la tabla payment_schedules (si existe)
CREATE POLICY "Role-based payment schedule access" ON payment_schedule
    FOR SELECT USING (
        -- Admin can see all payment schedules
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can see payment schedules of their assigned clients' loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = auth.uid()
         )) OR
        -- Client can see their own payment schedules
        ((SELECT role FROM users WHERE id = auth.uid()) = 'cliente' AND 
         loan_id IN (SELECT id FROM loans WHERE client_id = auth.uid()))
    );

CREATE POLICY "Role-based payment schedule insert" ON payment_schedule
    FOR INSERT WITH CHECK (
        -- Admin and advisors can create payment schedules
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'asesor')
    );

CREATE POLICY "Role-based payment schedule update" ON payment_schedule
    FOR UPDATE USING (
        -- Admin can update all payment schedules
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin' OR
        -- Advisor can update payment schedules of their assigned clients' loans
        ((SELECT role FROM users WHERE id = auth.uid()) = 'asesor' AND 
         loan_id IN (
             SELECT l.id FROM loans l 
             INNER JOIN clients c ON l.client_id = c.id 
             WHERE c.advisor_id = auth.uid()
         ))
    );

CREATE POLICY "Only admins can delete payment schedules" ON payment_schedule
    FOR DELETE USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    );

-- Políticas para la tabla cuota_boletas (si existe)
CREATE POLICY "cuota_boletas_select_admin" ON cuota_boletas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "cuota_boletas_insert_admin" ON cuota_boletas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "cuota_boletas_update_admin" ON cuota_boletas
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

CREATE POLICY "cuota_boletas_delete_admin" ON cuota_boletas
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- PASO 7: RESTAURAR PERMISOS Y COMENTARIOS
-- =========================================
GRANT SELECT ON advisor_clients TO authenticated;
COMMENT ON VIEW advisor_clients IS 'View showing advisors and their assigned clients (SECURITY INVOKER)';

-- PASO 8: MENSAJE DE CONFIRMACIÓN
-- ================================
DO $$
BEGIN
    RAISE NOTICE '✅ CORRECCIÓN COMPLETADA EXITOSAMENTE';
    RAISE NOTICE '📝 La columna role ahora usa el tipo ENUM user_role correctamente';
    RAISE NOTICE '🔐 Todas las políticas RLS han sido recreadas';
    RAISE NOTICE '👁️ La vista advisor_clients ha sido recreada';
    RAISE NOTICE '🎉 Ahora puedes crear usuarios con roles: admin, asesor, cliente';
END $$;