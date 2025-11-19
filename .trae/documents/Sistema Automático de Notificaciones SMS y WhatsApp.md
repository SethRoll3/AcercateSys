## Objetivo

Diseñar e implementar un sistema de notificaciones automatizadas para recordatorios y mora de cuotas de préstamos, enviando por SMS y WhatsApp, con control de estados, reintentos, logs y cumplimiento regulatorio (Guatemala + internacional).

## Proveedores y Arquitectura

* **Abstracción de proveedores**: crear interfaces `SmsProvider` y `WhatsAppProvider` con implementaciones intercambiables.

  * **SMS**: Twilio o Vonage (costo bajo, cobertura GT e internacional). Configurable por `.env`.

  * **WhatsApp**: WhatsApp Business Cloud API (Meta) o Gupshup/360Dialog. Conversaciones por plantilla aprobada.

* **Ejecución programada**:

  * Opción A: Supabase Edge Function con scheduler (ideal por el stack actual) que invoca el proceso diariamente y cada hora.

  * Opción B: Endpoint `POST /api/notifications/run` + programador (Vercel Cron o externo) que llame el endpoint.

## Modelo de Datos

* **Tabla** **`notifications_log`** (nuevo):

  * `id`, `client_id`, `loan_id`, `schedule_id`, `channel` (`sms|whatsapp`), `stage` (`D-15|D-2|D-1|D0|D+1|D+3|WEEKLY_n`), `message_template`, `payload_json`, `status` (`sent|failed|ignored`), `error_code`, `attempts`, `sent_at`, `next_retry_at`, `created_at`.

* **Tabla** **`notifications_settings`** (por cliente):

  * `client_id`, `sms_opt_in`, `whatsapp_opt_in`, `preferred_channel` (`both|sms|whatsapp`), `quiet_hours_start/quiet_hours_end`, `weekly_reminder_day`.

* **Tabla** **`notifications_templates`** (multi-idioma / tipo):

  * `key` (`reminder_D-15`, `reminder_D-2`, `reminder_D-1`, `due_D0`, `overdue_D+1`, `overdue_D+3`, `overdue_weekly`), `channel`, `text`, `variables`.

## Fuentes de Verdad y Estados (integración)

* `payment_schedule` (debido/estado): usar `due_date`, `amount`, `mora`, `admin_fees`, `paid_amount`, `status` (`pending|paid|overdue|pending_confirmation|rejected`).

* `payments.confirmation_status` (`pendiente|aprobado|rechazado`).

* Paradas y reactivación:

  * **Detener** cuando el `payment_schedule.status` pase a `pending_confirmation`, `paid` o `rejected`, o `payments.confirmation_status` sea `aprobado|rechazado`.

  * **Reactivar** si `pending_confirmation` se mantiene > X horas/días (configurable, p. ej. 48h) sin cambio; entonces volver a flujo de mora.

## Lógica de Selección y Etapas

* **Etapas de envío**:

  * `D-15`, `D-2`, `D-1`, `D0` (día de vencimiento), `D+1`, `D+3`, `WEEKLY_n` cada 7 días hasta pago/confirmación.

* **Criterios**:

  * Incluir `payment_schedule.status IN ('pending','overdue')` y excluir si existe `notifications_log` con `stage` ya `sent` para ese `schedule_id` y `channel`.

  * Para `WEEKLY_n`, calcular `weeksOverdue = floor((today - due_date)/7)` y asegurar que no hay `log` previo para esa semana.

* **Desduplicación**: llave lógica `(schedule_id, channel, stage)`; si existe `sent`, no reenviar.

## Contenido de Mensajes

* **Variables**: `{cliente_nombre}`, `{grupo_nombre?}`, `{monto_pendiente}`, `{fecha_limite}`, `{dias_mora}`, `{monto_mora}`, `{instrucciones_pago}`, `{link_pago}`, `{soporte_contacto}`.

* **Plantillas**:

  * Recordatorio (D-15/D-2/D-1): “Hola {cliente\_nombre}, recuerda tu pago de {monto\_pendiente} vence el {fecha\_limite}. {instrucciones\_pago}. Soporte: {soporte\_contacto}”.

  * Día de vencimiento (D0): “Hoy vence tu pago de {monto\_pendiente}. {instrucciones\_pago}. Soporte: {soporte\_contacto}”.

  * Mora (D+1/D+3/Weekly): “Tu cuota está en mora ({dias\_mora} días). Total pendiente {monto\_pendiente + mora}. {instrucciones\_pago}. Soporte: {soporte\_contacto}”.

* **WhatsApp**: usar templates pre-aprobadas con variables y enlaces; SMS incluye texto corto y palabra clave de salida.

## Orquestación del Proceso

* **Job** **`notifications-run`**:

  1. Cargar lotes de `payment_schedule` cercanos al vencimiento y en mora.
  2. Filtrar por `notifications_settings` y ventanas horarias (p. ej. 08:00–18:00 America/Guatemala).
  3. Renderizar plantilla + variables y enviar por `preferred_channel` (o ambos).
  4. Registrar `notifications_log` con resultado; programar `next_retry_at` ante fallos (backoff: 15m, 1h, 6h, 24h; máx 5 intentos).
  5. Marcar `payment_schedule.status = 'overdue'` si corresponde (si no se hace ya en otro proceso).

* **Job** **`notifications-reactivate`**:

  * Detectar pagos con `confirmation_status='pendiente'` y `pending_confirmation` por encima del umbral; si sigue sin confirmación, reactivar ciclo de mora con etapa semanal.

## Integración con el Sistema Actual

* **Hooks**:

  * En `app/api/payments/route.ts`: tras crear pago → `status = 'pending_confirmation'` (ya existe). Registrar en `notifications_log` un evento `ignored` para futuras etapas.

  * En `app/api/payments/[id]/confirm/route.ts`: al aprobar/rechazar → marcar “stop” (no más notificaciones) para el `schedule_id` y cerrar tareas pendientes.

* **Consultas**:

  * Cálculo de montos: `scheduledAmount = amount + mora + admin_fees - paid_amount`.

  * Cliente y contacto: join con `clients` para obtener `phone`, `country_code`, y preferencia de canal.

## Manejo de Errores y Cumplimiento

* **Errores**: capturar códigos del proveedor (rate limits, destino inválido, plantilla no aprobada); registrar en `notifications_log`.

* **Horarios**: respetar horas hábiles locales; evitar nocturnos y domingos (configurable).

* **Regulaciones**:

  * SMS: incluir texto de salida “Responde STOP para cancelar”.

  * WhatsApp: usar plantillas aprobadas; cumplir políticas de Meta.

  * Privacidad: no incluir datos sensibles, uso de `country_code` para formato E.164.

## Seguridad y Configuración

* Secretos en entorno (`NEXT_PUBLIC` nunca): `TWILIO_*`, `VONAGE_*`, `WHATSAPP_*` guardados en `server` y/o Supabase Secrets.

* Rate limit por cliente y por job para evitar spam.

* Observabilidad: métricas por día (enviados, fallidos, ignorados).

## Pruebas

* **Entrega multi-operadora**: números de prueba (Claro/Tigo/Movistar GT + extranjero). Validar recepción y latencia.

* **Flujo completo**: simular desde D-15 hasta pago confirmado; forzar estados `pending_confirmation`, `paid`, `rejected`.

* **Formato**: verificar variables y enlaces en ambos canales.

* **No duplicados**: crear casos con reintentos y confirmar que la llave `(schedule_id, stage, channel)` evita dobles envíos.

## Fases de Implementación

1. Definir proveedor(es) iniciales y variables de entorno.
2. Crear tablas `notifications_log`, `notifications_settings`, `notifications_templates`.
3. Implementar `SmsProvider` y `WhatsAppProvider` + normalización E.164.
4. Render de plantillas y motor de etapas (D-15…Weekly).
5. Endpoint/Edge Function `notifications-run` y `notifications-reactivate` con filtros y desduplicación.
6. Integraciones en APIs de pagos para detener/activar flujos.
7. Manejo de errores y reintentos; métricas.
8. Suite de pruebas end-to-end y validación operadoras.

## Notas de Código (referencias)

* Estados y confirmaciones: `app/api/payments/route.ts`, `app/api/payments/[id]/confirm/route.ts`.

* Cronograma y vencimientos: `app/api/loans/route.ts`, `app/api/reports/loan-schedule/[loanId]/route.ts`.

* Tipos: `lib/types.ts` (`PaymentSchedule`, `Payment`, enums de estado).

  No se te olvide darme los scripts de lo nuevo que metas a la base de datos para correrlos en el sql editor de superbase, y sobre la ejecucion programada elije la mejor opcion que a largo plazo vaya  a seguir siendo la mejor opcion, pero a su vez la mas simple donde no tengamos que complicarnos tanto

