## Diagnóstico

* Los logs repetidos de "Loan ID requested" y múltiples 200 son típicos de React Strict Mode en `next dev`, que ejecuta `useEffect` dos veces en desarrollo. En producción no pasa, pero ensucia logs y puede causar condiciones de carrera.

* Los spinners que se quedan cargando se producen cuando la petición al endpoint no resuelve (timeout, desconexión, abortos) o cuando se actualiza estado tras desmontar y se cancela la transición.

## Objetivo

* Evitar bloqueos de carga en Dashboard y Detalle de Préstamo.

* Reducir duplicados y condiciones de carrera en desarrollo.

* Mantener todo sin tocar lógica de negocio ni rutas aparte de controles de logs (opcional).

## Cambios en cliente (sin tocar APIs)

### LoanDetailPage (`app/dashboard/loans/[id]/page.tsx`)

1. Añadir `AbortController` para cancelar la petición si cambia `params.id` o se desmonta el componente.
2. Añadir `fetchWithTimeout` (10–12s) y capturar error para marcar `isLoading=false` siempre.
3. Proteger doble ejecución en dev con un `inFlight` ref para no disparar dos cargas simultáneas.
4. Separar carga de user y carga de loan en `Promise.allSettled`:

   * Si user falla, igual seguir con loan.

   * Si loan falla, mostrar mensaje y quitar spinner.

### Dashboard (lista de préstamos) — misma estrategia

* Aplicar el mismo patrón de `AbortController + timeout + allSettled` en la página del Dashboard que carga préstamos.

## Logs de debug (opcional)

* Añadir gating de logs con `process.env.NEXT_PUBLIC_LOG_DEBUG === 'true'` en `api/loans/[id]/details` para no spamear la terminal en dev.

* No cambia la lógica ni respuestas; solo condiciona `console.log`.

## Verificación

* Simular red lenta: confirmar que después de timeout se muestra error y el spinner desaparece.

* Confirmar que en dev ya no aparecen duplicados o, si aparecen, no generan múltiples cargas simultáneas.

* En producción, comportamiento estable.

¿Confirmas que aplique estos cambios? (incluyendo el gating opcional de logs). SI
