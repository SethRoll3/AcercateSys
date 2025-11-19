import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { generatePaymentReceipt } from "@/lib/pdf-generator"
import puppeteer from "puppeteer"
import path from "path"
import { promises as fs } from "fs"
import { computeETag, formatHttpDate } from "@/lib/http-cache"

export async function GET(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  try {
    // Cliente con sesión del usuario (para auth y rol)
    const supabase = await createClient()
    // Cliente de servicio (service role) para evitar bloqueos RLS al leer datos del reporte
    const serviceSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { paymentId } = await params

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role and email
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Fetch payment with loan and client information (incluye advisor_email del cliente)
    // Usar cliente admin para asegurar lectura del pago independientemente de RLS
    const { data: payment, error: paymentError } = await serviceSupabase
      .from("payments")
      .select(`
        *,
        loan:loans (
          id, loan_number, amount, interest_rate, term_months, monthly_payment, status, start_date, end_date, created_at, updated_at, client_id,
          client:clients (
            id,
            first_name,
            last_name,
            phone,
            email,
            advisor_id,
            created_at,
            updated_at,
            advisor:users!advisor_id(email, full_name)
          )
        )
      `)
      .eq("id", paymentId)
      .single()

    if (paymentError) {
      console.error('[RECEIPT_API] Error fetching payment:', paymentError)
      return NextResponse.json({ error: "Error fetching payment" }, { status: 500 })
    }
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    // Apply role-based access control
    if (userData.role === 'cliente') {
      // Clients can only access receipts for their own payments
      if (payment.loan.client.email !== userData.email) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    } else if (userData.role === 'asesor') {
      // Advisors pueden acceder solo si el cliente del pago les pertenece
      // Verificación robusta contra la vista advisor_clients
      const { data: acRow, error: acError } = await serviceSupabase
        .from('advisor_clients')
        .select('advisor_id, advisor_email, client_id')
        .eq('client_id', payment.loan.client_id)
        .single()

      if (acError) {
        console.error('[RECEIPT_API] Error fetching advisor_clients row:', acError)
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }

      const matchesByEmail = acRow?.advisor_email === userData.email
      const matchesById = acRow?.advisor_id === userData.id
      if (!matchesByEmail && !matchesById) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }
    // Admins can access all receipts (no additional filtering)

    // Fetch boletas linked to this payment's schedule
    let boletas: any[] = []
    if (payment.schedule_id) {
      // También usar admin para lectura de enlaces y boletas
      const { data: cuotaBoletas, error: cbError } = await serviceSupabase
        .from("cuota_boletas")
        .select(`
          id,
          payment_schedule_id,
          boleta_id,
          created_at,
          boletas (
            id,
            numero_boleta,
            forma_pago,
            fecha,
            referencia,
            banco,
            monto,
            observaciones,
            created_at,
            created_by,
            image_url
          )
        `)
        .eq("payment_schedule_id", payment.schedule_id)
        .order("created_at", { ascending: false })

      if (cbError) {
        console.error('[RECEIPT_API] Error fetching cuota_boletas:', cbError)
      }
      boletas = (cuotaBoletas || []).map((cb: any) => ({
        id: cb.boletas.id,
        numeroBoleta: cb.boletas.numero_boleta,
        formaPago: cb.boletas.forma_pago,
        fecha: cb.boletas.fecha,
        referencia: cb.boletas.referencia,
        banco: cb.boletas.banco,
        monto: Number.parseFloat(cb.boletas.monto),
        observaciones: cb.boletas.observaciones,
        createdAt: cb.boletas.created_at,
        createdBy: cb.boletas.created_by,
        imageUrl: cb.boletas.image_url,
      }))
    }

    // Lookup approver full name if exists
    let approverName: string | null = null
    if (payment.confirmed_by) {
      // Buscar nombre del aprobador con admin para evitar bloqueos
      const { data: approver, error: approverError } = await serviceSupabase
        .from('users')
        .select('full_name, email')
        .eq('id', payment.confirmed_by)
        .single()
      if (approverError) {
        console.error('[RECEIPT_API] Error fetching approver:', approverError)
      }
      approverName = approver?.full_name || null
    }

    // Transform data to match expected format
    const transformedPayment = {
      id: payment.id,
      loanId: payment.loan_id,
      scheduleId: payment.schedule_id,
      amount: Number(payment.amount),
      paymentDate: payment.payment_date,
      receiptNumber: payment.receipt_number,
      paymentMethod: payment.payment_method,
      notes: payment.notes,
      confirmationStatus: payment.confirmation_status || 'confirmado',
      receiptImageUrl: payment.receipt_image_url,
      confirmedBy: approverName,
      confirmedAt: payment.confirmed_at,
      rejectionReason: payment.rejection_reason,
      createdAt: payment.created_at,
      boletas,
    }

    const transformedLoan = {
      id: payment.loan.id,
      // Map required Loan field userId to client_id to satisfy type
      userId: payment.loan.client_id,
      loanNumber: payment.loan.loan_number,
      amount: Number(payment.loan.amount),
      interestRate: Number(payment.loan.interest_rate),
      termMonths: payment.loan.term_months,
      monthlyPayment: Number(payment.loan.monthly_payment),
      status: payment.loan.status,
      startDate: payment.loan.start_date,
      endDate: payment.loan.end_date,
      createdAt: payment.loan.created_at,
      updatedAt: payment.loan.updated_at,
      client: {
        id: payment.loan.client.id,
        first_name: payment.loan.client.first_name,
        last_name: payment.loan.client.last_name,
        email: payment.loan.client.email,
        phone: payment.loan.client.phone,
        createdAt: payment.loan.client.created_at,
        updatedAt: payment.loan.client.updated_at,
      },
    }

    // Leer logos desde /public y convertir a dataURL para incrustar en el PDF
    const publicDir = path.join(process.cwd(), "public")
    const logoPath = path.join(publicDir, "logoCooperativa.jpg")
    const logoIconPath = path.join(publicDir, "logoCooperativaSinTexto.jpg")

    async function fileToDataUrl(p: string): Promise<string | null> {
      try {
        const data = await fs.readFile(p)
        const base64 = Buffer.from(data).toString("base64")
        const ext = path.extname(p).toLowerCase()
        const mime = ext === ".png" ? "image/png" : "image/jpeg"
        return `data:${mime};base64,${base64}`
      } catch {
        return null
      }
    }

    const [logoDataUrl, logoIconDataUrl] = await Promise.all([
      fileToDataUrl(logoPath),
      fileToDataUrl(logoIconPath),
    ])

    const brandedHtml = generatePaymentReceipt(transformedPayment, transformedLoan, {
      coopName: "acercate",
      logo: logoDataUrl,
      logoIcon: logoIconDataUrl,
      colors: {
        primary: "#0ea5e9",
        secondary: "#38bdf8",
        text: "#0f172a",
      },
    })

    // Generate PDF using headless browser
    const browser = await puppeteer.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(brandedHtml, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
      })
      // Usar Uint8Array para garantizar BodyInit válido (evita SharedArrayBuffer)
      const pdfBytes = new Uint8Array(pdfBuffer)

      const headers = new Headers()
      headers.append("Content-Type", "application/pdf")
      headers.append("Content-Disposition", `inline; filename="recibo-${payment.receipt_number}.pdf"`)
      headers.append("ETag", computeETag(Buffer.from(pdfBytes), true))
      headers.append("Last-Modified", formatHttpDate(new Date()))
      headers.append("Cache-Control", "private, no-cache")
      return new NextResponse(pdfBytes, { headers })
    } finally {
      await browser.close()
    }
  } catch (error) {
    console.error("[v0] Error generating receipt:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
 
