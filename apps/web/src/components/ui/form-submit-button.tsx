'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes } from 'react';

export interface FormActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

interface IntegrationActionFormProps {
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  children: ReactNode;
  className?: string;
}

const INITIAL_ACTION_STATE: FormActionState = { status: 'idle' };

export function IntegrationActionForm({ action, children, className }: IntegrationActionFormProps) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form
      action={formAction}
      className={className}
      aria-busy={state.status === 'idle' ? undefined : false}
    >
      {children}
      {state.message ? (
        <p
          className={`integration-action-message ${state.status === 'error' ? 'form-error' : 'form-status'}`}
          role={state.status === 'error' ? 'alert' : 'status'}
          aria-live={state.status === 'error' ? 'assertive' : 'polite'}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

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
