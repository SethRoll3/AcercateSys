## Objetivo

* Extraer paleta de colores desde los logos en `public/` y aplicarla profesionalmente en todo el proyecto.

* Incorporar logo y el nombre "acercate" en los lugares de identidad (sidebar, encabezado del dashboard, login) sin romper funcionalidad.

## Extracción de Paleta

* Usar extracción programática para no asumir colores:

  * Añadir un script con `node-vibrant` para leer `logoCooperativaTextoSinFondo.png` y `logoCooperativaSinTextoSinFondo.png`.

  * Consolidar paleta: `primary` (dominante), `accent` (segundo dominante), `muted` (neutro del fondo del logo), `ring` (derivado del `primary`).

  * Convertir a OKLCH para mantener consistencia con el tema actual.

* Validar contraste (WCAG AA) para `primary-foreground` y `accent-foreground`.

## Aplicación de Paleta

* Actualizar `app/globals.css` tokens:

  * `--primary`, `--primary-foreground`, `--secondary`, `--accent`, `--muted`, `--ring`, `--border` en modo claro/oscuro.

  * Mantener estructura de `@theme inline` sin cambiar clases Tailwind existentes.

* No tocar componentes de negocio; la UI se ajusta por variables CSS.

## Ubicaciones de Branding

* Sidebar (`components/app-sidebar.tsx`):

  * Reemplazar ícono `Handshake` por el logotipo sin texto (`logoCooperativaSinTextoSinFondo.png`) y colocar el texto "acercate" con la nueva tipografía de marca (mantener fuente actual si no se cambia tipografía).

  * Asegurar `text-primary` en el logo para coherencia.

* Encabezado Dash (`components/dashboard-header.tsx` o en `app/dashboard/page.tsx`):

  * Incluir nombre "acercate" y subtítulo bajo el título actual cuando corresponda.

* Login (`app/auth/login/page.tsx`):

  * Mostrar logo con texto al tope del formulario.

* Reportes PDF/Excel: no modificar contenidos, solo respetar nuevos colores si se usan estilos (PDF ya permite colores de marca).

## Accesibilidad y Responsividad

* Verificar contraste y legibilidad en modo oscuro/claro.

* No cambiar layout ni navegación; sólo estilos y branding.

## Verificación

* Correr en `dev`, revisar Network: estilos no rompen páginas.

* Revisar sidebar, dashboard y login en desktop y móvil.

## Archivos a Modificar

* `app/globals.css` (actualizar tokens de color).

* `components/app-sidebar.tsx` (logo + texto "acercate").

* `app/dashboard/page.tsx` o `components/dashboard-header.tsx` (añadir branding donde aplique).

* `app/auth/login/page.tsx` (añadir branding al login).

* Script de extracción de colores (nuevo archivo `scripts/extract-palette.ts`), sólo para derivar paleta; no afecta runtime.

## Seguridad y Alcance

* No tocar APIs ni lógica de negocio.

* No cambiar rutas ni permisos.

* Mantener todo reversible (un solo lugar de colores en `globals.css`).

## Siguiente Paso

* Extraigo la paleta de los logos y aplico los colores con la estrategia descrita; inserto el logo y "acercate" en los puntos indicados. ¿Confirmas que avance con esta implementación?, y de paso el sidebar hazlo responsive implementa un boton en telefono que pues haga que aparezca y desaparezca el sidebar, que desaparezca cada vez que se cambia de pagina, implemena responsive al proyecto ya que estamos para que se mire a la perfeccion en un telefono movil, tablet, pc, etc etc

