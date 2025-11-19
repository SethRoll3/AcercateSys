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

async function addPaymentConfirmationFields() {
  try {
    console.log("🚀 Starting payment confirmation fields migration...")

    // Check if columns already exist
    console.log("🔍 Checking existing table structure...")
    const { data: existingPayments, error: checkError } = await supabase
      .from('payments')
      .select('*')
      .limit(1)

    if (checkError) {
      console.error("❌ Error checking payments table:", checkError.message)
      return
    }

    const samplePayment = existingPayments?.[0]
    if (samplePayment) {
      console.log("📋 Current payment structure:")
      console.log(Object.keys(samplePayment).join(', '))
      
      // Check if confirmation fields already exist
      const hasConfirmationFields = 'confirmationStatus' in samplePayment || 'confirmation_status' in samplePayment
      if (hasConfirmationFields) {
        console.log("✅ Confirmation fields already exist in the payments table!")
        return
      }
    }

    console.log("⚠️  Direct SQL execution not available through Supabase client.")
    console.log("📋 Please execute the following SQL manually in Supabase Dashboard:")
    console.log("\n" + "=".repeat(80))
    console.log("-- Add payment confirmation fields")
    console.log("ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'confirmado';")
    console.log("ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;")
    console.log("ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_by UUID;")
    console.log("ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;")
    console.log("ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;")
    console.log("")
    console.log("-- Create enum type for confirmation status")
    console.log("DO $$ BEGIN")
    console.log("  CREATE TYPE payment_confirmation_status AS ENUM ('pendiente', 'confirmado', 'rechazado');")
    console.log("EXCEPTION")
    console.log("  WHEN duplicate_object THEN null;")
    console.log("END $$;")
    console.log("")
    console.log("-- Update column to use enum")
    console.log("ALTER TABLE payments ALTER COLUMN confirmation_status TYPE payment_confirmation_status USING confirmation_status::payment_confirmation_status;")
    console.log("")
    console.log("-- Update existing payments to confirmed status")
    console.log("UPDATE payments SET confirmation_status = 'confirmado' WHERE confirmation_status IS NULL;")
    console.log("")
    console.log("-- Create indexes")
    console.log("CREATE INDEX IF NOT EXISTS idx_payments_confirmation_status ON payments(confirmation_status);")
    console.log("CREATE INDEX IF NOT EXISTS idx_payments_confirmed_by ON payments(confirmed_by);")
    console.log("CREATE INDEX IF NOT EXISTS idx_payments_confirmed_at ON payments(confirmed_at);")
    console.log("=".repeat(80))
    
    console.log("\n📝 Instructions:")
    console.log("1. Go to your Supabase Dashboard")
    console.log("2. Navigate to SQL Editor")
    console.log("3. Copy and paste the SQL above")
    console.log("4. Execute the script")
    console.log("5. Verify the changes in the Table Editor")

  } catch (error) {
    console.error("💥 Unexpected error:", error)
    process.exit(1)
  }
}

addPaymentConfirmationFields()