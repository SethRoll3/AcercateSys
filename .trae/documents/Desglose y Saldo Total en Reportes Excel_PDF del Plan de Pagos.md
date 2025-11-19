## Objetivo
Agregar un bloque de desglose antes de la tabla y una nueva columna "Saldo por Pagar" en todos los reportes de plan de pagos (individual y grupos), renombrar la columna "Monto" a "Monto a Pagar" y mostrar nota "+ mora" en el desglose.

## Cálculos y Reglas
- Capital mensual: `capitalMes = monto / plazoMeses` (redondeo a 2 decimales).
- Interés mensual: `interesMes = monto * (tasaMensual)` (redondeo a 2 decimales; tasa en %) — igual a la lógica existente.
- Aporte: `adminFees = 20` (por cuota; ya está en la lógica actual).
- Cuota base mensual: `cuotaBase = capitalMes + interesMes + adminFees`.
- Nota en el desglose: mostrar `+ mora` (si aplica) sin incorporarla al cálculo base; en cada fila el "Monto a Pagar" sí suma `mora` cuando esté presente.
- Total del préstamo (sin mora): `totalBase = cuotaBase * plazoMeses`.
- Nueva columna: "Saldo por Pagar" (del total del préstamo):
  - Inicial: `saldoTotal = totalBase`.
  - Por fila: `saldoTotal -= (cuotaBase + (mora || 0))`.
  - Mostrar redondeado a 2 decimales.
- Mantener "Saldo Préstamo" (resta de capital) tal como está.

## Cambios en Excel
### Individual: `app/api/reports/schedule/excel/[loanId]/route.ts`
1. Insertar bloque de desglose arriba de la tabla (filas 4–5 aprox.):
   - "Capital mensual", "Interés mensual", "Aporte", "Cuota base mensual", "Total del préstamo", y nota "+ mora si aplica".
2. Renombrar cabecera "Monto" → "Monto a Pagar".
3. Añadir columna "Saldo por Pagar" al final.
4. Actualizar merges (`B1:I1` → `B1:J1`) y anchos/formatos (moneda/fecha) para la nueva columna.
5. Calcular y llenar "Saldo por Pagar" por fila, restando `cuotaBase + mora`.

### Grupos: `app/api/reports/schedule/group/excel/[groupId]/route.ts`
1. En cada hoja (por cliente) agregar el mismo bloque de desglose antes de la tabla.
2. Renombrar "Monto" → "Monto a Pagar".
3. Añadir "Saldo por Pagar" y ajustar merges (`B1:I1` → `B1:J1`) y formatos.

## Cambios en PDF
### Individual: `app/api/reports/schedule/pdf/[loanId]/route.ts`
1. Insertar un bloque HTML antes de la tabla con el desglose (mismo contenido).
2. Renombrar columna en la tabla a "Monto a Pagar" y añadir "Saldo por Pagar" con los mismos cálculos.
3. Mantener estilos y logo existentes.

### Grupos: `app/api/reports/schedule/group/pdf/[groupId]/route.ts`
1. En cada sección del cliente, añadir el bloque de desglose.
2. Renombrar columna y añadir "Saldo por Pagar".

## Formato y Estilos
- Excel: las nuevas celdas del desglose con fuente estándar y títulos en negrita; formato moneda `"Q"#,##0.00` y fecha `dd/mm/yyyy`.
- PDF: bloque en tipografía consistente, encabezados en negrita, nota "+ mora si aplica" en texto secundario.

## Verificación
- Probar con el ejemplo: Q 5,000, 8 meses, 3.5% mensual, aporte 20 → `capitalMes=625`, `interesMes=175`, `cuotaBase=820`, `totalBase=6560`.
- Validar filas: cada "Monto a Pagar" = `cuotaBase + mora` y "Saldo por Pagar" decrece del `totalBase`.
- Confirmar que en grupos cada hoja muestra su desglose y saldos correctos.

¿Confirmas que proceda con estos cambios en los reportes Excel y PDF?