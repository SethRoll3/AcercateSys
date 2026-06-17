import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getLogoDataUrl, htmlToPdfResponse, reportCSS, fmtQ } from '@/lib/pdf-report-helpers'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { id } = await context.params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch loan data
    const { data: loan, error: le } = await admin
      .from('loans')
      .select('*, client:clients(*)')
      .eq('id', id)
      .single()

    if (le || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    const client = Array.isArray(loan.client) ? loan.client[0] : loan.client

    // Ciclo en la cooperativa (how many loans this client has)
    const { count: cycleCount } = await admin
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .lte('created_at', loan.created_at) // include this loan and previous ones

    const ciclo = cycleCount || 1

    const logo = await getLogoDataUrl()
    const now = new Date()

    const clientFullName = `${client.first_name} ${client.last_name}`
    const plazoText = loan.payment_frequency === 'quincenal' 
      ? `${loan.term_months} quincenas` 
      : `${loan.term_months} meses`
    
    const blueText = "Autorizado según resolución INGECOP-SRD-997-2021 GUATEMALA 09 DE NOVIEMBRE DE 2021 NUMERACIÓN ES DEL 101 AL 5000 FECHA DE AUTORIZACIÓN 08/11/2021 AUTORIZADO SEGÚN RESOLUCIÓN SAT 2021-1-61-1224484 Comercial LitoColor NIT: 427588-8 Tel: 5868-1342"

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${reportCSS}
      @page { size: letter portrait; margin: 20mm 15mm 20mm 25mm; }
      body { font-family: 'Helvetica', 'Arial', sans-serif; color: #000; line-height: 1.4; font-size: 11px; position: relative; }
      .header-container { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
      .logo-col { width: 20%; }
      .text-col { width: 50%; text-align: center; font-size: 11px; font-weight: bold; line-height: 1.2; }
      .box-col { width: 30%; text-align: right; }
      
      .acta-box { border: 1.5px solid #000; border-radius: 6px; padding: 6px; text-align: center; font-weight: bold; font-size: 11px; width: 180px; float: right; margin-bottom: 10px; }
      .folio { font-size: 14px; font-weight: bold; margin-top: 5px; clear: both; float: right; }
      .folio span { color: #dc2626; }
      
      .meta-container { display: flex; justify-content: space-between; margin-bottom: 20px; clear: both; }
      .meta-left { width: 50%; font-size: 11px; }
      .meta-right { width: 50%; font-size: 11px; }
      
      table.acta-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 9px; }
      table.acta-table th { background-color: #e2e8f0; color: #000; border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; }
      table.acta-table td { border: 1px solid #000; padding: 4px; text-align: center; }
      
      .signatures { margin-top: 100px; display: flex; justify-content: space-between; width: 100%; }
      .sig-box { width: 30%; text-align: center; font-size: 11px; font-weight: bold; }
      .sig-line { border-top: 1px solid #000; margin-bottom: 5px; width: 100%; }
      
      .blue-text { 
        margin-top: 40px;
        text-align: center;
        color: #1d4ed8; 
        font-size: 8px; 
      }
    </style></head><body>


      <div class="header-container">
        <div class="logo-col">
          ${logo ? `<img src="${logo}" style="max-width: 100%; height: auto;" />` : ''}
        </div>
        <div class="text-col">
          COOPERATIVA INTEGRAL DE AHORRO Y CREDITO<br/>
          "ACERCATE" R.L.<br/>
          7a. Avenida 12-23, Zona 9<br/>
          Edificio Etisa, 5to. Nivel, Oficina: 5.1<br/>
          Tel.: 2234-7509 • Guatemala, Guatemala<br/>
          Nit: 10571523-9
        </div>
        <div class="box-col">
          <div class="acta-box">ACTAS COMITÉ TÉCNICO DE CRÉDITOS</div>
          <div class="folio">FOLIO Nº <span>${loan.loan_number ? String(loan.loan_number).padStart(6, '0') : '000000'}</span></div>
        </div>
      </div>

      <div class="meta-container">
        <div class="meta-left">
          <strong>Fecha:</strong> ${now.getDate()} ${now.toLocaleString('es-GT', { month: 'long' })} ${now.getFullYear().toString().slice(-2)}<br/>
          <strong>Acta de comité número:</strong> ${now.getFullYear()}-${loan.loan_number || id.slice(0, 4)}
        </div>
        <div class="meta-right">
          <strong>Integrantes de comité:</strong><br/>
          Francisco Javier Castillo<br/>
          Francisco Urbano Castillo<br/>
          Angel Manolo Ramirez
        </div>
      </div>

      <div style="font-size: 11px; margin-bottom: 10px;">
        En Comité de Créditos celebrado en esta fecha se autorizan las siguientes operaciones
      </div>

      <table class="acta-table">
        <tr>
          ${client.group_name ? '<th>Grupo</th><th>Integrantes</th>' : '<th>Cliente</th>'}
          <th>Ciclo en la cooperativa</th>
          <th>DPI</th>
          <th>Score de buró</th>
          <th>Plazo (meses)</th>
          <th>Tasa de Interés</th>
          <th>Actividad Económica 1</th>
          <th>Monto autorizado</th>
          <th>Forma de pago</th>
        </tr>
        <tr>
          ${client.group_name ? `<td>${client.group_name}</td><td>${clientFullName}</td>` : `<td>${clientFullName}</td>`}
          <td>${ciclo}</td>
          <td>${client.dpi || 'N/D'}</td>
          <td>${client.score_buro || 'N/D'}</td>
          <td>${loan.term_months}</td>
          <td>${loan.interest_rate}% mensual</td>
          <td>${client.actividad_economica || 'N/D'}</td>
          <td>${fmtQ(loan.amount || 0)}</td>
          <td>${plazoText.charAt(0).toUpperCase() + plazoText.slice(1)}</td>
        </tr>
      </table>

      <div style="margin-top: 40px; font-size: 11px; font-weight: bold;">
        Notas:
      </div>

      <div style="margin-top: 30px; font-size: 11px; font-weight: bold;">
        Firmas
      </div>

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"></div>
          Francisco Javier Castillo
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          Francisco Urbano Castillo
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          Angel Manolo Ramirez
        </div>
      </div>

      <div class="blue-text">${blueText}</div>
    </body></html>`

    return htmlToPdfResponse(html, `Acta_Comite_${loan.loan_number}.pdf`, true)
  } catch (e: any) {
    console.error('[acta-pdf PDF]', e)
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}
