import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpIcon } from './Icons';

type BackupProps = {
  mnemonic: readonly string[];
  onConfirmed: () => void;
};

const CHECK_INDEXES = [3, 11, 23] as const;

export function Backup({ mnemonic, onConfirmed }: BackupProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const valid = CHECK_INDEXES.every((index) => answers[index]?.trim().toLowerCase() === mnemonic[index]?.toLowerCase());
    if (!valid) return setError('Alguna palabra no coincide. Revisá tu copia e intentá otra vez.');
    onConfirmed();
  };

  return (
    <main className="backup-stage">
      <section className="backup-card">
        <div className="backup-heading"><div><span className="step-label">02 — Respaldo</span><h1>Estas 24 palabras son tu wallet.</h1></div><span className="backup-count">24</span></div>
        <div className="warning-strip"><strong>Guardalas fuera de internet.</strong> Quien tenga estas palabras puede mover tus fondos. No hay botón de “recuperar contraseña”.</div>
        <ol className="words-grid">
          {mnemonic.map((word, index) => <li key={`${word}-${index}`}><span>{index + 1}</span>{word}</li>)}
        </ol>

        <form className="backup-check" onSubmit={confirm}>
          <h2>Confirmemos tu copia</h2>
          <p>Ingresá estas tres palabras para continuar.</p>
          <div className="check-fields">
            {CHECK_INDEXES.map((index) => (
              <label className="field" key={index}><span>Palabra #{index + 1}</span><input value={answers[index] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))} autoComplete="off" /></label>
            ))}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">Ya guardé mi frase <ArrowUpIcon /></button>
        </form>
      </section>
    </main>
  );
}
