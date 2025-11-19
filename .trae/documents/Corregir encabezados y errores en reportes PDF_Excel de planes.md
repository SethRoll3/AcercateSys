## Problemas detectados

- Grupo PDF: el encabezado no muestra “Monto prestado” y “Total prestado del grupo”. Hay un generador específico de PDF para plan individual (`app/api/reports/schedule/pdf/[loanId]/route.ts`) ya actualizado, pero para grupos no aparece un PDF en el repo; el PDF que muestras parece generado en otro endpoint (posiblemente `schedule/group/pdf`). Debemos agregar las mismas líneas al generador de PDF para grupos.
- Excel individual: el endpoint que el dashboard usa para el Excel estilizado es `app/api/reports/schedule/excel/[loanId]/route.ts` (ExcelJS), no el de `lib/excel-generator.ts`. Por eso tu Excel no muestra “Monto prestado”. Hay que añadirlo en ese endpoint (fila meta) y mantener formato.
- Excel grupo: el endpoint `app/api/reports/schedule/group/excel/[groupId]/route.ts` tiene un bug: usa `rows` antes de declararlo (`Cannot access 'rows' before initialization` en la línea donde calcula `n`). También falta insertar “Monto prestado” (por préstamo) y “Total prestado del grupo” en el encabezado de cada hoja.

## Cambios propuestos

1) Excel individual (ExcelJS)
- En `app/api/reports/schedule/excel/[loanId]/route.ts`:
  - Debajo de “Cliente: …” agregar una fila “Monto prestado: Q {loan.amount}”.
  - Conservar las filas de desglose existentes.
  - Asegurar formato moneda (Q) y ancho de columnas.

2) Excel grupo (ExcelJS)
- En `app/api/reports/schedule/group/excel/[groupId]/route.ts`:
  - Mover la creación de `rows` (filtrado de `schedules` por `loan.id`) ARRIBA, antes de cualquier uso.
  - Calcular `n` desde `rows.length`. Ajustar `monthlyRate`, `capitalMes`, `interesMes`, `cuotaBase` y `totalBase` sin depender de variables no inicializadas.
  - En el encabezado de cada hoja añadir:
    - “Monto prestado: Q {loan.amount}”.
    - “Total prestado del grupo: Q {suma de amount de todos los loans}”.
  - Mantener formatos (fecha y moneda) y evitar valores `undefined`/`NaN`.

3) PDF grupo (si existe endpoint)
- Crear/actualizar `app/api/reports/schedule/group/pdf/[groupId]/route.ts` (si está en el repo con otro nombre, localizar y modificar):
  - Encabezado similar al individual: “Cliente/Grupo…”, y agregar “Monto prestado” por hoja y “Total prestado del grupo” en la parte superior.
  - Reutilizar estilos del individual para coherencia.

4) Validación
- Generar un grupo de prueba y ejecutar:
  - `GET /api/reports/schedule/excel/{loanId}` → verificar “Monto prestado” en Excel individual.
  - `GET /api/reports/schedule/group/excel/{groupId}` → confirmar que no aparece el error y ver encabezados nuevos.
  - `GET /api/reports/schedule/group/pdf/{groupId}` (si existe) → verificar encabezado con montos.

## Impacto y seguridad
- No afecta lógica de negocio ni cálculos de pagos; solo encabezados y orden de variables.
- El fix elimina el error `rows` no inicializado.

## Entregables
- Parches en los 2–3 endpoints afectados con inserción de “Monto prestado” y arreglo del bug.
- Pruebas manuales de descarga para verificar que coinciden con tus capturas esperadas.

¿Quieres que además ponga “Total préstamos: N” en la primera hoja del Excel de grupo (tal como aparece en tu PDF), y copie el logo si está disponible? Puedo incluirlo en el mismo ajuste.