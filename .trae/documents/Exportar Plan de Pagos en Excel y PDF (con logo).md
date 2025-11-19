## Alcance
- Exportar el plan de pagos (individual y grupos) en dos formatos: Excel (.xlsx) y PDF.
- Modal de "Exportar Plan" para elegir formato y alcance (cliente/grupo).
- Diseño profesional coherente y uso del logo de Acercate (desde `public`).
- No modificar lógica existente fuera de los puntos necesarios.

## Archivos a tocar
- UI:
  - `app/dashboard/loans/[id]/page.tsx`: integrar Modal de exportación.
  - `app/dashboard/loans/groups/[id]/page.tsx`: integrar el mismo Modal con opciones por cliente y grupo.
  - Nuevo: `components/export-plan-modal.tsx` (diálogo con opciones Excel/PDF; alcance para grupos).
- API (nuevas rutas):
  - `app/api/reports/schedule/excel/[loanId]/route.ts`: Excel individual.
  - `app/api/reports/schedule/pdf/[loanId]/route.ts`: PDF individual.
  - `app/api/reports/schedule/group/excel/[groupId]/route.ts`: Excel grupo (todos los clientes del grupo).
  - `app/api/reports/schedule/group/pdf/[groupId]/route.ts`: PDF grupo.
- Utilidades:
  - Reusar `lib/excel-generator.ts` como referencia de columnas; crear generador brand-compliant para Excel de plan (con logo) usando `exceljs`.
  - Reusar patrón de `app/api/reports/receipt/[paymentId]/route.ts` para PDF: convertir logo a data URL y renderizar HTML con estilo.

## UI Modal
- Componente con radios: Formato (Excel/PDF) y Alcance (solo cliente; para grupos: cliente específico o todo el grupo).
- Botón "Exportar" que llama:
  - Individual: `GET /api/reports/schedule/{excel|pdf}/[loanId]`.
  - Grupo (cliente): añade `clientId=` en query.
  - Grupo (todos): endpoints `group/{excel|pdf}/[groupId]`.
- Roles: disponible para todos; RLS se valida en API.

## Excel individual (loan)
- Endpoint lee `loan`, `payment_schedule`, y opcionalmente `payments` para estado.
- Genera `.xlsx` con:
  - Encabezado con banda corporativa y logo (insertado con `workbook.addImage({ filename, extension })`).
  - Tabla con columnas: `Cuota #`, `Fecha de Vencimiento`, `Monto`, `Capital`, `Interés`, `Mora`, `Gastos Adm.`, `Saldo Préstamo`, `Estado`.
  - Formatos: moneda guatemalteca (`"Q"#,##0.00`), fecha `dd/mm/yyyy`.
  - Archivo: `Acercate_Plan_{loanNumber}_{yyyy-mm-dd}.xlsx`.

## PDF individual (loan)
- Endpoint genera HTML profesional con el logo de `public`, colores corporativos y tabla idéntica a UI.
- Convertir a PDF con `puppeteer` (como en recibos), formato A4, márgenes y encabezado.
- Nombre: `Acercate_Plan_{loanNumber}.pdf`.

## Excel grupo
- Endpoint agrega por cada cliente del grupo:
  - Opción 1: hoja por cliente (tab por cada `loanId`).
  - Opción 2: una sola hoja con secciones por cliente (más simple para revisar). Usaré hoja por cliente (más ordenado).
- Encabezado con logo por hoja; mismas columnas.
- Nombre: `Acercate_Plan_Grupo_{groupName}_{fecha}.xlsx`.

## PDF grupo
- Genera PDF multi-sección (una sección por cliente con su encabezado y tabla), con logo y estilo.
- Nombre: `Acercate_Plan_Grupo_{groupName}.pdf`.

## Permisos y datos
- Autenticación con `createClient` y lectura con `createAdminClient` respetando RLS; verificación de acceso por rol:
  - `cliente`: solo su loan.
  - `asesor`: loans de sus clientes.
  - `admin`: todos.

## Diseño
- Colores: azul `#2563EB`, azul claro `#3B82F6`, verde `#059669`, grises para subtítulos.
- Tipografías y bordes consistentes con el reporte general ya implementado.
- Logo: prioriza `logoCooperativaSinTexto.png/jpg`; fallback a `logoCooperativa.png/jpg`.

## Validación
- Probar endpoints con préstamos reales y grupo con varios clientes.
- Confirmar formatos (moneda/fecha), logo visible y archivos descargables desde el modal.
- Asegurar que "rechazado" y estados parciales se reflejen según la columna `status` del schedule.

## Plan de implementación
1) Crear `components/export-plan-modal.tsx` y conectar en páginas de loan y grupo.
2) Implementar API Excel individual y grupo (con logo, estilos y seguridad).
3) Implementar API PDF individual y grupo (HTML+puppeteer, logo, estilos).
4) Conectar acciones de modal a endpoints y manejar descarga (Blob).
5) Pruebas manuales con casos reales; ajustar detalles de formato.

¿Confirmas que proceda con este plan? 