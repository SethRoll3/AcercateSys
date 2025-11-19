## Objetivo
Implementar préstamos por grupo en el mismo modal de creación de préstamos, con dos pestañas: "Cliente" (sin cambios) y "Grupo". En "Grupo" se asignan los datos de préstamo a cada integrante (sin crear aún). Cuando todos tengan asignación, se muestra el total del grupo y al guardar se crean todos los préstamos y se registra el vínculo en la nueva tabla `loans_groups`.

## Cambios de UI
1. Actualizar `components/create-loan-dialog.tsx` para usar `Tabs` con dos opciones:
   - Cliente: mantiene el flujo actual.
   - Grupo: nuevas secciones.
2. En "Grupo":
   - `Select` para elegir grupo desde `/api/grupos` (usa `GET` existente).
   - Renderizar tarjeta/form por cada cliente del grupo con campos: monto, tasa, plazo, fecha inicio. Mostrar cálculo de `monthlyPayment` y `endDate` usando `lib/utils`.
   - Botón "Asignar" por cliente que guarda la asignación en estado local; no crea nada en BD.
   - Barra de progreso: clientes asignados vs total (3–5).
   - Resumen de grupo con Total = suma de montos asignados; desactivar "Guardar Grupo" hasta que todos estén asignados.
   - Al hacer scroll en móvil, usar `DialogContent` con `max-h-[80vh] overflow-y-auto`.

## Flujo de Datos
- Asignación local: estructura en estado `{ [clientId]: { amount, interestRate, termMonths, startDate, monthlyPayment, endDate, status: 'pending' } }`.
- Validación: todos los integrantes deben estar asignados.
- Creación final:
  - Iterar integrantes y llamar `POST /api/loans` por cliente con el mismo payload actual: `clientId, amount, interestRate, termMonths, startDate, status: 'pending', monthlyPayment, endDate`.
  - Recoger `{id, client_id}` de cada respuesta.
  - `POST /api/loans-groups` (nuevo endpoint) con `group_id`, `loans: [{ client_id, loan_id }]`, `total_amount`.

## Cambios en API
- Nuevo archivo `app/api/loans-groups/route.ts`:
  - `POST`: valida autenticación (admin/asesor), inserta registro en `loans_groups` con `group_id`, `loans` (jsonb), `total_amount`.
  - Opcional: `GET` por `group_id` para consultar historial (no requerido ahora).
- No tocar `/api/loans` ni lógica de cronograma; se reutiliza tal como está.

## SQL: Crear Tabla loans_groups (para correr en Supabase SQL Editor)
```sql
-- Extensión para UUID si no existe
create extension if not exists pgcrypto;

create table if not exists public.loans_groups (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.grupos(id) on delete cascade,
  loans jsonb not null,
  total_amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_loans_groups_group_id on public.loans_groups(group_id);
```

## Validaciones y Errores
- Deshabilitar "Guardar Grupo" hasta completar asignaciones.
- Al crear préstamos en lote:
  - Ejecutar en serie con manejo de errores por cliente; si algún préstamo falla, mostrar cuáles fallaron y no crear el registro `loans_groups` hasta que todos hayan sido creados.
  - Mostrar toasts de éxito/fallo por cliente y uno global al finalizar.

## Mobile/UX
- `DialogContent` con `max-h-[80vh] overflow-y-auto` y layout en columnas que colapsan a una por tarjeta.
- Inputs grandes y espaciado consistente; botones accesibles.

## Archivos que se tocarán
- `components/create-loan-dialog.tsx`: añadir tabs y la vista de grupo.
- `app/api/loans-groups/route.ts`: nuevo endpoint.

## Entregables
- Código limpio y siguiendo patrones existentes (Radix, Sonner, Tailwind).
- Script SQL listo para pegar en Supabase.
- Sin afectar el flujo de préstamos individuales ni otros módulos.

¿Confirmas que proceda con esta implementación?