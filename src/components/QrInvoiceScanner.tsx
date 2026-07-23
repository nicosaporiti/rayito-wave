import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { CameraIcon, ScanIcon } from './Icons';
import { parseScannedInvoice } from '../lib/scanned-invoice';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

type QrInvoiceScannerProps = {
  readonly onCancel: () => void;
  readonly onScan: (invoice: string) => void;
};

type ScannerStatus =
  | { readonly type: 'starting' }
  | { readonly type: 'scanning' }
  | { readonly type: 'error'; readonly message: string };

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Necesitamos permiso para usar la cámara. Habilitalo en el navegador e intentá de nuevo.';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'No encontramos una cámara disponible en este dispositivo.';
    }
    if (error.name === 'NotReadableError') {
      return 'La cámara está siendo usada por otra aplicación.';
    }
  }

  return 'No pudimos iniciar la cámara. Podés pegar la factura manualmente.';
}

export function QrInvoiceScanner({ onCancel, onScan }: QrInvoiceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState<ScannerStatus>({ type: 'starting' });
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    let active = true;

    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setStatus({
        type: 'error',
        message: 'Este navegador no permite escanear con la cámara. Podés pegar la factura manualmente.',
      });
      return undefined;
    }

    const startScanner = async (): Promise<void> => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (!active) return;

        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 160,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
            },
          },
          video,
          (result, _error, callbackControls) => {
            if (!active || !result) return;

            const parsed = parseScannedInvoice(result.getText());
            if (!parsed.valid) {
              setScanError(parsed.error);
              return;
            }

            active = false;
            callbackControls.stop();
            onScan(parsed.invoice);
          },
        );

        controlsRef.current = controls;
        if (active) {
          setStatus({ type: 'scanning' });
        } else {
          controls.stop();
        }
      } catch (error) {
        if (active) setStatus({ type: 'error', message: cameraErrorMessage(error) });
      }
    };

    void startScanner();
    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = video.srcObject;
      if (stream && 'getTracks' in stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      video.srcObject = null;
    };
  }, [onScan]);

  return (
    <section className="qr-scanner" aria-labelledby="qr-scanner-title">
      <div className="qr-scanner-heading">
        <span className="step-label">Cámara</span>
        <h3 id="qr-scanner-title">Escaneá la invoice</h3>
        <p>Apuntá al código QR. La lectura es local y la imagen no sale del dispositivo.</p>
      </div>

      <div className="qr-camera">
        <video
          ref={videoRef}
          className="qr-camera-video"
          aria-label="Vista de la cámara para escanear QR"
          autoPlay
          muted
          playsInline
        />
        <span className="qr-camera-frame" aria-hidden="true">
          <i /><i /><i /><i />
          <span className="qr-camera-scanline" />
        </span>
        {status.type === 'starting' && (
          <span className="qr-camera-status" role="status">
            <CameraIcon />
            Iniciando cámara…
          </span>
        )}
      </div>

      {status.type === 'scanning' && (
        <p className="qr-scanner-live" role="status">
          <ScanIcon /> Buscando un QR Lightning…
        </p>
      )}
      {status.type === 'error' && <ScannerError message={status.message} />}
      {scanError && status.type !== 'error' && <ScannerError message={scanError} />}

      <Button className="text-button qr-scanner-cancel" type="button" variant="ghost" onClick={onCancel}>
        Ingresar factura manualmente
      </Button>
    </section>
  );
}

function ScannerError({ message }: { readonly message: string }) {
  return (
    <Alert className="form-error" variant="destructive" role="alert">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
