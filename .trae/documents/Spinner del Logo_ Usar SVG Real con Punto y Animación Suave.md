## Objetivo

Mostrar TODO el logo (contorno "C" + punto) y animarlo suavemente, usando exactamente el SVG `public/logoCooperativaSinTextoSinFondo.svg`, sin tocar rutas ni endpoints.

## Implementación

* Importar las rutas del SVG original:

  * Path 1 (contorno grande) → se usa para el trazo base y el segmento animado.

  * Path 2 (punto) → se renderiza como figura llena y se anima con pulso suave.

* Encaje al viewBox:

  * Calcular `getBBox()` del path 1 al montar.

  * `scale = min(vbW/bbox.width, vbH/bbox.height)` y `translate` para centrar.

  * Aplicar a un `<g>` que agrupa el contorno animado y el punto.

  * Usar `vectorEffect="non-scaling-stroke"` para que el grosor del trazo no cambie al escalar.

* Animaciones suaves:

  * Contorno: `brand-sweep` con `strokeDasharray: 'var(--seg) var(--dash)'` y `dash` calculado con `getTotalLength()`.

  * Punto: `brand-pulse` (ease-in-out, variación de escala/opacidad, sin golpes).

  * Gradiente lineal con opacidades más bajas en los extremos para evitar parpadeo.

* Estilos:

  * `preserveAspectRatio="xMidYMid meet"` para que no se recorte en distintos tamaños.

  * Mantener una silueta tenue (`strokeOpacity ~0.2`) del contorno completo siempre visible.

## Verificación

* El spinner muestra la “C” completa y el punto en su lugar exacto.

* El segmento animado recorre todo el contorno de forma continua.

* El punto pulsa suavemente.

## Alcance

* Sólo `components/brand-spinner.tsx` y animaciones en `app/globals.css`.

* No se tocan rutas ni otros componentes.

¿Confirmas que proceda con esta corrección enfocada al spinner del logo?\
sI
