"use client"

import { useEffect, useRef } from 'react'

interface BrandSpinnerProps {
  size?: number
  color?: string
  className?: string
}

export function BrandSpinner({ 
  size = 128, 
  color = "#6366f1", 
  className = "" 
}: BrandSpinnerProps) {
  
  const groupRef = useRef<SVGGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)

  const PATH_D = "M2245 4539 c-193 -29 -274 -46 -430 -89 -190 -54 -305 -99 -516 -205 -307 -154 -547 -337 -773 -591 -74 -84 -206 -255 -206 -268 0 -3 -15 -29 -34 -59 -114 -178 -241 -516 -263 -695 -3 -29 -10 -55 -14 -58 -12 -7 -12 -574 0 -574 4 0 11 -24 15 -52 9 -84 70 -313 88 -335 6 -7 8 -13 5 -13 -14 0 121 -280 179 -371 186 -291 466 -580 752 -776 18 -13 35 -23 38 -23 3 0 24 -13 47 -29 60 -41 267 -144 375 -186 101 -39 252 -85 347 -105 33 -7 85 -18 115 -25 55 -13 179 -32 255 -39 22 -3 71 -9 108 -15 93 -16 651 -16 742 -1 39 6 86 13 106 16 19 2 67 11 105 19 66 13 105 23 237 59 75 21 288 107 392 158 192 96 515 307 593 388 9 9 29 25 44 35 l28 17 2 -303 3 -304 353 -3 352 -2 1 27 c3 100 3 402 1 1057 l-2 748 -27 -5 c-16 -3 -62 -15 -103 -27 -59 -16 -106 -21 -220 -21 -80 -1 -164 4 -187 10 -24 6 -62 16 -85 22 -24 6 -72 24 -107 40 -75 35 -79 33 -105 -51 -10 -30 -24 -70 -32 -87 -8 -18 -21 -50 -30 -70 -94 -214 -236 -452 -316 -529 -155 -148 -389 -304 -569 -379 -76 -31 -203 -76 -239 -85 -19 -5 -71 -17 -115 -28 -156 -38 -244 -47 -470 -47 -160 1 -250 6 -329 18 -60 10 -112 20 -116 22 -3 2 -18 6 -33 9 -114 20 -407 133 -508 196 -27 16 -52 30 -55 30 -8 0 -197 132 -214 150 -8 8 -43 39 -77 69 -64 54 -189 195 -256 288 -48 65 -160 284 -182 354 -35 112 -46 157 -62 244 -18 107 -25 318 -12 395 5 30 13 84 19 120 5 36 25 114 45 174 137 419 450 762 890 976 170 83 288 123 465 159 96 20 119 23 310 41 213 21 624 -35 787 -106 17 -8 38 -14 46 -14 9 0 19 -4 22 -10 3 -5 13 -10 22 -10 23 0 216 -94 283 -137 119 -78 200 -134 223 -155 13 -13 51 -47 85 -76 51 -43 125 -127 232 -259 5 -6 12 -23 16 -38 4 -15 13 -29 20 -32 10 -4 70 32 94 57 15 16 175 90 235 109 87 28 221 51 303 51 68 0 72 4 45 53 -28 50 -153 219 -187 253 -17 16 -65 66 -107 110 -88 92 -235 228 -299 276 -273 205 -626 372 -975 461 -33 9 -78 20 -100 26 -22 5 -62 13 -90 17 -27 3 -53 8 -56 10 -3 2 -51 10 -106 18 -114 17 -712 20 -818 5z"
  const DOT_D = "M4785 3076 c-290 -55 -489 -300 -447 -547 31 -179 176 -340 362 -401 140 -46 363 -33 485 27 121 60 167 99 226 189 125 190 100 406 -66 571 -109 109 -234 162 -405 170 -49 3 -115 -1 -155 -9z"

  // --- CONFIGURACIÓN (Overlap System) ---
  const DURATION = 4500 
  const JUMP_HEIGHT = 1000 
  const STROKE_WIDTH = 1.5

  useEffect(() => {
    if (groupRef.current && pathRef.current) {
      // 1. Auto-Centrado
      const vbW = 549, vbH = 455
      const box = pathRef.current.getBBox()
      const pad = 40
      const scale = Math.min((vbW - 2 * pad) / box.width, (vbH - 2 * pad) / box.height)
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      const tx = vbW / 2 - scale * cx
      const ty = vbH / 2 + scale * cy
      
      groupRef.current.setAttribute('transform', `translate(${tx},${ty}) scale(${scale},${-scale})`)

      // 2. Seteo de Variable CSS
      const len = pathRef.current.getTotalLength()
      groupRef.current.style.setProperty('--len', `${len}`)
    }
  }, [])

  return (
    <div className={`inline-flex justify-center items-center ${className}`} style={{ width: size, height: size, color }}>
      <svg width={size} height={size} viewBox="0 0 549 455" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <style>{`
          .brand-anim-group {
            --duration: ${DURATION}ms;
            --jump: ${JUMP_HEIGHT}px;
          }
          .brand-path {
            stroke-dasharray: var(--len);
            stroke-dashoffset: var(--len);
            animation: brand-draw var(--duration) linear infinite;
          }
          .brand-dot {
            transform-box: fill-box;
            transform-origin: center center;
            animation: brand-jump var(--duration) linear infinite;
          }

          @keyframes brand-draw {
            /* 0% -> 40%: DIBUJAR */
            0% { stroke-dashoffset: var(--len); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
            40% { stroke-dashoffset: 0; animation-timing-function: linear; }
            
            /* 40% -> 43%: ESPERA MICROSCÓPICA (Overlap) */
            /* Arranca a borrar al 43%, ANTES de que el punto aterrice al 45% */
            43% { 
              stroke-dashoffset: 0; 
              /* Ease-Out fuerte: Salida instantánea */
              animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1); 
            }
            
            /* 43% -> 85%: BORRADO */
            85% { stroke-dashoffset: var(--len); animation-timing-function: linear; }
            100% { stroke-dashoffset: var(--len); }
          }

          @keyframes brand-jump {
            /* 0% -> 5%: ESPERA INICIAL */
            0%, 5% { transform: translate(0, 0) rotate(0deg); animation-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            
            /* 5% -> 25%: SUBIDA (Anticipada) */
            25% { transform: translate(0, var(--jump)) rotate(180deg); animation-timing-function: cubic-bezier(0.6, 0.04, 0.98, 0.335); }
            
            /* 25% -> 45%: ATERRIZAJE */
            45% { transform: translate(0, 0) rotate(360deg); animation-timing-function: linear; }
            
            /* REPOSO */
            100% { transform: translate(0, 0) rotate(360deg); }
          }
        `}</style>

        <g ref={groupRef} className="brand-anim-group">
          <path d={PATH_D} fill="none" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" />
          <path ref={pathRef} d={PATH_D} fill="none" stroke="currentColor" strokeWidth={STROKE_WIDTH} strokeLinecap="round" className="brand-path" vectorEffect="non-scaling-stroke" />
          <path d={DOT_D} fill="currentColor" className="brand-dot" />
        </g>
      </svg>
    </div>
  )
}