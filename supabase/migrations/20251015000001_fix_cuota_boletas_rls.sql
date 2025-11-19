-- Fix missing RLS policies for cuota_boletas table

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all cuota_boletas" ON cuota_boletas;
DROP POLICY IF EXISTS "Admins can manage cuota_boletas" ON cuota_boletas;

-- Create specific policies for cuota_boletas
CREATE POLICY "cuota_boletas_select_all" ON cuota_boletas
  FOR SELECT USING (true);

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