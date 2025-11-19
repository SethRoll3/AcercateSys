import type { Payment, Loan, Client } from "./types"
import { parseYMDToUTC } from "./utils"

type ReceiptBranding = {
  coopName?: string
  logo?: string | null // dataURL
  logoIcon?: string | null // dataURL
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
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  const formatDate = (date: string) => {
    if (!date) return "N/A"
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(date)
    const dt = isYMD ? parseYMDToUTC(date) : new Date(date)
    return new Intl.DateTimeFormat("es-GT", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Guatemala",
    }).format(dt)
  }

  const safe = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "N/A"
    if (typeof value === "string" && value.trim() === "") return "N/A"
    return String(value)
  }

  const boletas = payment.boletas || []
  const images = [
    ...(payment.receiptImageUrl ? [{ url: payment.receiptImageUrl, caption: "Recibo del pago" }] : []),
    ...boletas.filter(b => !!b.imageUrl).map(b => ({ url: b.imageUrl!, caption: `Boleta ${safe(b.numeroBoleta)}` }))
  ]

  const totalBoletas = boletas.reduce((sum, b) => sum + (Number(b.monto) || 0), 0)

  // Paleta y marca
  const coopName = branding?.coopName || "acercate"
  const brandPrimary = branding?.colors?.primary || "#0ea5e9"
  const brandSecondary = branding?.colors?.secondary || "#38bdf8"
  const brandText = branding?.colors?.text || "#0f172a"
  const logoDataUrl = branding?.logo || null
  const logoIconDataUrl = branding?.logoIcon || null

  // Generate HTML for PDF (diseño mejorado)
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 28px; color: ${brandText}; }

          /* Encabezado */
          .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
          .brand-left { display: flex; align-items: center; gap: 12px; }
          .brand-title { font-size: 22px; font-weight: 800; color: ${brandPrimary}; letter-spacing: 0.4px; }
          .brand-sub { font-size: 11px; color: #64748b; }
          .divider { height: 3px; background: linear-gradient(90deg, ${brandPrimary}, ${brandSecondary}); border-radius: 3px; margin-bottom: 22px; }

          /* Títulos */
          .section-title { font-size: 14px; font-weight: 700; color: ${brandText}; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.3px; }

          /* Tarjetas de información */
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #ffffff; }
          .item { margin-bottom: 8px; }
          .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
          .value { font-size: 13px; font-weight: 600; color: #0f172a; }

          /* Resumen del pago */
          .summary { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin-bottom: 16px; }
          .amount-box { background: linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%); color: white; padding: 16px; border-radius: 12px; text-align: center; }
          .amount-label { font-size: 12px; opacity: 0.9; }
          .amount-value { font-size: 30px; font-weight: 800; letter-spacing: 0.5px; }

          /* Tabla Boletas */
          table { width: 100%; border-collapse: collapse; }
          .tbl { width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-top: 8px; }
          .tbl thead { background: #f8fafc; }
          .tbl th { text-align: left; font-size: 11px; color: #475569; padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .tbl td { font-size: 12px; padding: 10px; border-bottom: 1px solid #f1f5f9; }
          .tbl tfoot td { font-weight: 700; background: #f8fafc; }

          /* Imágenes (sin recortes) */
          .images { margin-top: 12px; }
          .image-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 12px; page-break-inside: avoid; }
          .image-title { font-size: 12px; color: #475569; margin-bottom: 8px; }
          .image-wrap { width: 100%; max-height: 720px; display: flex; align-items: center; justify-content: center; background: #ffffff; border-radius: 8px; overflow: hidden; }
          .image-wrap img { width: 100%; height: auto; object-fit: contain; }

          /* Notas y confirmación */
          .notes { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
          .muted { color: #64748b; }

          /* Firmas */
          .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }
          .sign-box { text-align: center; }
          .line { border-top: 2px solid ${brandText}; margin-bottom: 6px; padding-top: 6px; }

          /* Pie */
          .footer { margin-top: 18px; text-align: center; font-size: 11px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="brand">
          <div class="brand-left">
            ${logoDataUrl ? `<img src="${logoDataUrl}" alt="logo ${coopName}" style="height:36px; width:auto;" />` : (logoIconDataUrl ? `<img src="${logoIconDataUrl}" alt="logo ${coopName}" style="height:36px; width:auto;" />` : "")}
            <div>
              <div class="brand-title">${coopName.toUpperCase()}</div>
              <div class="brand-sub">Sistema de Gestión de Préstamos</div>
            </div>
          </div>
          <div class="value">Recibo: ${safe(payment.receiptNumber)}</div>
        </div>
        <div class="divider"></div>

        <div class="grid-2">
          <div class="card">
            <div class="section-title">Cliente</div>
            <div class="item"><div class="label">Nombre</div><div class="value">${safe(`${loan.client.first_name} ${loan.client.last_name}`)}</div></div>
            <div class="item"><div class="label">Teléfono</div><div class="value">${safe(loan.client.phone)}</div></div>
            <div class="item"><div class="label">Correo</div><div class="value">${safe(loan.client.email)}</div></div>
          </div>
          <div class="card">
            <div class="section-title">Préstamo</div>
            <div class="item"><div class="label">Número de préstamo</div><div class="value">${safe(loan.loanNumber)}</div></div>
            <div class="item"><div class="label">Cuota mensual</div><div class="value">${formatCurrency(Number(loan.monthlyPayment) || 0)}</div></div>
            <div class="item"><div class="label">Estado</div><div class="value">${safe(loan.status)}</div></div>
          </div>
        </div>

        <div class="summary">
          <div class="amount-box">
            <div class="amount-label">Monto Pagado</div>
            <div class="amount-value">${formatCurrency(Number(payment.amount) || 0)}</div>
          </div>
          <div class="card">
            <div class="section-title">Pago</div>
            <div class="item"><div class="label">Fecha de pago</div><div class="value">${formatDate(payment.paymentDate)}</div></div>
            <div class="item"><div class="label">Método</div><div class="value">${safe(payment.paymentMethod)}</div></div>
            <div class="item"><div class="label">Emitido</div><div class="value">${formatDate(payment.createdAt)}</div></div>
          </div>
        </div>

        ${boletas.length > 0 ? `
          <div class="card">
            <div class="section-title">Boletas asociadas</div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Banco</th>
                    <th>Referencia</th>
                    <th style="text-align:right;">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${boletas.map(b => `
                    <tr>
                      <td>${safe(b.numeroBoleta)}</td>
                      <td>${formatDate(b.fecha)}</td>
                      <td>${safe(b.banco)}</td>
                      <td>${safe(b.referencia)}</td>
                      <td style="text-align:right;">${formatCurrency(Number(b.monto) || 0)}</td>
                    </tr>
                  `).join("")}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4">Total boletas</td>
                    <td style="text-align:right;">${formatCurrency(totalBoletas)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ` : ""}

        ${images.length > 0 ? `
          <div class="section-title">Imágenes del pago y boletas</div>
          ${images.map(img => `
            <div class="image-card">
              <div class="image-title">${img.caption}</div>
              <div class="image-wrap">
                <img src="${img.url}" alt="${img.caption}" />
              </div>
            </div>
          `).join("")}
        ` : `
          <div class="notes"><span class="muted">No hay imágenes adjuntas.</span></div>
        `}

        ${payment.notes ? `
          <div class="notes" style="margin-top:12px;">
            <div class="section-title">Notas</div>
            <div class="value">${safe(payment.notes)}</div>
          </div>
        ` : ""}

        <div class="card" style="margin-top:12px;">
          <div class="section-title">Confirmación</div>
          <div class="grid-2">
            <div class="item"><div class="label">Estado</div><div class="value">${safe((payment.confirmationStatus || 'confirmado').toUpperCase())}</div></div>
            <div class="item"><div class="label">Aprobado por</div><div class="value">${safe(payment.confirmedBy)}</div></div>
            <div class="item"><div class="label">Fecha de aprobación</div><div class="value">${formatDate(payment.confirmedAt || '')}</div></div>
            ${payment.rejectionReason ? `<div class="item"><div class="label">Motivo de rechazo</div><div class="value">${safe(payment.rejectionReason)}</div></div>` : ''}
          </div>
        </div>

        <div class="signs">
          <div class="sign-box"><div class="line"></div><div class="muted">Firma del Cliente</div></div>
          <div class="sign-box"><div class="line"></div><div class="muted">Firma Autorizada</div></div>
        </div>

        <div class="footer">
          <div>Este documento es un comprobante oficial de pago.</div>
          <div>Generado el ${formatDate(new Date().toISOString())}</div>
        </div>
      </body>
    </html>
  `

  return html
}
