import { createClient } from '@/lib/supabase/server'

export type TemplateKey =
  | 'reminder_D15'
  | 'reminder_D2'
  | 'reminder_D1'
  | 'due_D0'
  | 'overdue_D1'
  | 'overdue_D3'
  | 'overdue_WEEKLY'
  | 'payment_confirmed'
  | 'payment_rejected'

export async function getTemplate(key: TemplateKey, channel: 'sms' | 'whatsapp', locale = 'es-GT') {
  const admin = await createClient({ admin: true })
  const { data } = await admin
    .from('notifications_templates')
    .select('*')
    .eq('key', key)
    .eq('channel', channel)
    .eq('locale', locale)
    .eq('active', true)
    .limit(1)

  const row = Array.isArray(data) ? data[0] : null
  if (row?.text) return row.text as string

  // Fallbacks
  const defaults: Record<TemplateKey, string> = {
    reminder_D15: 'Hola {cliente_nombre}, recuerda tu pago de {monto_pendiente} vence el {fecha_limite}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    reminder_D2: 'Recordatorio: tu pago de {monto_pendiente} vence el {fecha_limite}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    reminder_D1: 'Mañana vence tu pago de {monto_pendiente}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    due_D0: 'Hoy vence tu pago de {monto_pendiente}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    overdue_D1: 'Tu cuota está en mora (1 día). Total pendiente {total_pendiente}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    overdue_D3: 'Tu cuota está en mora (3 días). Total pendiente {total_pendiente}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    overdue_WEEKLY: 'Tu cuota sigue en mora ({dias_mora} días). Total pendiente {total_pendiente}. {instrucciones_pago}. Soporte: {soporte_contacto}',
    payment_confirmed: 'Hola {cliente_nombre}, tu pago de {monto_pagado} fue confirmado el {fecha_pago}. Recibo: {numero_recibo}. ¡Gracias! Soporte: {soporte_contacto}',
    payment_rejected: 'Hola {cliente_nombre}, tu pago fue rechazado. Motivo: {motivo_rechazo}. {instrucciones_pago}. Soporte: {soporte_contacto}',
  }
  return defaults[key]
}

export async function getTemplateRow(key: TemplateKey, channel: 'sms' | 'whatsapp', locale = 'es-GT') {
  const admin = await createClient({ admin: true })
  const { data } = await admin
    .from('notifications_templates')
    .select('*')
    .eq('key', key)
    .eq('channel', channel)
    .eq('locale', locale)
    .eq('active', true)
    .limit(1)
  const row = Array.isArray(data) ? data[0] : null
  if (row) return row
  return { text: await getTemplate(key, channel, locale), variables: [] }
}

export function renderTemplate(text: string, vars: Record<string, string | number>) {
  return text.replace(/\{([a-zA-Z_]+)\}/g, (_, k) => String(vars[k] ?? ''))
}
