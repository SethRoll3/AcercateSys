## Causa de los errores
- `Watchpack Error (stats): EINVAL: invalid argument, lstat 'C:\swapfile.sys'` aparece porque el watcher del dev server intenta hacer `stat` sobre archivos del sistema (p.ej. `pagefile.sys`, `swapfile.sys`) que no admiten operaciones normales. No es un bug de tu código; es típico en Windows cuando el watcher no ignora esas rutas.

## Solución propuesta
1. Ignorar archivos del sistema en el watcher:
   - Añadir `watchOptions.ignored` en `next.config.js` para excluir: `C:\swapfile.sys`, `C:\pagefile.sys`, y opcionalmente `**/.next/**`, `**/node_modules/**`.
   - Reducir ruido del dev server con `infrastructureLogging.level = 'error'`.

2. Usar Turbopack en desarrollo:
   - Arrancar con `next dev --turbo` para un watcher más eficiente y menos sensible a peculiaridades del FS de Windows.

3. Alternativas (si persiste):
   - Forzar polling: establecer `CHOKIDAR_USEPOLLING=1` o `WATCHPACK_POLLING=true` en desarrollo (consume más CPU, úsalo sólo si es necesario).

## Mejora de rendimiento y evitar “se queda cargando”
- Datos:
  - Consolidar `fetch` en `Promise.all` y abortar con `AbortController` si se cierra el modal/página.
  - Cachear en server routes con `revalidate` o respuestas con `Cache-Control` cuando aplique (listas estáticas como grupos).
  - Evitar renders extra: memorizar listas y cálculos (ya usamos `useMemo` en varias vistas; seguir ese patrón en modales grandes).
  - Cargar diferido componentes pesados (p. ej. exportación PDF/Excel) con dynamic import.
- UI:
  - Mostrar `LoadingSpinner` sólo en primera carga; en refrescos usar estados suaves (sin bloquear).

## Entregables
- Configuración del watcher en `next.config.js`.
- Opcional: script de arranque con Turbopack.
- Pequeñas mejoras de fetch/caching en vistas con cargas concurrentes.

¿Confirmas que aplique estos ajustes? De ser aprobado, los cambios no alteran el comportamiento de negocio, sólo el entorno de desarrollo y la rapidez de carga.