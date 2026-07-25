import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { CameraIcon, ScanIcon } from './Icons';
import { useI18n } from '../i18n/useI18n';
import type { MessageKey } from '../i18n/messages';
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
  | { readonly type: 'error'; readonly messageKey: MessageKey };

function cameraErrorKey(error: unknown): MessageKey {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'scanner.error.permission';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'scanner.error.notFound';
    }
    if (error.name === 'NotReadableError') {
      return 'scanner.error.busy';
    }
  }

  return 'scanner.error.generic';
}

export function QrInvoiceScanner({ onCancel, onScan }: QrInvoiceScannerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState<ScannerStatus>({ type: 'starting' });
  const [scanErrorKey, setScanErrorKey] = useState<MessageKey | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    let active = true;

    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setStatus({ type: 'error', messageKey: 'scanner.error.unsupported' });
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
              setScanErrorKey(parsed.error);
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
        if (active) setStatus({ type: 'error', messageKey: cameraErrorKey(error) });
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
        <span className="step-label">{t('scanner.step')}</span>
        <h3 id="qr-scanner-title">{t('scanner.title')}</h3>
        <p>{t('scanner.copy')}</p>
      </div>

      <div className="qr-camera">
        <video
          ref={videoRef}
          className="qr-camera-video"
          aria-label={t('scanner.video.aria')}
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
            {t('scanner.starting')}
          </span>
        )}
      </div>

      {status.type === 'scanning' && (
        <p className="qr-scanner-live" role="status">
          <ScanIcon /> {t('scanner.scanning')}
        </p>
      )}
      {status.type === 'error' && <ScannerError message={t(status.messageKey)} />}
      {scanErrorKey && status.type !== 'error' && <ScannerError message={t(scanErrorKey)} />}

      <Button className="text-button qr-scanner-cancel" type="button" variant="ghost" onClick={onCancel}>
        {t('scanner.cancel')}
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
