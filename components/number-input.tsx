'use client';
// A number box that can be emptied while typing. A plain <input type="number"> holding a number
// gets "0" written back the moment it is cleared (React puts 0 into an empty number box), so
// clearing a 0 and typing 5000 ended up as "05000". This one keeps the typed text and reports
// the number; an empty box counts as `empty` and shows its value again when left.
import { useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValue: (value: number) => void;
  /** The number an empty box stands for (default 0). */
  empty?: number;
  /** Show 0 as an empty box with a "0" hint, so typing needs no deleting first. */
  blankZero?: boolean;
};

export default function NumberInput({
  value,
  onValue,
  empty = 0,
  blankZero = false,
  onBlur,
  ...rest
}: Props) {
  const shown = (v: number) => (blankZero && v === 0 ? '' : String(v));
  const [text, setText] = useState(() => shown(value));
  // Follow changes made elsewhere (a reset after an order, a form filled from data), but not
  // the echo of what is being typed.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if ((text === '' ? empty : Number(text)) !== value) setText(shown(value));
  }
  return (
    <input
      inputMode={
        String(rest.step ?? '').includes('.') || rest.step === 'any' ? 'decimal' : 'numeric'
      }
      placeholder={blankZero ? '0' : undefined}
      {...rest}
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value === '' ? empty : Number(e.target.value);
        if (Number.isFinite(n)) onValue(n);
      }}
      onBlur={(e) => {
        if (text === '' && !(blankZero && value === 0)) setText(shown(value));
        onBlur?.(e);
      }}
    />
  );
}
