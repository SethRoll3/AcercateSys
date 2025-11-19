## Alcance

* Aplicar caché HTTP en todo el proyecto: API GET, assets estáticos y descargas.

* Mantener seguridad: usar `private` en endpoints con datos de usuario y evitar caches compartidos.

* Añadir ETag, Last-Modified y Cache-Control coherentes.

* Mejoras adicionales de rendimiento: compresión, headers globales, y staleness controlada.

## Cambios en Configuración

* Editar `next.config.mjs`:

  * `compress: true` para asegurar compresión.

  * `headers()` para definir reglas:

    * `/(.*)\.(png|jpg|jpeg|gif|svg|webp|ico)$/` → `Cache-Control: public, max-age=31536000, immutable`.

    * `/public/(.*)` → `Cache-Control: public, max-age=31536000, immutable`.

    * `/api/reports/(.*)` → `Cache-Control: private, no-cache` (o `no-store` si contienen PII).

    * Endpoints JSON por defecto: dejar política a cargo del handler.

## Utilidad de Caché Reusable

* Crear `lib/http-cache.ts` con utilidades:

  * `stableJsonStringify(data)` → stringify determinista.

  * `computeETag(body)` → hash `sha256` del cuerpo (`W/"<hash>"` o fuerte `"<hash>"`).

  * `formatHttpDate(date)` → RFC1123.

  * `latestUpdatedAt(rows)` → toma `updated_at`/`created_at` máximo.

  * `buildCacheHeaders({ body, lastModified, cacheControl })` → retorna `{ ETag, Last-Modified, Cache-Control }`.

  * `isNotModified(req, { etag, lastModified })` → compara `If-None-Match` y `If-Modified-Since`.

## Aplicación en Endpoints GET

* Editar cada `app/api/**/route.ts` con GET para usar la utilidad:

  * Flujo:

    1. Ejecutar consulta Supabase.
    2. Construir `body` (JSON serializado determinista).
    3. Calcular `etag` y `lastModified` (de `updated_at` máximo si existe; si no, usar `Date.now()`).
    4. Si `isNotModified(req, { etag, lastModified })` → responder `304` con headers.
    5. Si no, `NextResponse.json(data, { headers })` con `Cache-Control` adecuado.

* Políticas por tipo de recurso:

  * Auth-sensibles (loans\*, payments\*, grupos\*, users, auth/user, payment-schedule/\*): `Cache-Control: private, max-age=0, must-revalidate` + ETag + Last-Modified.

  * Listados sin auth pero sensibles (`clients`, `boletas`, `boletas/search`, `advisors`, `debug/loans`): `Cache-Control: no-store` para evitar riesgo.

  * Reportes descargables (PDF/CSV/XLSX): `Cache-Control: private, no-cache`; opcional `max-age=600` si no contienen PII y conviene reutilización.

## Ejemplo de Handler (plantilla)

* En un `route.ts` (GET):

  * `const data = /* ... */`

  * `const body = stableJsonStringify(data)`

  * `const etag = computeETag(body)`

  * `const lastModified = latestUpdatedAt(data) ?? new Date()`

  * Si `isNotModified(request, { etag, lastModified })` → `return new NextResponse(null, { status: 304, headers })`

  * Si no → `return NextResponse.json(data, { headers: buildCacheHeaders({ body, lastModified, cacheControl: 'private, max-age=0, must-revalidate' }) })`

## Assets Estáticos

* `public/*` y recursos con extensión de imagen → cache largo en navegador: `public, max-age=31536000, immutable`.

* Los chunks de Next ya tienen caching fuerte; se respeta.

## Mejoras Adicionales

* `stale-while-revalidate` en algunos listados administrativos de baja frecuencia (ej. `/api/advisors`): `Cache-Control: private, max-age=60, stale-while-revalidate=300`.

* Evitar doble fetch en cliente: reutilizar respuestas gracias a caché HTTP; no cambian APIs públicas del código de página.

* Mantener `no-store` para endpoints que devuelven datos sensibles o muy volátiles.

## Verificación

* Abrir DevTools → Network.

* Cargar panel y repetir carga:

  * Primera carga: `200` con `ETag`, `Last-Modified`, `Cache-Control`.

  * Segunda carga: varios `304 Not Modified` en GET cacheables.

* Probar cambios de datos (crear/editar préstamo) y verificar que el siguiente GET revalida y devuelve `200` actualizado.

## Archivos a Tocar

* `next.config.mjs` (headers y compress).

* `lib/http-cache.ts` (nueva utilidad).

* GET handlers en:

  * `app/api/loans/route.ts`

  * `app/api/loans/[id]/details/route.ts`

  * `app/api/loans-groups/route.ts`

  * `app/api/grupos/route.ts`

  * `app/api/grupos/[id]/route.ts`

  * `app/api/clients/route.ts`

  * `app/api/users/route.ts`

  * `app/api/payments/route.ts`

  * `app/api/payment-schedule/[id]/boletas/route.ts`

  * `app/api/advisors/route.ts`

  * `app/api/boletas/route.ts`

  * `app/api/boletas/search/route.ts`

  * `app/api/debug/loans/route.ts`

  * `app/api/reports/receipt/[paymentId]/route.ts`

  * `app/api/reports/loan-schedule/[loanId]/route.ts`

  * `app/api/reports/payments/route.ts`

  * `app/api/reports/loans-excel/route.ts`

## Salvaguardas

* No tocar POST/PATCH/PUT para caching; mantener `no-store` en mutaciones.

* Usar `private` en datos bajo sesión para evitar caches compartidos/CDN.

* Mantener compatibilidad sin cambiar contratos de respuesta.

## Siguiente Paso

* Implemento utilidades y aplico headers en los handlers listados. ¿Confirmas que avanzamos con este plan? Utilizar explicitamente la zona horaria de el pais de Guatemala para temas de fechas , horas y eso del cache

