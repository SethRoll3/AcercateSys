/**
 * Shared utilities for generating PDF reports via Puppeteer.
 * Provides consistent branding, colors, and HTML templates.
 */
import puppeteer from 'puppeteer'
import path from 'path'
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'

// ─── Logo helper ───
export async function getLogoDataUrl(): Promise<string | null> {
  const publicDir = path.join(process.cwd(), 'public')
  const candidates = [
    'logoCooperativa.jpg',
    'logoCooperativaConTexto.jpg',
    'logoCooperativaSinTexto.jpg',
    'logoCooperativaSinTexto.png',
    'logoCooperativaSinTextoSinFondo.png',
    'logoCooperativa.png',
  ]
  for (const name of candidates) {
    try {
      const p = path.join(publicDir, name)
      const data = await fs.readFile(p)
      const base64 = Buffer.from(data).toString('base64')
      const ext = path.extname(p).toLowerCase()
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${base64}`
    } catch {}
  }
  return null
}

// ─── HTML to PDF ───
export async function htmlToPdfResponse(
  html: string,
  filename: string,
  landscape = false,
): Promise<NextResponse> {
  let browser
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    const puppeteerCore = await import("puppeteer-core")
    const sparticuzChromium = (await import("@sparticuz/chromium")).default as any
    browser = await puppeteerCore.launch({
      args: sparticuzChromium.args,
      defaultViewport: sparticuzChromium.defaultViewport,
      executablePath: await sparticuzChromium.executablePath(),
      headless: sparticuzChromium.headless,
    })
  } else {
    // Local dev uses standard puppeteer
    const puppeteer = await import("puppeteer")
    browser = await puppeteer.default.launch({ headless: true })
  }

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape,
      printBackground: true,
      margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
    })
    const pdfBytes = new Uint8Array(pdfBuffer)
    const headers = new Headers()
    headers.append('Content-Type', 'application/pdf')
    headers.append('Content-Disposition', `attachment; filename="${filename}"`)
    return new NextResponse(pdfBytes, { headers })
  } finally {
    await browser.close()
  }
}

// ─── Date range label ───
export function dateRangeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return 'Todos los datos (sin filtro de fecha)'
  if (from && to) return `Del ${fmtDate(from)} al ${fmtDate(to)}`
  if (from) return `Desde ${fmtDate(from)}`
  return `Hasta ${fmtDate(to!)}`
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

// ─── Shared CSS for PDF reports ───
export const reportCSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; padding: 24px; color: #1e293b; font-size: 11px; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-logo { height: 40px; width: auto; }
  .header-title { font-size: 20px; font-weight: 800; color: #2563EB; }
  .header-sub { font-size: 10px; color: #64748b; }
  .divider { height: 3px; background: linear-gradient(90deg, #2563EB, #3B82F6); border-radius: 3px; margin-bottom: 14px; }
  .meta { font-size: 10px; color: #64748b; margin-bottom: 14px; }
  .section-title { font-size: 13px; font-weight: 700; color: #1e293b; margin: 14px 0 8px; text-transform: uppercase; letter-spacing: 0.3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #2563EB; color: #fff; font-weight: 700; text-align: center; padding: 6px 8px; font-size: 9px; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .client-bar { background: #1E3A5F; color: #fff; padding: 6px 12px; font-weight: 700; font-size: 12px; margin-top: 10px; border-radius: 4px; }
  .loan-bar { background: #374151; color: #fff; padding: 4px 12px; font-weight: 600; font-size: 10px; margin-top: 4px; border-radius: 2px; }
  .summary-box { background: #059669; color: #fff; padding: 8px 14px; font-size: 14px; font-weight: 700; margin-top: 18px; border-radius: 4px; }
  .summary-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e2e8f0; }
  .summary-label { font-weight: 600; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .currency { text-align: right; white-space: nowrap; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #94a3b8; }
`

// ─── Currency formatter ───
export function fmtQ(n: number): string {
  return `Q${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtDateGT(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
