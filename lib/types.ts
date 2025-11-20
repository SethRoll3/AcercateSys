export type UserRole = "admin" | "user"

export interface User {
  id: string
  email: string
  fullName: string
  role: UserRole
  createdAt: string
  updatedAt: string
}

export type LoanStatus = "pending" | "active" | "paid"

export interface Loan {
  id: string
  userId: string
  loan_number: string
  loanNumber: string
  amount: number
  interestRate: number
  termMonths: number
  monthlyPayment: number
  monthly_payment: number
  status: LoanStatus
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
  user?: User
  // Cliente asociado opcional (cuando el endpoint de detalles incluye join)
  client?: {
    id?: string
    first_name: string
    last_name: string
    email?: string | null
  } | null
}

// Cliente asociado a un préstamo
export interface Client {
  advisor_id: string
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  phone_country_code?: string | null
  createdAt: string
  updatedAt: string
  group_id?: string | null
  in_group?: boolean
  address?: string | null
  emergency_phone?: string | null
}

export type PaymentScheduleStatus =
  | "pending"
  | "paid"
  | "overdue"
  | "partially_paid"
  | "pending_confirmation"
  | "rejected"

export interface PaymentSchedule {
  id: string
  loanId: string
  paymentNumber: number
  payment_number: number
  dueDate: string
  due_date: string
  amount: number
  principal: number
  interest: number
  mora: number
  admin_fees?: number
  paid_amount?: number
  paidAmount?: number
  status: PaymentScheduleStatus
  createdAt: string
}

export interface Payment {
  id: string
  loanId: string
  scheduleId: string | null
  amount: number
  paymentDate: string
  receiptNumber: string
  paymentMethod: string
  notes: string | null
  createdAt: string
  // Campos adicionales usados en historial y recibos
  confirmationStatus?: string | null
  confirmation_status?: string | null
  payment_date?: string | null
  receipt_number?: string | null
  payment_method?: string | null
  rejection_reason?: string | null
  receiptImageUrl?: string | null
  confirmedBy?: string | null
  confirmedAt?: string | null
  rejectionReason?: string | null
  hasBeenEdited?: boolean
  // Boletas asociadas a la cuota/pago
  boletas?: Boleta[]
}

export interface LoanWithDetails extends Loan {
  schedule: PaymentSchedule[]
  payments: Payment[]
  totalPaid: number
  remainingBalance: number
}

export interface Boleta {
  id: string
  numero_boleta: string
  numeroBoleta: string
  forma_pago: string
  formaPago: string
  fecha: string
  referencia: string | null
  banco: string | null
  monto: number
  observaciones: string | null
  createdAt: string
  createdBy: string
  imageUrl?: string | null
  image_url?: string | null
}

export interface CuotaBoleta {
  id: string
  paymentScheduleId: string
  boletaId: string
  createdAt: string
  boleta?: Boleta
}

export interface PaymentScheduleWithBoletas extends PaymentSchedule {
  boletas: CuotaBoleta[]
  totalBoletasMonto: number
}

export interface Group {
  id: string;
  nombre: string;
  clientes_ids: string[];
  clients: Client[];
}
