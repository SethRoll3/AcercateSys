import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { htmlToPdfResponse, fmtQ } from '@/lib/pdf-report-helpers'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { id } = await context.params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: loan, error: le } = await admin
      .from('loans')
      .select('*, client:clients(*)')
      .eq('id', id)
      .single()

    if (le || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    const client = Array.isArray(loan.client) ? loan.client[0] : loan.client

    const { data: firstSchedule } = await admin
      .from('payment_schedule')
      .select('amount, principal, interest, admin_fees')
      .eq('loan_id', id)
      .order('payment_number', { ascending: true })
      .limit(1)
      .maybeSingle()

    const isQuincenal = loan.payment_frequency === 'quincenal'
    const clientFullName = `${client.first_name} ${client.last_name}`
    const plazoText = isQuincenal
      ? `${loan.term_months} quincenas`
      : `${loan.term_months} meses`
    const formaPagoText = isQuincenal ? 'Quincenal' : 'Mensual'
    const cuotaLabel = isQuincenal ? 'Cuota quincenal' : 'Cuota mensual'

    const dateParam = new URL(request.url).searchParams.get('date')
    let actaDate = new Date()
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const parsed = new Date(`${dateParam}T12:00:00`)
      if (!isNaN(parsed.getTime())) actaDate = parsed
    }
    const fechaValor = `${actaDate.getDate()} ${actaDate.toLocaleString('es-GT', { month: 'long' })} ${actaDate.getFullYear().toString().slice(-2)}`

    const cuotaTotal = firstSchedule
      ? Number(firstSchedule.amount) || (Number(firstSchedule.principal || 0) + Number(firstSchedule.interest || 0) + Number(firstSchedule.admin_fees || 0))
      : Number(loan.monthly_payment || 0)
    const capitalCuota = firstSchedule ? Number(firstSchedule.principal || 0) : 0
    const interesCuota = firstSchedule ? Number(firstSchedule.interest || 0) : 0
    const adminCuota = firstSchedule ? Number(firstSchedule.admin_fees || 0) : 0

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      @page { size: legal landscape; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Helvetica', 'Arial', sans-serif;
        color: #000;
        font-size: 11px;
        line-height: 1.4;
        padding: 60mm 15mm 12mm 25mm;
        position: relative;
      }
      .fecha-valor {
        position: absolute;
        top: 48mm;
        left: 27mm;
        font-size: 11px;
      }
      .intro {
        margin-bottom: 6px;
        text-align: justify;
      }
      table.acta {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }
      table.acta th {
        background: #e2e8f0;
        color: #000;
        border: 1px solid #fff;
        padding: 3px 6px;
        font-weight: bold;
        text-align: center;
      }
      table.acta td {
        background: #fff;
        border: 1px solid #fff;
        padding: 3px 6px;
        text-align: center;
      }
      .desglose {
        margin-top: 6px;
        width: 55%;
        border-collapse: collapse;
        font-size: 10px;
      }
      .desglose th {
        background: #e2e8f0;
        color: #000;
        border: 1px solid #fff;
        padding: 3px 6px;
        font-weight: bold;
        text-align: left;
      }
      .desglose th.monto {
        text-align: center;
      }
      .desglose td {
        background: #fff;
        border: 1px solid #fff;
        padding: 3px 6px;
      }
      .desglose td.monto {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .firmas {
        display: flex;
        justify-content: space-between;
        width: 100%;
        margin-top: 220px;
      }
      .firma-box {
        width: 30%;
        text-align: center;
        font-size: 11px;
      }
      .firma-line {
        border-top: 1px solid #000;
        margin-bottom: 4px;
        width: 100%;
      }
      .firma-nombre {
        font-weight: bold;
      }
    </style></head><body>

      <div class="fecha-valor">${fechaValor}</div>

      <div class="intro">En Comité de Créditos celebrado en esta fecha se autorizan las siguientes operaciones</div>

      <table class="acta">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Plazo</th>
            <th>Tasa de Interés</th>
            <th>Monto autorizado</th>
            <th>Forma de pago</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${clientFullName}</td>
            <td>${plazoText.charAt(0).toUpperCase() + plazoText.slice(1)}</td>
            <td>${loan.interest_rate}% mensual</td>
            <td>${fmtQ(loan.amount || 0)}</td>
            <td>${formaPagoText}</td>
          </tr>
        </tbody>
      </table>

      <table class="desglose">
        <thead>
          <tr>
            <th>Desglose de la ${cuotaLabel.toLowerCase()}</th>
            <th class="monto">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${cuotaLabel}</td>
            <td class="monto">${fmtQ(cuotaTotal)}</td>
          </tr>
          <tr>
            <td>Capital</td>
            <td class="monto">${fmtQ(capitalCuota)}</td>
          </tr>
          <tr>
            <td>Interés</td>
            <td class="monto">${fmtQ(interesCuota)}</td>
          </tr>
          <tr>
            <td>Gastos administrativos</td>
            <td class="monto">${fmtQ(adminCuota)}</td>
          </tr>
        </tbody>
      </table>

      <div class="firmas">
        <div class="firma-box">
          <div class="firma-line"></div>
          <div class="firma-nombre">Hugo Romeo Barrios</div>
        </div>
        <div class="firma-box">
          <div class="firma-line"></div>
          <div class="firma-nombre">Francisco Urbano Castillo</div>
        </div>
        <div class="firma-box">
          <div class="firma-line"></div>
          <div class="firma-nombre">Francisco Javier Castillo</div>
        </div>
      </div>
    </body></html>`

    return htmlToPdfResponse(html, `Acta_Comite_${loan.loan_number}.pdf`, true)
  } catch (e: any) {
    console.error('[acta-pdf PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
