-- Migration: Fix advisor_clients view security
-- Created: 2025-01-17
-- Description: Fix advisor_clients view to use SECURITY INVOKER instead of SECURITY DEFINER

-- Drop the existing view
DROP VIEW IF EXISTS advisor_clients;

-- Recreate the view with SECURITY INVOKER
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

-- Add comment for documentation
COMMENT ON VIEW advisor_clients IS 'View showing advisors and their assigned clients (SECURITY INVOKER)';

-- Grant necessary permissions
GRANT SELECT ON advisor_clients TO authenticated;