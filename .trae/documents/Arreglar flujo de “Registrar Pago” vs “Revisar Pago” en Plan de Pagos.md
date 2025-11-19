## Problema

* En la tabla de Plan de Pagos, el botón “Registrar Pago” envía a revisión cuando el rol es admin/asesor.

* Comportamiento esperado: “Registrar Pago” siempre debe ir a la vista de pago; “Revisar Pago” sólo aparece cuando el último pago de esa cuota está en `pending_confirmation`, visible para asesor/admin.

## Cambios Propuestos (mínimos, sin romper)

1. **Componentes afectados**

   * `components/payment-schedule-table.tsx`

   * `app/dashboard/loans/[id]/page.tsx`

   * `app/dashboard/loans/groups/[id]/page.tsx`

2. **Tabla de Plan de Pagos**

   * Detectar el último pago por `scheduleId` y su `confirmationStatus`.

   * Renderizar:

     * Si `latestPayment.confirmationStatus === 'pending'` y rol ∈ {admin, asesor} ⇒ botón “Revisar Pago” que llama `onReviewClick(scheduleId)`.

     * En caso contrario ⇒ botón “Registrar Pago” que llama `onPaymentClick(scheduleId)`.

   * Mantener “Editar” para admin/asesor como está.

3. **Handlers de navegación**

   * En `app/dashboard/loans/[id]/page.tsx`:

     * `handlePaymentClick(scheduleId)` ⇒ navega a `/dashboard/loans/{loanId}/payment?scheduleId=...` (siempre).

     * `handleReviewClick(scheduleId)` ⇒ navega a `/dashboard/loans/{loanId}/review?scheduleId=...`.

   * En `app/dashboard/loans/groups/[id]/page.tsx` (pestañas por cliente):

     * Agregar handlers equivalentes por cada préstamo/cliente.

4. **Firma de props**

   * Actualizar `PaymentScheduleTable` para aceptar `onReviewClick?: (scheduleId: string) => void` además de `onPaymentClick`.

   * Mantener compatibilidad: si `onReviewClick` no está, no mostrar “Revisar Pago”.

## Verificación

* Admin/asesor: “Registrar Pago” abre pago; si existe pago en confirmación, se muestra “Revisar Pago” y abre revisión.

* Cliente: siempre “Registrar Pago” abre pago.

* No se altera el resto del flujo.

¿Confirmas que aplique estos ajustes ahora? si, recuerda que cuando el status es pendig\_confirmation es a revisar pago que llevaria ENTIENDES????
