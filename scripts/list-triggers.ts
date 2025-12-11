
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function listTriggers() {
  console.log("🔍 Listing triggers...")

  const { data: triggers, error } = await supabase
    .from("information_schema.triggers")
    .select("trigger_name, event_manipulation, event_object_table, action_statement")
    .eq("trigger_schema", "public")

  if (error) {
    console.error("Error listing triggers:", error)
    return
  }

  console.log("Found triggers:")
  triggers.forEach(t => {
    console.log(`- Table: ${t.event_object_table} | Trigger: ${t.trigger_name} | Event: ${t.event_manipulation}`)
  })
}

listTriggers()
