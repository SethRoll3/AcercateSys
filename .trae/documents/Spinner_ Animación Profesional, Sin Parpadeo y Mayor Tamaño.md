## Objetivo
Mejorar el spinner del logo para que:
- No tenga efecto de “prender/apagar”.
- Se vea profesional y fluido.
- Nunca se recorte, incluso en tamaños pequeños.
- Se muestre TODO el logo correctamente.

## Cambios Propuestos (solo en el spinner)
1. **Animación del contorno**
   - Eliminar gradientes y filtros que producen parpadeo.
   - Mantener una silueta base (`strokeOpacity ~0.25`) y dibujar un **segmento constante** que recorre el contorno (`brand-sweep`) con color uniforme.
   - Opcional: añadir **segunda pasada** con opacidad menor para sensación de movimiento continuo sin “blink”.

2. **Orientación y encaje**
   - Mantener flip Y centrado para respetar la orientación original del SVG.
   - Calcular padding dinámico en el encaje: `pad = max(12, strokeWidth * 2 + 8)`.
   - Transformación del grupo: `translate(Tx, Ty) scale(s, -s)` con `s = min((vbW-2*pad)/bbox.width, (vbH-2*pad)/bbox.height)`.

3. **Tamaño y responsivo**
   - Aumentar tamaño por defecto del spinner: `size = clamp(80px, 12vw, 140px)`.
   - Mantener `preserveAspectRatio="xMidYMid meet"` para no recortar.

4. **Punto del logo**
   - Usar el **segundo path** del SVG (punto real), con pulso suave (`brand-pulse`) y sin cambios bruscos.

5. **Código**
   - Solo editar `components/brand-spinner.tsx` y `app/globals.css` (keyframes), sin tocar rutas.

## Verificación
- El logo completo (C + punto) se ve y se anima con fluidez, sin parpadeo.
- En tamaños pequeños no se recorta (padding aplicado).
- El punto está en su posición original y pulsa suavemente.

¿Confirmas que aplique estos ajustes ahora? 