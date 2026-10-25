import React, { createContext, useCallback, useContext, useId, useMemo, useState } from 'react';

/* ---------------- toast ---------------- */

type Toast = { id: number; text: string; error?: boolean };
const ToastCtx = createContext<{ push: (text: string, error?: boolean) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, text, error }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 2800);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={t.error ? 'toast err' : 'toast'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------------- layout primitives ---------------- */

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="page-head">
      <h1 className="page-title">{title}</h1>
      {sub ? <p className="page-sub">{sub}</p> : null}
    </div>
  );
}

export function Card({
  title,
  sub,
  actions,
  children,
  tight,
}: {
  title?: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <section className="card">
      {title || actions ? (
        <header className="card-head">
          <div>
            <div className="card-title">{title}</div>
            {sub ? <div className="card-sub">{sub}</div> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={tight ? 'card-body tight' : 'card-body'}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </div>
    </div>
  );
}

export function Hint({ children, kind }: { children: React.ReactNode; kind?: 'warn' | 'err' }) {
  return <div className={kind ? `hint ${kind}` : 'hint'}>{children}</div>;
}

/* ---------------- inputs ---------------- */

export interface NumFieldProps {
  label: string;
  value: number | '';
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  unit?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Numeric input. Accepts Persian/Arabic digits and both '.' and '٫'
 * decimal separators so workshop keyboards just work.
 */
export function NumField({ label, value, onChange, step = 0.1, min, unit, hint, disabled }: NumFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? <span className="unit-suffix"> ({unit})</span> : null}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        dir="ltr"
        value={shown}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = parseLocalizedNumber(raw);
          if (n !== null && (min === undefined || n >= min)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const base = typeof value === 'number' ? value : 0;
            const next = Math.round((base + delta) * 1e6) / 1e6;
            if (min === undefined || next >= min) onChange(next);
            setDraft(null);
          }
        }}
      />
      {hint ? <span className="dim small">{hint}</span> : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------- modal ---------------- */

export function Modal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Parse a number typed with Persian/Arabic digits or a Persian decimal separator. */
export function parseLocalizedNumber(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === '') return null;
  s = s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[٫،]/g, '.').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function money(n: number, currency: string): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  return `${rounded.toLocaleString('en-US')} ${currency}`;
}
