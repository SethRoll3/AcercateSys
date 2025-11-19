## Problema
Las vistas de préstamos quedan en spinner sin avanzar. Ya eliminé 304 en APIs, pero persiste en algunos casos. Se requiere corte seguro de carga y reintentos.

## Cambios a implementar
- **Dashboard** (`app/dashboard/page.tsx`)
  - Agregar hard-timeout (15s) que fuerza `isLoading=false` y muestra UI de error con reintento.
  - Centralizar carga con `Promise.allSettled` (ya existe) y asegurar `finally` siempre limpia `isLoading`.
  - Reintento: vuelve a ejecutar `fetchData` con nuevo `AbortController` y timeout.
  - Eliminar cualquier dependencia de caché (ya quitado en APIs) y abortar en cleanup.

- **Detalle de Préstamo** (`app/dashboard/loans/[id]/page.tsx`)
  - Mantener hard-timeout (ya agregado), abort y reintento; revisar que `errorMsg` y `isLoading` se actualicen correctamente.

- **Verificación y logs**
  - Añadir logs mínimos `[DASHBOARD_LOAD]`/`[LOAN_DETAIL_LOAD]` para rastreo.
  - Validar en Network que las llamadas claves responden 200 y no 304.

## Entrega
- Parches en los dos archivos de página con hard-timeout, abort y reintento consistentes.
- Sin tocar otras vistas que ya funcionan.

Procedo a aplicar los cambios y validar que el spinner ya no se quede infinito; en error mostraré el botón “Reintentar” para recuperar sin recargar toda la app.