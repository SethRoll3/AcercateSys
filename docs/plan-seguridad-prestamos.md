# Plan de Seguridad y Estados de Préstamos

## Objetivo
- Reducir los estados del préstamo a: `pendiente`, `activo`, `pagado`.
- Impedir registrar/confirmar pagos si el préstamo no está `activo`.
- Introducir un flujo controlado de activación mediante un modal de revisión.
- Mantener compatibilidad con el código existente sin romper funcionalidades y capacidad de verse en dispositivo movil, respoinsivo.

## Alcance (qué se tocará y qué no)
- UI: Tabla de préstamos, detalle del préstamo, páginas de pago y componentes relacionados.
- Backend: Endpoints de préstamos y pagos para validar el estado del préstamo.
- Tipos: Ajuste del tipo `LoanStatus` para reflejar solo 3 estados.
- Base de datos: No se ejecutará migración automática en esta fase. Si existen préstamos con `defaulted`, se manejarán desde backend/UI según se indica abajo.

## Cambios de Estados
- Estados permitidos del préstamo: `pending` (Pendiente), `active` (Activo), `paid` (Pagado).
- Se eliminará la opción `defaulted` en la UI. Para registros existentes con `defaulted`:
  - En backend se bloquearán pagos si el estado no es `active`.
  - Opcional en una fase posterior: migrar `defaulted` → `active` y manejar mora solo a nivel de cuotas (`payment_schedule.mora`).

## Reglas de Seguridad (Backend)
- Bloqueo de creación de pagos si el préstamo no está activo:
  - Añadir validación en `app/api/payments/create/route.ts` para leer el préstamo por `loanId` y devolver `409` con mensaje si `loan.status !== 'active'`.
    - Referencia: `app/api/payments/create/route.ts:1` (validación antes de insertar).
- Bloqueo de confirmación de pago si el préstamo no está activo:
  - Añadir validación en `app/api/payments/[id]/confirm/route.ts` tras recuperar el pago/loan; si `loan.status !== 'active'` → `409`.
    - Referencia: `app/api/payments/[id]/confirm/route.ts:46` (tras fetch del pago con loan).
- Endpoints de actualización de pago (`app/api/payments/[id]/route.ts`) mantendrán su lógica; si se intenta editar un pago pendiente, se validará el estado del préstamo de igual forma antes de permitir cambios relevantes.
  - Referencia: `app/api/payments/[id]/route.ts:1` (añadir chequeo previo a la edición).
- Endpoint de préstamos (`PATCH`) dejará de aceptar cambios directos de `status` desde el editor genérico.
  - Se validará que cambios de `status` solo vengan del nuevo endpoint de activación.
  - Referencia: `app/api/loans/route.ts:275` (validación del payload y orquestación).
- Nuevo endpoint de activación: `POST /api/loans/{id}/activate` (o `PATCH` con `action: 'activate'`).
  - Verifica rol (`admin` o `asesor`).
  - Verifica datos necesarios: cliente, monto, tasa, plazo, fecha inicio y que exista plan de pagos.
  - Cambia `status` a `active` y opcionalmente normaliza `start_date` si faltara.

## Reglas de Seguridad (Frontend)
- Bloqueo de acciones de pago cuando el préstamo no esté activo:
  - `PaymentScheduleTable` mostrará botón “Registrar Pago” solo si `loan.status === 'active'`; en otro caso, mostrará botón deshabilitado y un aviso contextual.
    - Referencias: `components/payment-schedule-table.tsx:25` (prop `loan`), `components/payment-schedule-table.tsx:190` (acciones de pago).
  - `app/dashboard/loans/[id]/payment/page.tsx` verificará al cargar; si el préstamo no está `active`, mostrará mensaje explicando el bloqueo y no renderizará el formulario.
    - Referencia: `app/dashboard/loans/[id]/payment/page.tsx:129` (gating UI antes del formulario).
- Mensajes claros al usuario:
  - “Este préstamo está en estado Pendiente/Pagado. No se pueden registrar pagos hasta que esté Activo.”
  - Ofrecer acción “Revisar y Activar” a usuarios con permisos.

## Flujo de Activación (nuevo modal)
- Nuevo componente: `ActivateLoanDialog` (modal) disponible por préstamo en la tabla/listado.
- Contenido del modal:
  - Resumen del préstamo: cliente, monto, tasa, plazo, cuota, fechas, número de préstamo.
  - Resumen del plan de pagos (primeras n filas y totales).
  - Lista de verificación (checkboxes) que el usuario debe marcar:
    - Confirmo que los datos del cliente son correctos.
    - Confirmo que monto, tasa y plazo son correctos.
    - Confirmo que el plan de pagos está generado y verificado.
  - Campo opcional “Observaciones” (texto corto).
  - Botón “Activar Préstamo”.
- Comportamiento:
  - Solo visible para roles `admin` y `asesor` cuando `status === 'pending'`.
  - Al confirmar, llama al endpoint de activación; muestra `toast` de éxito o error.
  - Al éxito, el préstamo pasa a `active` y la UI habilita pagos.

## Cambios en la Tabla de Préstamos
- `EditLoanDialog` dejará de permitir editar el `status` directamente.
  - Se mantendrán campos de monto, tasa, plazo.
  - Referencia: `components/edit-loan-dialog.tsx:78` (UI del `Select` de estado) y `components/edit-loan-dialog.tsx:41` (estado inicial del formulario).
- Añadir botón “Revisar y Activar” cuando el préstamo esté `pending` y el usuario tenga rol permitido.
  - Se ubicará junto al botón “Ver”.
  - Referencia: `components/loans-table.tsx:74` (acciones por fila).

## Tipos y Etiquetas
- `lib/types.ts`: `LoanStatus` quedará como `"pending" | "active" | "paid"`.
  - Referencia: `lib/types.ts:18`.
- `components/loans-table.tsx`: actualizar badges y etiquetas; ocultar `defaulted`.
  - Referencia: `components/loans-table.tsx:18`.

## Mensajería y UX
- Cuando un préstamo esté `pending`:
  - Bloquear acceso a la vista de pago y mostrar explicación.
  - Mostrar CTA “Revisar y Activar” para roles permitidos.
- Cuando un préstamo esté `paid`:
  - Bloquear pagos, mostrar mensaje “El préstamo ya está pagado”.

## Verificación
- Pruebas manuales:
  - Crear préstamo nuevo (queda `pending`), verificar que no se puede pagar.
  - Activar mediante modal; verificar que se habilitan los pagos.
  - Cambiar a `paid` y verificar bloqueo de pagos.
- Validación backend:
  - Intentar `POST /api/payments/create` con préstamo `pending` → debe responder 409 con mensaje.
  - Confirmación de pago con préstamo `pending` → 409.

## Compatibilidad / No romper
- No se modifican políticas RLS en esta fase; las validaciones se aplican en endpoints existentes.
- No se migra la BD automáticamente. Cualquier migración (por ejemplo para `defaulted`) se propondrá aparte y se ejecutará solo bajo instrucción.

## Entregables en la siguiente fase (una vez aprobado este plan)
- Implementar validaciones en backend (create/confirm payments y loans PATCH).
- Implementar `ActivateLoanDialog` y su integración en la tabla.
- Ajustar UI en `PaymentScheduleTable` y página de pago para gating.
- Actualizar tipos y etiquetas en UI.

---
Si apruebas este plan, procedo a implementar los cambios descritos arriba.