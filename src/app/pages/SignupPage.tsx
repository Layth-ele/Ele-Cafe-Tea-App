/**
 * SignupPage.tsx — Phase 6 form migration
 *
 * Migrated from ad-hoc useState to RHF + Zod + <Field> + <SubmitButton>,
 * matching the LoginPage pattern. Uses the new signupFormSchema from
 * src/schemas/user.schema.ts which adds the confirm-password field
 * + cross-field check + uppercase/number rules to the base
 * signupSchema (the latter is what the backend validates against).
 *
 * Why a separate "form" schema vs the base signupSchema:
 *   The base schema represents the BACKEND CONTRACT — what gets sent
 *   to Firebase Auth + Firestore. The form schema adds UI-only
 *   concerns: the confirm-password field, the uppercase/number
 *   rules. Splitting them means the schema source-of-truth stays
 *   honest (don't send confirm to the backend) while the form's
 *   client-side validation gets all the rules it needs.
 */
import { useState, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ROUTES } from '@/lib/routes';
import { Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { signupFormSchema, type SignupFormInput } from '@/schemas/user.schema';
import { authErrorMessage } from '@/lib/authErrors';
import { safeReturnUrlOr } from '@/lib/safeReturnUrl';
import { markWelcomeVerifyPending } from '@/app/components/WelcomeVerifyModal';
import { Field } from '@/app/components/ui/Field';
import { SubmitButton } from '@/app/components/ui/SubmitButton';

import { useT, tNow } from '@/i18n/useT';
export function SignupPage() {
  const t = useT();
  const navigate  = useNavigate();
  const location  = useLocation();
  const returnUrl = safeReturnUrlOr(location.search, ROUTES.HOME);

  // Pre-fill email from URL query param. This happens when the user
  // arrives via the "Create account" button in the NoAccountFoundModal —
  // they typed an email that didn't have an account, and we don't want
  // to make them retype it. The query param is encoded by the modal so
  // + aliases, ampersands, etc. survive the round-trip.
  const initialEmail = (() => {
    try {
      return new URLSearchParams(location.search).get('email') ?? '';
    } catch (err) {
      console.warn('[SignupPage] Failed to read email query param:', err);
      return '';
    }
  })();

  const [gLoading, setGLoading] = useState(false);

  const { signup, loginWithGoogle } = useAuth();
  const { executeAndVerify } = useRecaptcha();

  const form = useForm<SignupFormInput>({
    resolver: zodResolver(signupFormSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { displayName: '', email: initialEmail, password: '', confirm: '' },
  });

  // Watch the live password so the strength meter updates as the
  // user types. useWatch subscribes to a single field without
  // re-rendering the whole form on every keystroke, which a useState
  // mirror would do.
  const password = useWatch({ control: form.control, name: 'password' }) ?? '';

  const passwordStrength = useCallback((pw: string) => {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0-5
  }, []);
  const pwScore = passwordStrength(password);
  const pwLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][pwScore] || '';
  const pwColor = ['', 'var(--danger)', 'var(--warning)', 'var(--warning)', 'var(--success)', 'var(--success)'][pwScore] || '';

  const handleSignup = async (data: SignupFormInput) => {
    try {
      // reCAPTCHA v3 — verify score server-side before creating account.
      const captcha = await executeAndVerify('signup');
      if (!captcha.pass) {
        toast.error(tNow('Automated activity detected. Please try again.'));
        return;
      }
      await signup(data.email, data.password, data.displayName);
      // Mark the welcome-verify flag so the modal pops up on the next
      // page (the AppShell-level <WelcomeVerifyModal /> reads this
      // flag on mount). Replaces the previous toast which users
      // tended to dismiss before reading.
      markWelcomeVerifyPending();
      navigate(returnUrl, { replace: true });
    } catch (err: unknown) {
      const msg = tNow(authErrorMessage(err));
      if (msg) toast.error(msg);
    }
  };

  const handleGoogle = async () => {
    setGLoading(true);
    try {
      await loginWithGoogle();
      navigate(returnUrl, { replace: true });
    } catch (err: unknown) {
      const msg = tNow(authErrorMessage(err));
      if (msg) toast.error(msg);
    } finally {
      setGLoading(false);
    }
  };

  return (
    <div className="lp-panel">
      <SeoHead title="Create Account | Ele Café" description="Join Ele Café and earn loyalty points on every order. New members receive 500 welcome points." noIndex={true} />
      <div className="lp-card">

        <div className="lp-head">
          <span className="overline lp-overline">{t('Ele Café · Vancouver')}</span>
          <h2>{t('Create account')}</h2>
          <p className="text-sm text-muted lp-subtitle">{t('Join and earn rewards on every order')}</p>
          <div className="hero-rule lp-rule" />
        </div>

        <div className="stack-4">
          <button onClick={handleGoogle} disabled={gLoading} className="btn btn-outline btn-full lp-google">
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z"/>
            </svg>
            {gLoading ? t('Signing in…') : t('Continue with Google')}
          </button>

          <div className="lp-divider-row">
            <div className="divider lp-divider" />
            <span className="lp-divider-text">{t('or')}</span>
            <div className="divider lp-divider" />
          </div>

          <form onSubmit={form.handleSubmit(handleSignup)} className="stack-4">
            <Field name="displayName" required>
              <Field.Label>{t('Full name')}</Field.Label>
              <Field.Input
                type="text"
                autoComplete="name"
                {...form.register('displayName')}
              />
              <Field.Error>{form.formState.errors.displayName?.message}</Field.Error>
            </Field>

            <Field name="email" required>
              <Field.Label>{t('Email address')}</Field.Label>
              <Field.Input
                type="email"
                autoComplete="email"
                {...form.register('email')}
              />
              <Field.Error>{form.formState.errors.email?.message}</Field.Error>
            </Field>

            <Field name="password" required>
              <Field.Label>{t('Password')}</Field.Label>
              <Field.Input
                type="password"
                autoComplete="new-password"
                {...form.register('password')}
              />
              <Field.Error>{form.formState.errors.password?.message}</Field.Error>
              {/* Strength meter — purely visual feedback, distinct
                  from the validation message below. The schema
                  enforces uppercase + number rules; this meter just
                  reinforces what the user is achieving. The bar is
                  dynamic (width + color) so it stays inline with the
                  documented disable + CSS-var pattern. */}
              {password.length > 0 && (
                <div className="sp-pw-meter-wrap">
                  <div className="sp-pw-meter-track">
                    <div
                      className="sp-pw-meter-fill"
                      // eslint-disable-next-line react/forbid-dom-props
                      style={{
                        ['--sp-pw-w' as string]: `${(pwScore / 5) * 100}%`,
                        ['--sp-pw-color' as string]: pwColor,
                      }}
                    />
                  </div>
                  <p
                    className="sp-pw-meter-label"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ ['--sp-pw-color' as string]: pwColor }}
                  >
                    {t(pwLabel)} — {t('min 8 chars, one uppercase, one number')}
                  </p>
                </div>
              )}
            </Field>

            <Field name="confirm" required>
              <Field.Label>{t('Confirm password')}</Field.Label>
              <Field.Input
                type="password"
                autoComplete="new-password"
                {...form.register('confirm')}
              />
              <Field.Error>{form.formState.errors.confirm?.message}</Field.Error>
            </Field>

            <SubmitButton variant="dark" loadingLabel={t('Creating account…')} className="btn-full">
              {t('Create Account')}
            </SubmitButton>
          </form>

          <p className="text-sm text-muted lp-signup-prompt">
            {t('Already have an account?')}{' '}
            <Link to={`${ROUTES.LOGIN}${location.search}`} className="lp-signup-link">
              {t('Sign in')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
export default SignupPage;
