import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateMonthlyPayment(
  principal: number,
  annualInterestRate: number,
  termMonths: number
): number {
  const monthlyInterestRate = annualInterestRate / 100 / 12
  if (monthlyInterestRate === 0) {
    return principal / termMonths
  }
  const monthlyPayment = 
    (principal * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, termMonths)) /
    (Math.pow(1 + monthlyInterestRate, termMonths) - 1)
  return monthlyPayment
}

export function calculateEndDate(startDate: string, termMonths: number): string {
  const base = parseYMDToUTC(startDate)
  const d = new Date(base.getTime())
  d.setUTCMonth(d.getUTCMonth() + termMonths)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(d)
}

// --- Manejo de fechas para Guatemala (America/Guatemala) ---
// Los campos DATE en la BD (como payment_date y boletas.fecha) vienen como "YYYY-MM-DD".
// Si se usa new Date("YYYY-MM-DD") se interpreta como medianoche UTC y puede mostrar el día anterior en GT.
// Estas utilidades evitan el desfase y aseguran formatos correctos para Guatemala.

/**
 * Devuelve un valor "YYYY-MM-DD" adecuado para inputs type="date" usando la zona horaria de Guatemala.
 */
export function gtDateInputValue(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(date)
}

/**
 * Convierte una cadena YYYY-MM-DD a un Date seguro usando UTC al mediodía,
 * para que al formatear en cualquier zona horaria conserve el mismo día.
 */
export function parseYMDToUTC(dateStr: string): Date {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(dateStr)
  if (!m) return new Date(dateStr)
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo, d, 12, 0, 0))
}

/**
 * Formatea una cadena YYYY-MM-DD para mostrarse en Guatemala, evitando cambios de día.
 */
export function formatYMDGT(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" },
  locale = "es-GT",
): string {
  if (!dateStr) return ""
  const dt = parseYMDToUTC(dateStr)
  return new Intl.DateTimeFormat(locale, { timeZone: "America/Guatemala", ...options }).format(dt)
}
