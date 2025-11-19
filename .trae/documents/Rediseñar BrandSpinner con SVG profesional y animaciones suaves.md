## Objetivo
- Mejorar `components/brand-spinner.tsx` para un spinner profesional: sin “negrita”, sin parpadeo brusco en la C, sin pulso agresivo del punto.
- Mantener props actuales (`size`, `color`, `speedMs`, `variant`) y accesibilidad.

## Cambios puntuales en el archivo
- Reducir grosor y opacidad del trazo:
  - `strokeWidth` actual en línea 14 → usar 4 para `subtle` y 6 para `default`.
  - Bajar `strokeOpacity` del contorno en línea 71 de `0.25` ⇒ `0.12` y eliminar el filtro `softGlow` (líneas 57–63) o dejarlo muy tenue.
- Animación de la “C” sin prender/apagar:
  - Mantener cálculo de `len` (líneas 37–40) y `strokeDasharray` (`--seg` `--dash`), pero:
    - Aplicar animación sólo al `strokeDashoffset` con un movimiento continuo (keyframes `brand-sweep`), sin alternar opacidades.
    - Easing: usar `cubic-bezier(0.4,0.0,0.2,1)` o `linear` con duración base `speedMs`.
    - Eliminar cambios de `strokeOpacity` dinámicos para evitar “parpadeo”.
- Punto del logo con respiración sutil (sin cambio de tamaño agresivo):
  - Sustituir animación actual en líneas 98–101 por un “breathe”: sólo `opacity` 0.35→0.85 y un leve `filter: blur(0.4px)` opcional.
  - Duración `speedMs * 2` y easing suave `cubic-bezier(0.4,0,0.2,1)`. Sin `scale` brusco.
- Afinar transform y centrado:
  - Mantener cálculo `getBBox` (líneas 24–31) pero reducir `pad` y asegurar que el `scale` no engrose visualmente.
  - Quitar el gradiente fuerte (líneas 52–56) o reducir `stopOpacity` a `0.05/0.6/0.05`.

## Implementación
1) Actualizar constantes y estilos inline:
   - `strokeWidth` dinámico y `strokeOpacity` bajo.
   - `style` del path animado: sólo `strokeDashoffset` animado.
   - Definir keyframes `@keyframes brand-sweep` (dashoffset 0→-var(--dash)).
   - Definir keyframes `@keyframes dot-breathe` (opacity 0.35→0.85→0.35).
2) Eliminar filtro `softGlow` o hacerlo sutil.
3) Mantener props y refactor mínimo; no tocar interfaces externas.

## Variantes
- `variant="default"`: trazo 6px, opacidad 0.16, velocidad base `speedMs`.
- `variant="subtle"`: trazo 4px, opacidad 0.10, velocidad `speedMs * 1.2`.

## Verificación
- Pantalla de login y cualquier uso del `BrandSpinner` muestra la C con animación continua, sin parpadeo y punto con respiración suave.
- Responsivo a `size` y `color` sin “negrita”.

¿Confirmas que aplique este rediseño en `components/brand-spinner.tsx` siguiendo estas pautas?