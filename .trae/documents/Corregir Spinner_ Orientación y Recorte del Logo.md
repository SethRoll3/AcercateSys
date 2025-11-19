## Problema
- El logo aparece invertido verticalmente (la “patita” de la C apunta arriba).
- El contorno parece recortado en los bordes.

## Causa
- El SVG original usa un `transform="translate(0,455) scale(0.1,-0.1)"` (eje Y invertido). Al no reproducir ese flip, el path queda invertido respecto al diseño.
- El ajuste al viewBox usó el bbox sin padding, y el stroke grueso quedó pegado al borde.

## Solución (solo spinner)
- No tocar rutas ni endpoints. Modificar únicamente `components/brand-spinner.tsx` (y, si hace falta, `globals.css`).
- Aplicar transformación centrada con flip Y y padding:
  1. Obtener `bbox = path.getBBox()`.
  2. `pad = 12` (px en coordenadas del viewBox).
  3. `s = min((vbW - 2*pad)/bbox.width, (vbH - 2*pad)/bbox.height)`.
  4. Centrar con flip Y: `Tx = vbW/2 - s*(bbox.x + bbox.width/2)` y `Ty = vbH/2 + s*(bbox.y + bbox.height/2)`.
  5. `group.transform = translate(Tx, Ty) scale(s, -s)`.
- Mantener `vectorEffect="non-scaling-stroke"` para evitar que el stroke cambie con la escala.
- Recalcular dash tras la transformación y usar `strokeDasharray: 'var(--seg) var(--dash)'` (segmento 25% / 18%).
- Usar el segundo path (punto) del SVG original (sin círculo artificial) para que el punto esté exactamente donde debe.
- Con `preserveAspectRatio="xMidYMid meet"` y el padding, el contorno no se recorta.

## Verificación
- El logo se ve completo, con la “patita” hacia abajo (orientación correcta), sin recortes.
- La animación del trazo recorre el contorno y el punto pulsa suavemente.

¿Confirmas que proceda con estos ajustes en el spinner únicamente?