import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DialogProps = {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly panelClassName?: string;
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Dialog({ ariaLabel, children, onClose, panelClassName = '' }: DialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const viewport = window.visualViewport;
    if (!overlay || !viewport) return;
    let animationFrame: number | null = null;

    const syncViewport = (): void => {
      overlay.style.setProperty('--visual-viewport-top', `${viewport.offsetTop}px`);
      overlay.style.setProperty('--visual-viewport-left', `${viewport.offsetLeft}px`);
      overlay.style.setProperty('--visual-viewport-width', `${viewport.width}px`);
      overlay.style.setProperty('--visual-viewport-height', `${viewport.height}px`);
    };
    const scheduleViewportSync = (): void => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        syncViewport();
      });
    };

    syncViewport();
    viewport.addEventListener('resize', scheduleViewportSync);
    viewport.addEventListener('scroll', scheduleViewportSync);
    window.addEventListener('resize', scheduleViewportSync);

    return () => {
      viewport.removeEventListener('resize', scheduleViewportSync);
      viewport.removeEventListener('scroll', scheduleViewportSync);
      window.removeEventListener('resize', scheduleViewportSync);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const handleDialogKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !panel.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    appShell?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleDialogKey);
    closeButtonRef.current?.focus();

    return () => {
      appShell?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleDialogKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };
  const panelClasses = `action-panel ${panelClassName}`.trim();

  return createPortal(
    <div ref={overlayRef} className="action-overlay" onMouseDown={closeOnBackdrop}>
      <section ref={panelRef} className={panelClasses} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        <Button
          ref={closeButtonRef}
          className="panel-close"
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X aria-hidden="true" />
        </Button>
        <div className="action-panel-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
