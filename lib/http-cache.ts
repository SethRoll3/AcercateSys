import crypto from "crypto"

type CacheInput = {
  body: string | Buffer
  lastModified?: Date | string
  cacheControl: string
}

export function stableJsonStringify(input: any): string {
  return JSON.stringify(sortKeysDeep(input))
}

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort()
    const obj: any = {}
    for (const k of keys) obj[k] = sortKeysDeep(value[k])
    return obj
  }
  return value
}

export function computeETag(body: string | Buffer, weak = false): string {
  const hash = crypto.createHash("sha256").update(body).digest("hex")
  return weak ? `W/"${hash}"` : `"${hash}"`
}

export function formatHttpDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toUTCString()
}

export function latestUpdatedAt(rows: any): Date | undefined {
  const list = Array.isArray(rows) ? rows : [rows]
  let latest: number | undefined
  for (const r of list) {
    const candidates = [
      r?.updated_at, r?.updatedAt, r?.created_at, r?.createdAt, r?.end_date, r?.start_date,
    ].filter(Boolean)
    for (const c of candidates) {
      const t = new Date(c).getTime()
      if (!Number.isNaN(t)) latest = latest === undefined ? t : Math.max(latest, t)
    }
  }
  return latest ? new Date(latest) : undefined
}

export function buildCacheHeaders({ body, lastModified, cacheControl }: CacheInput): Record<string, string> {
  const etag = computeETag(typeof body === "string" ? body : body.toString("utf8"))
  const lm = lastModified ? formatHttpDate(lastModified) : formatHttpDate(new Date())
  return {
    ETag: etag,
    "Last-Modified": lm,
    "Cache-Control": cacheControl,
  }
}

export function isNotModified(req: Request, { etag, lastModified }: { etag: string; lastModified: string }): boolean {
  const inm = req.headers.get("if-none-match")
  const ims = req.headers.get("if-modified-since")
  if (inm && inm === etag) return true
  if (ims && ims === lastModified) return true
  return false
}

