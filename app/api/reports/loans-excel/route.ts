import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateLoansExcel } from "@/lib/excel-generator"
import { computeETag, formatHttpDate } from "@/lib/http-cache"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch loans with client information
    const { data: loans, error: loansError } = await supabase
      .from("loans")
      .select(
        `
        *,
        client:clients (
          id,
          first_name,
          last_name,
          phone,
          created_at,
          updated_at
        )
      `,
      )
      .order("created_at", { ascending: false })

    if (loansError) {
      console.error("[v0] Error fetching loans:", loansError)
      return NextResponse.json({ error: "Failed to fetch loans" }, { status: 500 })
    }

    // Transform the data to match the expected format
    const transformedLoans = loans.map((loan) => ({
      id: loan.id,
      clientId: loan.client_id,
      loanNumber: `PREST-${loan.loan_number.toString().padStart(4, "0")}`,
      amount: Number(loan.amount),
      interestRate: Number(loan.interest_rate),
      termMonths: loan.term_months,
      monthlyPayment: Number(loan.monthly_payment),
      status: loan.status,
      startDate: loan.start_date,
      endDate: loan.end_date,
      createdAt: loan.created_at,
      updatedAt: loan.updated_at,
      client: {
        id: loan.client.id,
        first_name: loan.client.first_name,
        last_name: loan.client.last_name,
        email: loan.client.email,
        phone: loan.client.phone,
        createdAt: loan.client.created_at,
        updatedAt: loan.client.updated_at,
      },
    }))

    const excelBuffer = generateLoansExcel(transformedLoans)

    const headers = new Headers()
    headers.append(
      "Content-Disposition",
      `attachment; filename="reporte-prestamos.xlsx"`,
    )
    headers.append(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    const etag = computeETag(Buffer.from(excelBuffer), true)
    headers.append("ETag", etag)
    headers.append("Last-Modified", formatHttpDate(new Date()))
    headers.append("Cache-Control", "private, no-cache")
    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error("[v0] Error generating Excel report:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
