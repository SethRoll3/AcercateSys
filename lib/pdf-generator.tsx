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
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(amount)

  const formatDate = (date: string) => {
    if (!date) return "___/___/______"
    const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(date)
    const dt = isYMD ? parseYMDToUTC(date) : new Date(date)
    const d = dt.getUTCDate().toString().padStart(2, "0")
    const m = (dt.getUTCMonth() + 1).toString().padStart(2, "0")
    const y = dt.getUTCFullYear()
    return `${d}/${m}/${y}`
  }

  const safe = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "—"
    if (typeof value === "string" && value.trim() === "") return "—"
    return String(value)
  }

  const logoDataUrl = branding?.logo || null
  const logoIconDataUrl = branding?.logoIcon || null

  // Pick the best logo available
  const logoSrc = logoDataUrl || logoIconDataUrl || null

  // Generate a receipt number string formatted like the physical one
  const receiptNo = payment.receiptNumber
    ? String(payment.receiptNumber).padStart(5, "0")
    : String(payment.id || "00000").slice(-5).padStart(5, "0")

  const clientName = `${safe(loan.client?.first_name)} ${safe(loan.client?.last_name)}`.trim()
  const clientPhone = safe(loan.client?.phone)

  const boletas = payment.boletas || []

  // ── helper for a single receipt slip (we print 2 per page: original + copia) ──
  const slip = (copy: "ORIGINAL CLIENTE" | "COPIA COOPERATIVA") => `
  <div class="slip">
    <!-- LEFT VERTICAL STRIPE -->
    <div class="stripe">
      <div class="stripe-text">BOLETA DE TRANSACCIONES</div>
    </div>

    <!-- MAIN CONTENT -->
    <div class="main">
      <!-- TOP BAR: coop info + serie/number -->
      <div class="top-bar">
        <div class="coop-info">
          <div class="coop-name">COOPERATIVA INTEGRAL DE AHORRO Y CRÉDITO</div>
          <div class="coop-name">ACERCATE, RESPONSABILIDAD LIMITADA</div>
          <div class="coop-detail">7a. AVENIDA 12-23 ZONA 9 EDIFICIO ETISA</div>
          <div class="coop-detail">5o. NIVEL OF. 51 GUATEMALA</div>
          <div class="coop-detail">NIT: 105715239 &nbsp; TEL: 2234-7509</div>
        </div>
        <div class="serie-box">
          <div class="serie-label">SERIE A</div>
          <div class="serie-no">No. ${receiptNo}</div>
        </div>
      </div>

      <!-- LOGO CENTERED -->
      <div class="logo-area">
        ${logoSrc ? `<img src="${logoSrc}" class="logo-img" alt="Acercate" />` : `<div class="logo-text">acercate</div>`}
      </div>

      <!-- FORM FIELDS -->
      <div class="fields">
        <div class="field-row">
          <span class="field-label">Fecha:</span>
          <span class="field-value field-line">${formatDate(payment.paymentDate || payment.createdAt || "")}</span>
          <span class="field-label" style="margin-left:12px;">No. Préstamo:</span>
          <span class="field-value field-line">${safe(loan.loanNumber)}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Cliente:</span>
          <span class="field-value field-line full">${clientName}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Teléfono:</span>
          <span class="field-value field-line">${clientPhone}</span>
          <span class="field-label" style="margin-left:12px;">Forma de pago:</span>
          <span class="field-value field-line">${safe(payment.paymentMethod)}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Cuota(s):</span>
          <span class="field-value field-line">Préstamo #${safe(loan.loanNumber)}</span>
          <span class="field-label" style="margin-left:12px;">Estado:</span>
          <span class="field-value field-line">${safe(payment.confirmationStatus === 'aprobado' ? 'Aprobado' : payment.confirmationStatus === 'rechazado' ? 'Rechazado' : 'Pendiente')}</span>
        </div>

        <!-- AMOUNT BOX -->
        <div class="amount-section">
          <div class="amount-label">MONTO RECIBIDO</div>
          <div class="amount-value">${formatCurrency(Number(payment.amount) || 0)}</div>
        </div>

        ${boletas.length > 0 ? `
        <div class="boletas-mini">
          <div class="boleta-mini-header">Boletas / Referencias:</div>
          ${boletas.map(b => `
            <div class="boleta-mini-row">
              <span>${safe(b.numeroBoleta)}</span>
              <span>${safe(b.banco)}</span>
              <span>${safe(b.referencia)}</span>
              <span style="font-weight:700;">${formatCurrency(Number(b.monto) || 0)}</span>
            </div>
          `).join("")}
        </div>
        ` : ""}

        ${payment.notes ? `
        <div class="field-row" style="margin-top:4px;">
          <span class="field-label">Obs.:</span>
          <span class="field-value field-line full">${safe(payment.notes)}</span>
        </div>
        ` : ""}
      </div>

      <!-- SIGNATURES -->
      <div class="signatures">
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-lbl">Firma del Socio / Cliente</div>
        </div>
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-lbl">Firma y Sello Autorizado</div>
        </div>
      </div>

      <!-- COPY LABEL -->
      <div class="copy-label">${copy}</div>

      <!-- AUTHORIZATION FOOTER TEXT (small, like physical) -->
      <div class="auth-text">
        AUTORIZADO SEGÚN RESOLUCIÓN No. INACOP-GALF-CBN-2023 DE LA FECHA 14 DE SEPTIEMBRE DE 2023.
        FORMULARIOS STANDARD, 8, A, PBX: 2425-8900 · NIT: 125023-1 · S-200 · 08/2023 DEL No. A-0,001 AL No. A-10,000
      </div>
    </div>
  </div>`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 215mm 279mm; margin: 8mm; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
      color: #000;
      width: 100%;
    }

    /* ── each slip takes ~half the page ── */
    .slip {
      display: flex;
      flex-direction: row;
      width: 100%;
      border: 1px solid #ccc;
      margin-bottom: 8px;
      min-height: 130mm;
    }

    /* LEFT STRIPE */
    .stripe {
      width: 18px;
      background: #1a3a6b;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .stripe-text {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      color: white;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* MAIN */
    .main {
      flex: 1;
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* TOP BAR */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #1a3a6b;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .coop-name {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.3;
    }
    .coop-detail {
      font-size: 7px;
      color: #333;
      line-height: 1.4;
    }
    .serie-box {
      text-align: right;
      flex-shrink: 0;
      margin-left: 8px;
    }
    .serie-label {
      font-size: 9px;
      font-weight: 700;
      color: #1a3a6b;
    }
    .serie-no {
      font-size: 14px;
      font-weight: 900;
      color: #1a3a6b;
      letter-spacing: 0.5px;
    }

    /* LOGO */
    .logo-area {
      text-align: center;
      margin: 6px 0;
    }
    .logo-img {
      max-height: 55px;
      max-width: 160px;
      object-fit: contain;
    }
    .logo-text {
      font-size: 26px;
      font-weight: 900;
      color: #6db8d9;
      letter-spacing: 1px;
    }

    /* FORM FIELDS */
    .fields {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .field-row {
      display: flex;
      align-items: baseline;
      gap: 4px;
      flex-wrap: wrap;
    }
    .field-label {
      font-size: 8px;
      font-weight: 700;
      white-space: nowrap;
      color: #1a3a6b;
    }
    .field-value {
      font-size: 8.5px;
    }
    .field-line {
      border-bottom: 0.75px solid #555;
      flex: 1;
      min-width: 40px;
      padding-bottom: 1px;
    }
    .full { flex: 1 1 100%; }

    /* AMOUNT */
    .amount-section {
      background: #f0f5ff;
      border: 1.5px solid #1a3a6b;
      border-radius: 4px;
      text-align: center;
      padding: 6px;
      margin: 4px 0;
    }
    .amount-label {
      font-size: 8px;
      font-weight: 700;
      color: #1a3a6b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .amount-value {
      font-size: 20px;
      font-weight: 900;
      color: #1a3a6b;
    }

    /* BOLETAS MINI */
    .boletas-mini {
      border: 0.75px solid #ccc;
      border-radius: 3px;
      padding: 4px;
    }
    .boleta-mini-header {
      font-weight: 700;
      font-size: 7.5px;
      color: #1a3a6b;
      margin-bottom: 3px;
    }
    .boleta-mini-row {
      display: flex;
      gap: 8px;
      font-size: 7.5px;
      border-top: 0.5px solid #eee;
      padding-top: 2px;
    }

    /* SIGNATURES */
    .signatures {
      display: flex;
      gap: 16px;
      margin-top: 10px;
    }
    .sig-col { flex: 1; text-align: center; }
    .sig-line {
      border-top: 1px solid #000;
      margin-bottom: 3px;
      margin-top: 20px;
    }
    .sig-lbl { font-size: 7.5px; color: #333; }

    /* COPY LABEL */
    .copy-label {
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1a3a6b;
      margin-top: 4px;
      letter-spacing: 0.5px;
    }

    /* AUTH TEXT */
    .auth-text {
      font-size: 5.5px;
      color: #777;
      text-align: center;
      margin-top: 4px;
      line-height: 1.4;
    }

    /* Dashed separator between slips */
    .slip-separator {
      border-top: 1.5px dashed #999;
      margin: 4px 0 8px;
      text-align: center;
    }
  </style>
</head>
<body>
  ${slip("ORIGINAL CLIENTE")}
  <div class="slip-separator"></div>
  ${slip("COPIA COOPERATIVA")}
</body>
</html>`

  return html
}
