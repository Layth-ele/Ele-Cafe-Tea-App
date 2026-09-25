/**
 * Form patterns stories — Phase 2.3 / Phase 6
 *
 * Four canonical form shapes the app actually uses:
 *
 *   1. Single-step       — login, password reset, contact (one screen)
 *   2. Multi-step        — checkout (delivery / payment / review)
 *   3. Async validation  — email-already-taken on signup
 *   4. Autosave          — admin product editing (no submit button)
 *
 * Each is rendered with the `<Field>` primitive so accessibility
 * (htmlFor wiring, aria-describedby, aria-invalid) is automatic.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useRef, useState } from 'react';
import { Field } from '@/app/components/ui/Field';
import { CheckCircle2, Loader2 } from 'lucide-react';

const meta = {
  title: 'Patterns/Forms',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The four form shapes the app uses. Every input is wrapped ' +
          'in `<Field>` so htmlFor + aria are automatic. In real ' +
          'usage these are paired with RHF + zodResolver — these ' +
          'stories show only the visual contract.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleStep: Story = {
  name: '1 — Single-step (login)',
  render: () => (
    <form onSubmit={e => e.preventDefault()} style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field name="email">
        <Field.Label>Email</Field.Label>
        <Field.Input type="email" autoComplete="email" placeholder="you@example.com" />
      </Field>
      <Field name="password">
        <Field.Label>Password</Field.Label>
        <Field.Input type="password" autoComplete="current-password" />
      </Field>
      <button type="submit" className="btn btn-dark btn-full btn-lg">Sign in</button>
    </form>
  ),
};

export const MultiStep: Story = {
  name: '2 — Multi-step (checkout)',
  render: () => {
    function MultiStepDemo() {
      const [step, setStep] = useState<'delivery' | 'payment' | 'review'>('delivery');
      const steps: Array<{ id: 'delivery' | 'payment' | 'review'; label: string }> = [
        { id: 'delivery', label: 'Delivery' },
        { id: 'payment',  label: 'Payment'  },
        { id: 'review',   label: 'Review'   },
      ];
      return (
        <div style={{ maxWidth: 480 }}>
          {/* Progress indicator */}
          <ol style={{ display: 'flex', listStyle: 'none', padding: 0, margin: '0 0 24px', gap: 8 }}>
            {steps.map((s, i) => {
              const idx = steps.findIndex(x => x.id === step);
              const done = i < idx;
              const cur = i === idx;
              return (
                <li
                  key={s.id}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: cur ? 'var(--midnight)' : done ? 'var(--gold-soft)' : 'var(--surface-2)',
                    color:      cur ? 'var(--on-dark)' : done ? 'var(--gold-text)' : 'var(--muted)',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}
                >
                  {s.label}
                </li>
              );
            })}
          </ol>

          {step === 'delivery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field name="name" required>
                <Field.Label>Full name</Field.Label>
                <Field.Input autoComplete="name" />
              </Field>
              <Field name="address" required>
                <Field.Label>Street address</Field.Label>
                <Field.Input autoComplete="street-address" />
              </Field>
              <button type="button" className="btn btn-dark" onClick={() => setStep('payment')}>Continue to Payment</button>
            </div>
          )}
          {step === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field name="promo">
                <Field.Label>Promo code (optional)</Field.Label>
                <Field.Input placeholder="WELCOME10" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setStep('delivery')}>Back</button>
                <button type="button" className="btn btn-dark" onClick={() => setStep('review')}>Review</button>
              </div>
            </div>
          )}
          {step === 'review' && (
            <div>
              <p style={{ marginBottom: 16 }}>Ready to place your order — review the summary on the right.</p>
              <button type="button" className="btn btn-outline" onClick={() => setStep('payment')}>Back</button>
            </div>
          )}
        </div>
      );
    }
    return <MultiStepDemo />;
  },
};

export const AsyncValidation: Story = {
  name: '3 — Async validation (email taken)',
  render: () => {
    function AsyncValidationDemo() {
      const [email, setEmail] = useState('taken@example.com');
      const taken = email.trim().toLowerCase() === 'taken@example.com';
      return (
        <form onSubmit={e => e.preventDefault()} style={{ maxWidth: 360 }}>
          <Field name="email">
            <Field.Label>Email</Field.Label>
            <Field.Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              aria-invalid={taken ? 'true' : undefined}
              aria-describedby={taken ? 'email-taken' : undefined}
            />
            {taken && (
              <Field.Error>
                That email is already registered.{' '}
                <button
                  type="button"
                  onClick={() => alert('Demo: would navigate to /login')}
                  style={{ color: 'inherit', textDecoration: 'underline', background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
                >
                  Sign in instead?
                </button>
              </Field.Error>
            )}
            {!taken && email && (
              <p style={{ marginTop: 6, fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} /> Email is available
              </p>
            )}
          </Field>
        </form>
      );
    }
    return <AsyncValidationDemo />;
  },
};

export const Autosave: Story = {
  name: '4 — Autosave (no submit button)',
  render: () => {
    function AutosaveDemo() {
      const [val, setVal] = useState('Royal Green Premium');
      const [savedAt, setSavedAt] = useState<Date | null>(new Date());
      const [pending, setPending] = useState(false);
      const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      useEffect(() => {
        return () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
        };
      }, []);

      function handleChange(v: string) {
        setVal(v);
        setPending(true);
        setSavedAt(null);
        // Debounce stand-in — flips to saved after 800ms idle.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          setPending(false);
          setSavedAt(new Date());
        }, 800);
      }

      return (
        <form onSubmit={e => e.preventDefault()} style={{ maxWidth: 360 }}>
          <Field name="productName">
            <Field.Label>Product name</Field.Label>
            <Field.Input value={val} onChange={e => handleChange(e.target.value)} />
            <Field.Hint>
              {pending ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                  <Loader2 size={11} className="icon-spin" /> Saving…
                </span>
              ) : savedAt ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success)' }}>
                  <CheckCircle2 size={11} /> Saved {savedAt.toLocaleTimeString()}
                </span>
              ) : null}
            </Field.Hint>
          </Field>
        </form>
      );
    }
    return <AutosaveDemo />;
  },
};
