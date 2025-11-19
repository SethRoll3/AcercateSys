## Qué es una plantilla

* Texto predefinido con variables que se reemplazan al enviar un mensaje. Ejemplos de variables: `{cliente_nombre}`, `{monto_pendiente}`, `{fecha_limite}`, `{instrucciones_pago}`, `{soporte_contacto}`, `{dias_mora}`, `{total_pendiente}`.
* El sistema las obtiene y renderiza en `lib/messaging/templates.ts:1–42` usando `renderTemplate(text, vars)`.
* Claves disponibles hoy: `reminder_D15`, `reminder_D2`, `reminder_D1`, `due_D0`, `overdue_D1`, `overdue_D3`, `overdue_WEEKLY`.

## Credenciales

* El apartado "Credenciales" ya actualiza la contraseña del usuario logueado usando `supabase.auth.updateUser(...)` (ver `app/dashboard/settings/page.tsx: newPassword → changePassword`).

## Implementación solicitada: Crear Plantillas

* Agregar un formulario en la pestaña "Plantillas" para crear una nueva plantilla (solo admin):
  - Campos: `key` (selección de etapa), `channel` (`sms`/`whatsapp`), `locale` (`es-GT` por defecto), `text`, `active`.
  - Validación: no permitir texto vacío; `key` debe estar en el conjunto soportado; `channel` válido.
  - Guardado: llamar a API con método `POST`.

* API de plantillas
  - Extender `app/api/settings/templates/route.ts` para soportar `POST` y crear registro en `notifications_templates` con control de acceso admin.
  - Mantener `GET`/`PATCH` como están; reutilizar `PATCH` para editar existentes.

* UI en `app/dashboard/settings/page.tsx`
  - Dentro de la pestaña "Plantillas", añadir un bloque "Crear nueva plantilla" con el formulario y botón "Crear".
  - Al crear, refrescar la lista (`GET /api/settings/templates`).

## Seguridad y Alcance

* Solo admins pueden ver/crear/editar plantillas; clientes no ven esa pestaña.
* No tocar flujos de envío ni lógica de notificaciones; solo agregamos la UI y el endpoint de creación.

## Verificación

* Crear una plantilla de prueba `reminder_D2` para `sms` y confirmar que aparece en la lista.
* Usar `/_/api/notifications/preview?stage=reminder_D2&clientId=<id>&channel=sms` para ver el texto renderizado.

## Archivos a tocar

* `app/dashboard/settings/page.tsx` (agregar formulario de creación y refresco de listas)
* `app/api/settings/templates/route.ts` (añadir POST).