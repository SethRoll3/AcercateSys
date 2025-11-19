## Cambios

* Evitar que el cleanup `abort()` marque `isLoading=false` y dispare “no encontrado” cuando la navegación cancela la petición.

* Ignorar aborts explícitamente (AbortError) y no tocar el estado de UI.

## Implementación

* En `app/dashboard/loans/[id]/page.tsx`:

  1. Mantener `AbortController` en `abortRef` y un `inFlightRef` para evitar dobles cargas.
  2. Tras `Promise.allSettled`, si el controlador está abortado, salir sin cambiar estado.
  3. En casos de éxito, setear estado y `isLoading=false`; en error real, loguear y `isLoading=false`.
  4. Quitar `finally` que ponía `isLoading=false` siempre.

## Verificación

* Entrar al detalle ya no muestra “no encontrado” temporal.

* No aparecen abort errors en consola por cambios de ruta.

¿Confirmas que lo aplique ahora? SI
