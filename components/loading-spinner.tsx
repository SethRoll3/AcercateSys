'use client'

import { BrandSpinner } from '@/components/brand-spinner'

export function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-full">
      <div className="flex flex-col items-center gap-3">
        <BrandSpinner size={72} className="text-primary" />
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    </div>
  )
}