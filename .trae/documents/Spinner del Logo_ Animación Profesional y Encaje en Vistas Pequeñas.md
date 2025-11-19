## Objetivo
Eliminar el efecto de “prender/apagar” de la C, aplicar una animación suave y profesional del contorno, hacer que el spinner se vea más grande (sin recortes) en vistas pequeñas, y mantener el punto del logo en su lugar.

## Cambios Propuestos (solo spinner)
- Animación del contorno:
  - Quitar el filtro de brillo/softGlow en el trazo animado y el gradiente; usar `stroke="currentColor"` y un segmento constante que recorre la C.
  - Nuevo keyframe `brand-sweep-smooth` con curva `cubic-bezier(0.4,0.0,0.2,1)` (fluida), sin parpadeos.
  - Segmento visible 24–28% del perímetro según variante; caps redondeados.
- Encaje y tamaño:
  - Aumentar `pad` del encaje al viewBox (por ejemplo 18 px) para que no se recorte en tamaños pequeños.
  - Subir el `strokeWidth` ligeramente (8→9) para mejor presencia.
  - Incrementar `size` por defecto (p. ej. 96) y mantener `preserveAspectRatio="xMidYMid meet"`.
- Orientación/transformación:
  - Mantener flip vertical centrado y cálculo de `translate` + `scale(s,-s)` para que la “patita” quede abajo y el logo no se recorte.
- Punto del logo:
  - Seguir usando el segundo path del SVG real; animar con `brand-pulse` suave sin “golpes”.

## Verificación
- En vistas pequeñas, el spinner se encaja con padding suficiente y no se ve recortado.
- La C se anima de forma continua y profesional (sin efecto de prender/apagar), y el punto pulsa suavemente.

¿Confirmas que aplique estos cambios en el componente del spinner?