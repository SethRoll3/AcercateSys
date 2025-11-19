'use client'

import { BrandSpinner } from '@/components/brand-spinner'

export function FullScreenLoadingSpinner() {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-center items-center">
      <div className="flex flex-col items-center gap-4">
        <BrandSpinner size={128} className="text-primary" />
        <p className="text-lg text-foreground">Cargando...</p>
      </div>
    </div>
  )
}