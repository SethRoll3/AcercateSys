## Objetivo
Convertir `public/logoCooperativaSinTextoSinFondo.svg` en un spinner profesional, sin fondo, integrado al diseño (dark/light), con animación fluida y configurable.

## Estrategia de Animación
- Spinner de calidad usando el propio trazo del logo:
  - Animación de stroke-dasharray/dashoffset para un efecto de “progreso barrido” sobre el contorno.
  - Gradiente dinámico en el trazo con leve rotación para sensación de movimiento continuo.
  - Pulso suave del punto del logo (círculo) sincronizado (easing cubic-bezier) para darle vida.
- Transparencia total: el SVG no tendrá rect de fondo; `fill: none` y `stroke`/`currentColor` garantizan integración.

## Implementación
- Crear componente `components/brand-spinner.tsx` que incluya el SVG inline con:
  - Conversión del path principal a `stroke` (sin `fill`), con `stroke-linecap=round`.
  - Definir `<linearGradient>` y `<animate>`/CSS keyframes para mover el gradiente.
  - Animar `stroke-dashoffset` mediante CSS keyframes; velocidad configurable.
  - Punto del logo en `<circle>` con pulso (scale/opacity) independiente.
- Props del componente:
  - `size` (px/rem), `color` (usa `currentColor`), `speed` (ms), `className`.
  - `variant` (`default|subtle`) para densidad del trazo.
- Estilos globales mínimos en `globals.css` para el keyframe (prefijo `.brand-spinner`), respetando el tema actual.
- Garantizar accesibilidad: `role="status"`, `aria-label="Cargando"`.

## Integración
- Exportar y usar en cualquier pantalla de carga (ej. reemplazar `LoadingSpinner` internamente o ofrecer ambas opciones).
- Mantener el archivo SVG original en `public`; el spinner usará SVG inline para poder animar el trazo.

## Opcional (si aceptas librería)
- Usar `framer-motion` para suavizar el pulso del punto y el sweep; si no, CSS puro cubre muy bien.

## Entregables
- `components/brand-spinner.tsx` con animaciones avanzadas.
- Pequeños estilos en `globals.css` para keyframes.
- Ejemplo de uso en algún lugar (sin romper nada): `<BrandSpinner size={64} className="text-primary" />`.

¿Apruebas que lo implemente con CSS puro (sin librerías) para mantener ligero y evitar dependencias? Si prefieres framer-motion, lo integro también.