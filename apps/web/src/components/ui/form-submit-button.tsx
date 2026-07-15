'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes } from 'react';

interface FormSubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel: string;
}

export function FormSubmitButton({
  children,
  disabled,
  pendingLabel,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button {...props} aria-busy={pending} disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
