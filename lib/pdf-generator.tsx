import type { Payment, Loan, Client } from "./types"
import { parseYMDToUTC } from "./utils"

type ReceiptBranding = {
  coopName?: string
  logo?: string | null
  logoIcon?: string | null
  officeLine1?: string
  officeLine2?: string
  series?: string
  footerLabel?: string
  colors?: {
    primary?: string
    secondary?: string
    text?: string
  }
}

export function generatePaymentReceipt(
  payment: Payment,
  loan: Loan & { client: Client },
  branding?: ReceiptBranding
): string {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)

  const formatDateLong = (date: string) => {
    if (!date) return "-"
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(date)
    const dt = isYMD ? parseYMDToUTC(date) : new Date(date)
    return new Intl.DateTimeFormat("es-GT", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Guatemala",
    }).format(dt)
  }

  const formatDateShort = (date: string) => {
    if (!date) return "-"
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(date)
    const dt = isYMD ? parseYMDToUTC(date) : new Date(date)
    return new Intl.DateTimeFormat("es-GT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "America/Guatemala",
    }).format(dt)
  }

  const safe = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "-"
    if (typeof value === "string" && value.trim() === "") return "-"
    return String(value)
  }

  const escapeHtml = (value: string | number | null | undefined) =>
    safe(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")

  const boletas = payment.boletas || []
  const firstBoleta = boletas[0]
  const coopName = branding?.coopName || "COOPERATIVA ACÉRCATE"
  const officeLine1 = branding?.officeLine1 || "7a. AVENIDA 1-35 ZONA 8 EDIFICIO TECTONIC"
  const officeLine2 = branding?.officeLine2 || "NIVEL 1, OF. 1021 GUATEMALA"
  const series = branding?.series || "A"
  const footerLabel = branding?.footerLabel || "ORIGINAL CLIENTE"
  const brandPrimary = branding?.colors?.primary || "#113C8D"
  const brandSecondary = branding?.colors?.secondary || "#3B82F6"
  const brandText = branding?.colors?.text || "#0f172a"
  const logoDataUrl = branding?.logo || null
  const logoIconDataUrl = branding?.logoIcon || null
  const clientName = `${safe(loan.client.first_name)} ${safe(loan.client.last_name)}`.trim()
  const paymentDate = formatDateShort(payment.paymentDate || payment.createdAt)
  const paymentDateLong = formatDateLong(payment.paymentDate || payment.createdAt)
  const amount = Number(payment.amount) || 0
  const reference = firstBoleta?.referencia || payment.receiptNumber
  const bank = firstBoleta?.banco || payment.paymentMethod
  const phone = loan.client.phone || "-"
  const method = payment.paymentMethod || "-"
  const monthlyPayment = Number(loan.monthlyPayment) || 0

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { size: 228mm 108mm; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 228mm; height: 108mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: ${brandText}; background: white; }
          .receipt {
            width: 228mm;
            height: 108mm;
            display: grid;
            grid-template-columns: 9mm 17mm 1fr 9mm;
            border-top: 1px solid #d4d4d8;
            border-bottom: 1px solid #d4d4d8;
          }
          .holes {
            background:
              radial-gradient(circle at 50% 7px, #ffffff 2.35mm, transparent 2.45mm) center top / 100% 11.5mm repeat-y,
              radial-gradient(circle at 50% 7px, #9ca3af 2.45mm, transparent 2.55mm) center top / 100% 11.5mm repeat-y,
              #f3f4f6;
            border-left: 1px solid #e4e4e7;
            border-right: 1px solid #e4e4e7;
          }
          .band {
            position: relative;
            background: linear-gradient(180deg, #0b2b70, #123f98 55%, #1d4ed8);
            color: #ffffff;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
            display: flex;
            justify-content: center;
            align-items: center;
            letter-spacing: 1.1px;
            font-size: 10px;
            font-weight: 700;
            padding: 8px 0;
          }
          .content {
            position: relative;
            padding: 4.2mm 6.5mm 3.5mm 6.5mm;
            overflow: hidden;
          }
          .watermark {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0.17;
          }
          .watermark img {
            width: 58mm;
            height: auto;
          }
          .header {
            display: grid;
            grid-template-columns: 1fr auto;
            column-gap: 4mm;
            align-items: start;
            margin-bottom: 1mm;
          }
          .coop {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 2mm;
            align-items: start;
          }
          .coop-logo img {
            width: 8mm;
            height: auto;
          }
          .coop-name {
            font-size: 7.2px;
            font-weight: 700;
            line-height: 1.2;
            text-transform: uppercase;
          }
          .coop-line {
            font-size: 6.2px;
            line-height: 1.2;
            text-transform: uppercase;
          }
          .series {
            text-align: right;
            font-size: 8.5px;
            font-weight: 700;
            line-height: 1.2;
            text-transform: uppercase;
          }
          .serial {
            font-size: 32px;
            font-weight: 700;
            line-height: 1;
            letter-spacing: 0.4px;
          }
          .brand-center {
            text-align: center;
            margin-top: 2.8mm;
            margin-bottom: 3.8mm;
          }
          .brand-center-name {
            font-size: 11px;
            text-transform: lowercase;
            letter-spacing: 1px;
            color: ${brandPrimary};
            font-weight: 700;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1.6mm 2.8mm;
            align-items: end;
          }
          .field {
            border-bottom: 1px dotted #3f3f46;
            min-height: 6mm;
            padding-bottom: 0.65mm;
          }
          .label {
            font-size: 6px;
            text-transform: uppercase;
            color: #334155;
            letter-spacing: 0.3px;
            margin-bottom: 0.4mm;
          }
          .value {
            font-size: 8.2px;
            font-weight: 700;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .value.mono {
            font-family: "Courier New", Courier, monospace;
            letter-spacing: 0.2px;
          }
          .foot {
            margin-top: 2.1mm;
            text-align: center;
            font-size: 6.7px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }
          .foot2 {
            margin-top: 0.8mm;
            text-align: center;
            font-size: 5.8px;
            text-transform: uppercase;
            color: #475569;
            letter-spacing: 0.25px;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="holes"></div>
          <div class="band">BOLETA DE TRANSACCIONES</div>
          <div class="content">
            ${logoIconDataUrl ? `
              <div class="watermark">
                <img src="${logoIconDataUrl}" alt="logo marca" />
              </div>
            ` : ""}
            <div class="header">
              <div class="coop">
                <div class="coop-logo">${logoIconDataUrl || logoDataUrl ? `<img src="${logoIconDataUrl || logoDataUrl}" alt="logo ${escapeHtml(coopName)}" />` : ""}</div>
                <div>
                  <div class="coop-name">${escapeHtml(coopName)}</div>
                  <div class="coop-line">${escapeHtml(officeLine1)}</div>
                  <div class="coop-line">${escapeHtml(officeLine2)}</div>
                </div>
              </div>
              <div class="series">
                <div>SERIE ${escapeHtml(series)}</div>
                <div class="serial">${escapeHtml(payment.receiptNumber)}</div>
              </div>
            </div>
            <div class="brand-center">
              <div class="brand-center-name">acercate</div>
            </div>
            <div class="grid">
              <div class="field">
                <div class="label">Asociado No.</div>
                <div class="value mono">${escapeHtml(loan.client.id)}</div>
              </div>
              <div class="field">
                <div class="label">Nombre</div>
                <div class="value">${escapeHtml(clientName)}</div>
              </div>
              <div class="field">
                <div class="label">Préstamo</div>
                <div class="value mono">${escapeHtml(loan.loanNumber)}</div>
              </div>
              <div class="field">
                <div class="label">Fecha de pago</div>
                <div class="value">${escapeHtml(paymentDate)}</div>
              </div>
              <div class="field">
                <div class="label">Monto</div>
                <div class="value">${escapeHtml(formatCurrency(amount))}</div>
              </div>
              <div class="field">
                <div class="label">Cuota mensual</div>
                <div class="value">${escapeHtml(formatCurrency(monthlyPayment))}</div>
              </div>
              <div class="field">
                <div class="label">Concepto</div>
                <div class="value">PAGO DE CUOTA</div>
              </div>
              <div class="field">
                <div class="label">Banco / Método</div>
                <div class="value">${escapeHtml(bank)}</div>
              </div>
              <div class="field">
                <div class="label">Forma de pago</div>
                <div class="value">${escapeHtml(method)}</div>
              </div>
              <div class="field">
                <div class="label">Referencia</div>
                <div class="value mono">${escapeHtml(reference)}</div>
              </div>
              <div class="field">
                <div class="label">Teléfono</div>
                <div class="value mono">${escapeHtml(phone)}</div>
              </div>
              <div class="field" style="grid-column: span 3;">
                <div class="label">Detalle</div>
                <div class="value">${escapeHtml(`Pago registrado el ${paymentDateLong}`)}</div>
              </div>
            </div>
            <div class="foot">${escapeHtml(footerLabel)}</div>
            <div class="foot2">DOCUMENTO GENERADO AUTOMÁTICAMENTE POR EL SISTEMA</div>
          </div>
          <div class="holes"></div>
        </div>
      </body>
    </html>
  `

  return html
}
