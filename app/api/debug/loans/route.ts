import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Check loans table
    const { data: loans, error: loansError } = await supabase
      .from("loans")
      .select("*")
      .limit(10)

    // Check clients table
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, email")
      .limit(5)

    // Check payment_schedule table
    const { data: schedules, error: schedulesError } = await supabase
      .from("payment_schedule")
      .select("id, loan_id")
      .limit(5)

    console.log("[DEBUG] Database check:")
    console.log("- Loans:", loans?.length || 0, "records")
    console.log("- Clients:", clients?.length || 0, "records") 
    console.log("- Payment schedules:", schedules?.length || 0, "records")

    return NextResponse.json({ 
      loans: {
        count: loans?.length || 0,
        data: loans || [],
        error: loansError
      },
      clients: {
        count: clients?.length || 0,
        data: clients || [],
        error: clientsError
      },
      payment_schedules: {
        count: schedules?.length || 0,
        data: schedules || [],
        error: schedulesError
      }
    })

  } catch (error) {
    console.error("[DEBUG] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}