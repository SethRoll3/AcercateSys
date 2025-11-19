## Lo Que Hay Hoy

* Proveedor WhatsApp (Meta Graph): `lib/messaging/providers/whatsapp.ts:5–35` con `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`.

* Proveedor SMS (Twilio REST): `lib/messaging/providers/sms.ts:5–32` con `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.

* Selección automática de proveedor y envío multi‑canal: `lib/messaging/index.ts:14–38` + normalización E.164 `lib/messaging/phone.ts:1–12`.

* Plantillas y configuración: `lib/messaging/templates.ts:1–42`, `lib/messaging/settings.ts:1–24`.

* Disparadores: recordatorios y reactivaciones

  * `app/api/notifications/run/route.ts:56–176` (etapas D‑15, D‑2, D‑1, D0, D+1, D+3, WEEKLY\_n)

  * `app/api/notifications/reactivate/route.ts:12–137` (pendiente de confirmación y mora semanal)

## Estado de Variables

* WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`.

* Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.

* Se usan en server y se hace fallback a “dry‑run” si faltan. Mantendremos esto.

## Propuesta de Mejora (sin romper nada)

1. Entrega y trazabilidad

* Crear webhooks de estado: `api/webhooks/twilio` y `api/webhooks/whatsapp` para registrar delivery/status en `notifications_log` (accepted, delivered, failed) y correlacionar por `message_sid`/`wamid`.

* Añadir `message_id` en el log al enviar (de respuesta del proveedor) para correlación.

1. Gobernanza de envío

* Rate limit por cliente/día (p. ej. máx 2 mensajes) y por etapa (no repetir en 24h) dentro de `run/reactivate`.

* Unificar horas de silencio con zona `America/Guatemala` (mantener `getSystemSettings().timezone`) y evaluar borde de hora/minutos.

1. Normalización y validación

* Mejorar `toE164` para Guatemala y países comunes; si el número es inválido, registrar `ignored_invalid_phone`.

* Aceptar `defaultCountryCode` por cliente desde `clients.phone_country_code`.

1. Plantillas y pruebas

* Endpoint `api/notifications/preview?stage=...&clientId=...&channel=...` que retorna el texto renderizado sin enviar (para revisar copy).

* Expandir variables (p. ej. nombre asesor, link de pago si existiera) conservando compatibilidad.

1. Disparadores manuales seguros

* Endpoint `api/notifications/test` restringido a `admin/asesor` para enviar una prueba a un cliente (con flag `dryRun=true` opcional), reutilizando `sendMessage`.

1. Seguridad

* Evitar exponer tokens en logs; registrar solo códigos de error/proveedor.

* Confirmar `.gitignore` protege `.env.local` y nunca serializar env a payloads.

## Cambios Concretos (archivos)

* Nuevos: `app/api/webhooks/twilio/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/api/notifications/preview/route.ts`, `app/api/notifications/test/route.ts`.

* Ajustes mínimos: `lib/messaging/index.ts` (capturar `message_id` del raw), `lib/messaging/phone.ts` (validación), `app/api/notifications/run/route.ts` y `reactivate/route.ts` (rate limit y quiet hours con TZ).

* No tocar flujos de pagos; los disparadores siguen siendo los endpoints de notificaciones.

## Verificación

* Pruebas con `dry-run` y con env reales, chequeando:

  * Respuestas 200/304 en endpoints.

  * Registros en `notifications_log` con `message_id`/`status` actualizado vía webhook.

  * Respeto de horas de silencio (GT) y límites de envío.

## Siguiente Paso

* Implemento los endpoints de webhook/preview/test, la validación de teléfonos y los límites de envío. ¿Confirmas que avance con estos cambios?

Va hazlo pero porfavor no vayas a arruinar NADA del codigo actual de todo el proyecto, no asumas, no te compliques, no toques cosas que no te pedi\
Y aparte en la vista de configuraciones necesito que tambien la ahi hayan pestañas, que como vez ya hay una opcion para algo de los mensajes, entonces nec4esito que tambien ahi este como la opcion de configurar las plantillas de los mensajes, algo asi ya me lo abias dichi pero no me acuerdo como era, eso se puede no? si no se puede no pasa nada, esto estara disponible solo para administradores, y la otra pestaña para cambiar credenciales en este caso esto sera lo unico que pueden ver los clientes de esa cista de configuracion me entiendes que quiero?
