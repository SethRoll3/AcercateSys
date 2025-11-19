'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CheckCircle, XCircle, Clock, Eye, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { PaymentConfirmationStatus } from '@/lib/types'

interface PaymentConfirmationStatusProps {
  paymentId: string
  status: PaymentConfirmationStatus
  receiptImageUrl?: string | null
  confirmedBy?: string | null
  confirmedAt?: string | null
  rejectionReason?: string | null
  onStatusChange?: () => void
  canConfirm?: boolean
}

export function PaymentConfirmationStatus({
  paymentId,
  status,
  receiptImageUrl,
  confirmedBy,
  confirmedAt,
  rejectionReason,
  onStatusChange,
  canConfirm = false
}: PaymentConfirmationStatusProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectionText, setRejectionText] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)

  const getStatusBadge = () => {
    switch (status) {
      case 'confirmado':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Confirmado
          </Badge>
        )
      case 'rechazado':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Rechazado
          </Badge>
        )
      case 'pendiente':
      default:
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        )
    }
  }

  const handleConfirm = async () => {
    setIsConfirming(true)
    try {
      const response = await fetch(`/api/payments/${paymentId}/confirm`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'confirm' }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al confirmar el pago')
      }

      toast.success('Pago confirmado exitosamente')
      onStatusChange?.()
    } catch (error) {
      console.error('Error confirming payment:', error)
      toast.error(error instanceof Error ? error.message : 'Error al confirmar el pago')
    } finally {
      setIsConfirming(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionText.trim()) {
      toast.error('Debe proporcionar una razón para el rechazo')
      return
    }

    setIsRejecting(true)
    try {
      const response = await fetch(`/api/payments/${paymentId}/confirm`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'reject',
          rejectionReason: rejectionText.trim()
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al rechazar el pago')
      }

      toast.success('Pago rechazado')
      setShowRejectDialog(false)
      setRejectionText('')
      onStatusChange?.()
    } catch (error) {
      console.error('Error rejecting payment:', error)
      toast.error(error instanceof Error ? error.message : 'Error al rechazar el pago')
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Estado de Confirmación</span>
          {getStatusBadge()}
        </CardTitle>
        <CardDescription>
          Estado actual del pago y acciones disponibles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Receipt Image */}
        {receiptImageUrl && (
          <div className="space-y-2">
            <Label>Boleta de Pago</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImageDialog(true)}
              >
                <Eye className="w-4 h-4 mr-2" />
                Ver Boleta
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Details */}
        {status === 'confirmado' && confirmedAt && (
          <div className="space-y-2">
            <Label>Detalles de Confirmación</Label>
            <p className="text-sm text-muted-foreground">
              Confirmado el {new Date(confirmedAt).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        )}

        {/* Rejection Details */}
        {status === 'rechazado' && rejectionReason && (
          <div className="space-y-2">
            <Label>Razón del Rechazo</Label>
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{rejectionReason}</p>
              </div>
            </div>
            {confirmedAt && (
              <p className="text-sm text-muted-foreground">
                Rechazado el {new Date(confirmedAt).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {canConfirm && status === 'pendiente' && (
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex-1"
            >
              {isConfirming ? 'Confirmando...' : 'Confirmar Pago'}
            </Button>
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="flex-1">
                  Rechazar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rechazar Pago</DialogTitle>
                  <DialogDescription>
                    Proporcione una razón para rechazar este pago. Esta acción notificará al cliente.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rejection-reason">Razón del rechazo</Label>
                    <Textarea
                      id="rejection-reason"
                      placeholder="Explique por qué se rechaza este pago..."
                      value={rejectionText}
                      onChange={(e) => setRejectionText(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowRejectDialog(false)}
                    disabled={isRejecting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isRejecting || !rejectionText.trim()}
                  >
                    {isRejecting ? 'Rechazando...' : 'Rechazar Pago'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Image Dialog */}
        <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Boleta de Pago</DialogTitle>
            </DialogHeader>
            {receiptImageUrl && (
              <div className="flex justify-center">
                <img
                  src={receiptImageUrl}
                  alt="Boleta de pago"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setShowImageDialog(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}