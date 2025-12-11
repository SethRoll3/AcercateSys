import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear } from "date-fns"

function toIso(date: Date) {
  return new Date(date).toISOString()
}

export async function GET(req: NextRequest) {
  try {
    const regular = await createClient()
    const admin = await createAdminClient()
    const url = new URL(req.url)

    const {
      data: { user },
    } = await regular.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: me } = await regular.from("users").select("id, role").eq("auth_id", user.id).single()
    if (!me || me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const page = Math.max(1, Number(url.searchParams.get("page") || 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 20)))
    const offset = (page - 1) * pageSize
    const orderDir = (url.searchParams.get("order") || "desc") === "asc" ? true : false

    const actorId = url.searchParams.get("actorId") || undefined
    const actionType = url.searchParams.get("actionType") || undefined
    const entityName = url.searchParams.get("entityName") || undefined
    const entityId = url.searchParams.get("entityId") || undefined
    const preset = url.searchParams.get("preset") || undefined
    const singleDate = url.searchParams.get("date") || undefined
    const dateStart = url.searchParams.get("dateStart") || undefined
    const dateEnd = url.searchParams.get("dateEnd") || undefined
    const hour = url.searchParams.get("hour") || undefined
    const hourStart = url.searchParams.get("hourStart") || undefined
    const hourEnd = url.searchParams.get("hourEnd") || undefined

    let startTs: string | undefined
    let endTs: string | undefined

    if (preset === "month") {
      const d = new Date()
      startTs = toIso(startOfMonth(d))
      endTs = toIso(endOfMonth(d))
    } else if (preset === "week") {
      const d = new Date()
      startTs = toIso(startOfWeek(d, { weekStartsOn: 1 }))
      endTs = toIso(endOfWeek(d, { weekStartsOn: 1 }))
    } else if (preset === "year") {
      const d = new Date()
      startTs = toIso(startOfYear(d))
      endTs = toIso(endOfYear(d))
    }

    if (singleDate) {
      const d = parseISO(singleDate)
      const y = d.getFullYear()
      const m = d.getMonth()
      const base = new Date(Date.UTC(y, m, d.getDate(), 0, 0, 0))
      if (hour) {
        const [hh, mm] = hour.split(":").map(Number)
        const s = new Date(base)
        s.setUTCHours(hh, mm, 0, 0)
        const e = new Date(s)
        e.setUTCHours(hh, mm, 59, 999)
        startTs = toIso(s)
        endTs = toIso(e)
      } else if (hourStart && hourEnd) {
        const [h1, m1] = hourStart.split(":").map(Number)
        const [h2, m2] = hourEnd.split(":").map(Number)
        const s = new Date(base)
        s.setUTCHours(h1, m1, 0, 0)
        const e = new Date(base)
        e.setUTCHours(h2, m2, 59, 999)
        if (e < s) return NextResponse.json({ error: "Invalid hour range" }, { status: 400 })
        startTs = toIso(s)
        endTs = toIso(e)
      } else {
        const s = new Date(base)
        const e = new Date(base)
        e.setUTCHours(23, 59, 59, 999)
        startTs = toIso(s)
        endTs = toIso(e)
      }
    }

    if (dateStart && dateEnd) {
      const s = parseISO(dateStart)
      const e = parseISO(dateEnd)
      if (e < s) return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
      startTs = toIso(s)
      endTs = toIso(e)
    }

    // No logging for viewing logs

    let countQuery = admin.from("logs").select("id", { count: "exact", head: true }).neq("entity_name", "logs")
    let dataQuery = admin.from("logs").select("*").order("action_at", { ascending: orderDir }).neq("entity_name", "logs")

    if (actorId) {
      countQuery = countQuery.eq("actor_user_id", actorId)
      dataQuery = dataQuery.eq("actor_user_id", actorId)
    }
    if (actionType) {
      countQuery = countQuery.eq("action_type", actionType)
      dataQuery = dataQuery.eq("action_type", actionType)
    }
    if (entityName) {
      countQuery = countQuery.eq("entity_name", entityName)
      dataQuery = dataQuery.eq("entity_name", entityName)
    }
    if (entityId) {
      countQuery = countQuery.eq("entity_id", entityId)
      dataQuery = dataQuery.eq("entity_id", entityId)
    }
    if (startTs) {
      countQuery = countQuery.gte("action_at", startTs)
      dataQuery = dataQuery.gte("action_at", startTs)
    }
    if (endTs) {
      countQuery = countQuery.lte("action_at", endTs)
      dataQuery = dataQuery.lte("action_at", endTs)
    }

    const { count } = await countQuery
    const { data, error } = await dataQuery.range(offset, offset + pageSize - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize })
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
