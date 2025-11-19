## Problema

* El dashboard se queda en “Cargando…” y no avanza.

* Causa: tras el fetch, si `user` o `userData` son nulos, el render vuelve a mostrar el spinner indefinidamente.

* Posible fuente: `auth.getUser()` devuelve nulo por sesión expirada o reintentos; y/o falla la carga de `users`.

## Cambios Propuestos (solo cliente)

1. `app/dashboard/page.tsx`

   * Mantener `AbortController + timeout` y `allSettled` ya presentes.

   * Si `user` es nulo ⇒ redirigir a `/auth/login` (no dejar spinner).

   * Si `user` existe pero `userData` falla ⇒ mostrar estado de error con botón “Reintentar” (no spinner infinito) y ejecutar `fetchData` nuevamente.

   * Quitar el segundo `return <LoadingSpinner />` que depende de `!user || !userData`.

   * Añadir `retry()` que reinicia `inFlightRef` y repite la carga.

## Verificación

* Con sesión inválida: va a login, no queda cargando.

* Con fallo al cargar `users`: muestra error con opción de reintento y resuelve.

* Con carga normal: muestra dashboard.

¿Confirmas que aplique estos ajustes ahora? SI
