# Mapa de AcercateSys para continuidad

Referencia de navegación, no copia del código ni fuente de verdad. Revisado el 2026-11-07 durante la integración de `main` con los cambios locales. Antes de editar, leer los archivos afectados, las instrucciones del proyecto y `git status`.

## Producto y arquitectura
Sistema de cooperativa para clientes, grupos, préstamos, cuotas, pagos, boletas, mora, notificaciones, comisiones y reportes. Next.js 15 App Router, React 19, TypeScript, Tailwind 4 y Supabase (Postgres, Auth y Storage). Frontend usa componentes React y rutas bajo `app/dashboard`; API de servidor en `app/api`. Migraciones en `supabase/migrations`; scripts de mantenimiento en `scripts` pueden estar obsoletos.

## Mapa para encontrar funcionalidades
- Acceso y sesión: `middleware.ts`, `lib/supabase/middleware.ts`, `lib/supabase/{client,server}.ts`, `app/auth/`, `app/api/auth/user/` y `contexts/role-context.tsx`.
- Interfaz y navegación: `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `components/app-sidebar.tsx`; páginas de clientes, grupos, historial, reportes y ajustes en `app/dashboard/`.
- Clientes y grupos: `app/api/clients/`, `app/api/grupos/`, `app/api/loans-groups/`, `app/dashboard/clients/`, `app/dashboard/groups/`, formularios y tablas en `components/`.
- Préstamos: `app/api/loans/`, `app/dashboard/loans/[id]/`, `components/create-loan-dialog.tsx`, `components/edit-loan-dialog.tsx`, `components/loans-table.tsx`. Detalles y plan: `app/api/loans/[id]/details/`; activación y regeneración de plan tienen rutas propias.
- Pagos: `app/dashboard/loans/[id]/payment/page.tsx`, `components/payment-form.tsx`, `components/payment-schedule-table.tsx`, `components/payment-history-table.tsx`; `app/api/payments/`, `app/api/payments/[id]/`, `app/api/payments/[id]/confirm/`, `app/api/payment-schedule/[id]/`. Boletas: `components/boletas-manager.tsx` y `app/api/boletas/`.
- Reportes: `app/api/reports/`; `lib/excel-generator.ts`, `lib/pdf-generator.tsx`, `lib/pdf-report-helpers.ts`. Notificaciones: `app/api/notifications/`, `app/api/webhooks/`, `lib/messaging/`. Mora: `app/api/mora/run/`.
- Tipos: `lib/types.ts`; caché HTTP: `lib/http-cache.ts`; controles generados: `components/ui/`.

## Flujos y precauciones
- El detalle del préstamo carga datos mediante `/api/loans/[id]/details` y muestra cronograma e historial; la pantalla de pagos utiliza `PaymentForm` y boletas.
- `POST /api/payments` registra un pago pendiente de confirmación y marca cuotas como `pending_confirmation`. La confirmación usa `review_payment_atomically` para actualizar pago, cuotas y préstamo en una transacción. Los pagos completos llevan IDs de cuotas en notas con prefijo `[FULL_PAYMENT]`; los abonos se registran pendientes y aplican monto y condonación al aprobarlos. Verificar la implementación vigente y todas las variantes antes de modificar montos, aprobaciones o rechazos.
- El contexto de roles define `admin`, `asesor`, `cliente` y `contador`; `lib/types.ts` tiene otra definición de roles. No asumir que tipos de frontend, autorización de servidor y políticas RLS coinciden. El contexto usa `user_metadata` para presentación; no confiar en metadatos editables para autorizar operaciones de servidor.
- `createAdminClient` usa credenciales privilegiadas y omite RLS. Toda operación privilegiada requiere comprobar identidad, rol y acceso a los datos en servidor. Las migraciones históricas no prueban por sí solas el estado actual de una base remota.
- La integración de noviembre de 2026 unió los cambios locales de pagos con cancelación, abonos y reportes del `main` remoto. Revisar el historial antes de reimplementar alguna variante.
- `next.config.mjs` omite errores de TypeScript y ESLint en build; `npm run lint` y `npx tsc --noEmit` son comprobaciones separadas. No se observó script de tests en `package.json`.
- `fix-rls-policies.js` está señalado por las instrucciones del proyecto como obsoleto: no ejecutarlo. No registrar secretos, datos de clientes ni contenido de `.env.local` en este mapa.
