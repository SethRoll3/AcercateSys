## Cambios a aplicar
1. Aumentar tamaño por defecto del spinner a 128 para vistas pequeñas.
2. Usar padding dinámico basado en `strokeWidth` (`pad = Math.max(16, strokeWidth*2+10)`) para evitar recortes.
3. Eliminar filtro `softGlow` del contorno animado y mantener color uniforme sin parpadeo.
4. Mantener `brand-sweep` con `strokeDasharray` y `vectorEffect` para trazo consistente.
5. Conservar el punto del SVG con `brand-pulse` suave.

## Archivos
- Solo `components/brand-spinner.tsx`.

¿Confirmas que aplique estos ajustes inmediatamente?