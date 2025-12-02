import { createAdminClient } from '@/lib/supabase/server'

export interface SystemSettings {
  support_contact: string
  payment_instructions: string
  default_quiet_hours_start: string | null
  default_quiet_hours_end: string | null
  default_country_code: string
  timezone: string
  dynamic_mora_enabled: boolean
  dynamic_mora_amount: number
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const admin = await createAdminClient()
  const { data } = await admin.from('system_settings').select('*').limit(1)
  const row = Array.isArray(data) ? data[0] : null
  return {
    support_contact: row?.support_contact ?? '+502 5555-5555',
    payment_instructions: row?.payment_instructions ?? 'Paga en ventanilla, transferencia o vía asesor.',
    default_quiet_hours_start: row?.default_quiet_hours_start ?? '08:00',
    default_quiet_hours_end: row?.default_quiet_hours_end ?? '18:00',
    default_country_code: row?.default_country_code ?? '+502',
    timezone: row?.timezone ?? 'America/Guatemala',
    dynamic_mora_enabled: !!row?.dynamic_mora_enabled,
    dynamic_mora_amount: Number(row?.dynamic_mora_amount ?? 0),
  }
}
