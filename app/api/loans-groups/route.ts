import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache"

export async function POST(req: NextRequest) {
  try {
    const regular = await createClient()
    const {
      data: { user },
      error: authError,
    } = await regular.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { group_id, loans, total_amount } = body

    if (!group_id || !Array.isArray(loans) || loans.length === 0 || total_amount === undefined) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const admin = await createClient({ admin: true })
    const { data, error } = await admin
      .from("loans_groups")
      .insert({ group_id, loans, total_amount })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const regular = await createClient()
    const {
      data: { user },
      error: authError,
    } = await regular.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const groupId = url.searchParams.get("groupId")

    const admin = await createClient({ admin: true })
    let query = admin
      .from("loans_groups")
      .select("id, group_id, loans, total_amount, created_at, group:grupos(nombre)")
      .order("created_at", { ascending: false })

    if (groupId) {
      query = query.eq("group_id", groupId)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const responseData = data || []
    return NextResponse.json(responseData, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
