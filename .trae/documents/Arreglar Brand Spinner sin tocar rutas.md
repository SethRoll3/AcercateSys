## Problema
El SVG del brand spinner sólo muestra el punto porque el `path` usa coordenadas enormes (M2245 4539 …) que quedan fuera del `viewBox` (0 0 549 455). Así, el contorno no entra en el marco y el segmento animado es invisible.

## Solución (sin tocar rutas)
- Modificar sólo `components/brand-spinner.tsx` y `app/globals.css`.
- Auto‐ajustar el `path` al `viewBox` mediante transformación dinámica:
  1. Obtener `getBBox()` del `path` al montar.
  2. Calcular escala uniforme `scale = min(viewBoxWidth/bbox.width, viewBoxHeight/bbox.height)`.
  3. Calcular traslación para centrar: `tx = (vw - bbox.width*scale)/2 - bbox.x*scale`, `ty = (vh - bbox.height*scale)/2 - bbox.y*scale`.
  4. Aplicar `transform` en un `<g>` que agrupa contorno y punto.
- Mantener grosor de trazo con `vectorEffect="non-scaling-stroke"` para que el stroke no se deforme al escalar.
- Recalcular el dash dinámico tras aplicar la transformación y usar `strokeDasharray: 'var(--seg) var(--dash)'` con el `brand-sweep` actual.
- Preservar `preserveAspectRatio="xMidYMid meet"` para evitar recortes en distintos tamaños.

## Verificación
- Renderizar el spinner y comprobar que se ve el contorno completo animado y el punto pulsando.
- Probar variantes `default` y `subtle` (segmento 25%/18%) y distintos tamaños.

## Alcance
- No tocar rutas, endpoints ni otras vistas. Sólo el componente del spinner y la animación CSS.

¿Confirmas que proceda con esta corrección enfocada al brand spinner?