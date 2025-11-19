## Objetivo

Evitar que el Dashboard quede en “Cargando…” cuando alguna petición se queda colgada, y que con sesiones débiles no se muestre un estado vacío sin feedback.

## Cambios en cliente (solo Dashboard)

1. Orquestación de carga robusta:

* `getUserWithRetry()` con hasta 3 intentos (300ms, 600ms, 1200ms) usando `supabase.auth.getUser()`, y fallback a `/api/auth/user` si sigue fallando.

* `fetchJSONWithTimeout(url, ms)` envuelve `fetch` con `AbortController` y un timeout claro.

* `Promise.allSettled` para `users`, `loans`, `clients`, `loans-groups`; si cualquiera falla/timeout, continuamos con las demás y marcamos qué faltó.

1. Fallbacks de UI (sin spinner infinito):

* Si `user` es null → redirigir a `/auth/login`.

* Si `user` existe pero `userData` falla → mostrar bloque de error con “Reintentar” que reejecuta la carga (sin recargar toda la página).

* Si alguna lista falla (p. ej. `loans-groups`) → mostrar sección con aviso y botón “Reintentar sección” (no bloquear todo el dashboard).

1. Guards y limpieza:

* `mountedRef` para evitar actualizar estado tras desmontar.

* Ignorar `AbortError` explícitamente en catches.

* Escuchar `visibilitychange`: si la página se oculta, abortar cargas; al volver visible, reintentar si faltó algo.

## Opcional en servidor (mejorar estabilidad, sin cambiar negocio)

* Añadir `Cache-Control: public, max-age=30, stale-while-revalidate=60` en `/api/loans` y `/api/loans-groups` para que el primer render no dependa sólo de red.

## Verificación

* Con red intermitente: el dashboard muestra datos parciales + acciones de reintento, no se queda bloqueado.

* Con sesión inválida: redirige a login.

* Con tiempo de ejecución largo: los timeouts liberan el UI y permiten reintentar.

¿Confirmas que aplique estos ajustes (cliente + headers opcionales en API)? SI
