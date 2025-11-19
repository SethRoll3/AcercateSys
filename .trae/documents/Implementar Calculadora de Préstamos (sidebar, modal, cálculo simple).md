## Alcance

* Crear una calculadora en modal accesible desde el sidebar (solo admin/asesor). Se abre sobre cualquier vista.

* Inputs: monto (Q), tasa mensual (%), plazo (meses).

* Resultado inmediato: desglose por cuota con el cálculo simple que indicas (capital + interés + aporte fijo Q20) y total.

## Cálculo Exacto (el que usas en generación de plan)

* Capital mensual: `amount / termMonths`.

* Interés mensual: `amount * (monthlyRate / 100)`.

* Aporte fijo: `20`.

* Total cuota: `capital + interes + aporte`.

* Formatear con moneda GTQ. Validaciones básicas ( >0 ).

## UI/UX

* Componente: `components/loan-calculator-modal.tsx`.

* Diseño: tarjeta con resultados, tipografía consistente, colores del tema.

* Responsive: `sm:max-w-[420px]`, grid 1 columna en móvil, 2 en desktop.

* Botón “Calcular” y resultados se actualizan en tiempo real.

* Opción copiar resultados (pequeño botón copiar).

## Integración Sidebar

* `components/app-sidebar.tsx`: añadir ítem “Calculadora”. Visible si `role === 'admin' || role === 'asesor'`.

* Al clic: abrir estado local del modal (sin navegación).

* Mantener estilos y esquema del sidebar.

## Implementación Técnica

1. Crear `loan-calculator-modal.tsx` con estados (`amount`, `rate`, `months`), `useMemo` para cálculo y bloque de resultados.
2. Inyectar el modal en el sidebar (desktop y móvil) y controlar apertura.
3. Validar entradas, manejar errores y formateo.
4. Probar en móvil/desktop.

## Verificación

* Comparar ejemplo: Q5000, 8 meses, 3.5% → Capital 625.00, Interés 175.00, Aporte 20.00, Total 820.00.

* Asegurar visibilidad según rol y que abre en cualquier vista.

¿Confirmas que proceda con esta implementación?\
Si
