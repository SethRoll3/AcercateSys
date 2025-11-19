## Problema
- Al entrar al detalle se muestra “Préstamo no encontrado” y luego, a los segundos, aparece la data.
- En consola aparece `Error: signal is aborted without reason` al hacer `abort()` en cleanup.
- Causa: el `abort()` cancela la petición previa y el catch marca `isLoading=false`, disparando el estado “no encontrado” antes de que la carga efectiva resuelva.

## Cambios Propuestos (solo cliente)
1. `app/dashboard/loans/[id]/page.tsx`:
   - Usar `AbortController` por navegación y almacenar en `abortRef`.
   - Ignorar `AbortError`: en el catch, si `signal.aborted`, no cambiar estados.
   - Mantener `isLoading=true` hasta que la petición activa termine (éxito o error real). No mostrar “no encontrado” por abort.
   - Cleanup: `abortRef.current?.abort('route-change')` y no tocar UI.
   - Render: mostrar “no encontrado” únicamente si `!isLoading && !loan`.

2. Opcional (si lo deseas en grupo): aplicar el mismo patrón en `app/dashboard/loans/groups/[id]/page.tsx` para evitar flashes al cambiar pestañas.

## Verificación
- Entrar al detalle ya no muestra “no encontrado” temporal; carga directa o spinner, y sólo muestra error si realmente falla.
- No aparece `signal is aborted` en consola como error de flujo (se ignora el abort). ¿Confirmas que aplique? 