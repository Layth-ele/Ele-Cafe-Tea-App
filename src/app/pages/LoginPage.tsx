/**
 * LoginPage.tsx — Phase 6 reference migration
 *
 * Migrated from ad-hoc useState to RHF + Zod + <Field> + <SubmitButton>.
 * This is the canonical Phase-6 pattern; subsequent form migrations
 * (AccountPage, ContactCard, etc.) follow the same shape.
 *
 * Validation timing (Phase 6.2):
 *   mode='onTouched' + reValidateMode='onChange' →
 *     - First-pass: validate onBlur (don't yell while typing).
 *     - After first error: validate onChange (clear the error the
 *       moment it's fixed).
 *     - On submit: validate everything, focus first error.
 *
 * Errors flow:
 *   Validation errors → schema messages → <Field.Error> (inline,
 *     never a toast). Auth errors (wrong-password, no-such-user) →
 *     toast (network-class, not validation-class).
 *
 * The reset sub-form uses the same primitives.
 *
 * Phase 3: also migrated panel/card inline styles to .lp-* classes
 * in design.css.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ROUTES } from '@/lib/routes';
import { Link, useNavigate, useLocation, Navigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { authErrorMessage } from '@/lib/authErrors';
import { safeReturnUrlOr } from '@/lib/safeReturnUrl';
import { Field } from '@/app/components/ui/Field';
import { SubmitButton } from '@/app/components/ui/SubmitButton';
import { AuthBootSplash } from '@/app/components/AuthBootSplash';
import {
  loginSchema,
  passwordResetSchema,
  type LoginInput,
  type PasswordResetInput,
} from '@/schemas/auth.schema';
import { PasswordResetSentModal } from '@/app/components/modals/PasswordResetModals';
import { isInventoryEmail } from '@/lib/inventoryAccount';
import { clearStaffDevice } from '@/features/inventory/lib/staffDevice';

import { useT, tNow } from '@/i18n/useT';
/** Staff account → the inventory app; anyone else → returnUrl, except
 *  never an inventory page (only the staff account can use it — sending a
 *  customer there would bounce straight back here). */
const LOGIN_TIMEOUT = 'login-timeout';
const LOGIN_TIMEOUT_MS = 30000;

function postLoginDestination(email: string | null | undefined, returnUrl: string): string {
  if (isInventoryEmail(email)) return ROUTES.INVENTORY;
  const isInventoryPath =
    returnUrl === ROUTES.INVENTORY ||
    returnUrl.startsWith(`${ROUTES.INVENTORY}/`) ||
    returnUrl.startsWith(`${ROUTES.INVENTORY}?`);
  return isInventoryPath ? ROUTES.HOME : returnUrl;
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function LoginPage() {
  const t = useT();
  const [showReset, setShowReset] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  // Modal state for the post-reset flow. We capture the submitted email
  // separately because the form may be re-opened with a different
  // value while a result modal is still open.
  //
  // The "no account found" modal that previously rendered when the
  // reset callable returned { registered: false } was removed when we
  // closed the account-enumeration leak (see authEmails.ts and
  // handleReset below). The modal source file is kept in the components
  // tree for now in case a future flow has a non-enumerating use for it.
  const [showResetSent, setShowResetSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const { login, loginWithGoogle, resetPassword, currentUser, loading: authLoading } = useAuth();
  const { executeAndVerify } = useRecaptcha();
  const navigate = useNavigate();
  const location = useLocation();
  const returnUrl = safeReturnUrlOr(location.search, ROUTES.HOME);

  // RHF for the login form. defaultValues are required so the
  // resolver knows the shape; without them, the schema would see
  // `undefined` on initial validate and report bogus errors.
  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  // Separate RHF instance for the reset sub-form. Two forms = two
  // useForm calls — RHF state doesn't share across forms.
  const resetForm = useForm<PasswordResetInput>({
    resolver: zodResolver(passwordResetSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  });

  // If the user lands on /login while already authenticated, send
  // them straight to their post-login destination. Two scenarios:
  //   1. Bookmark / typed URL while signed in — they probably meant
  //      to go somewhere else.
  //   2. The brief post-login navigation race (now fixed in
  //      AuthContext.login by eagerly setting currentUser, but a
  //      browser-back from a guarded page could still land them
  //      here while authenticated).
  // Render-time redirect rather than navigate() in an effect so the
  // login form never flashes. All hooks above this point have run
  // unconditionally — Rules of Hooks compliant.
  if (authLoading) {
    return <AuthBootSplash />;
  }
  if (currentUser) {
    return <Navigate to={postLoginDestination(currentUser.email, returnUrl)} replace />;
  }

  const handleLogin = async (data: LoginInput) => {
    try {
      // reCAPTCHA v3 — verify score server-side before allowing login.
      const captcha = await executeAndVerify('login');
      if (!captcha.pass) {
        toast.error(tNow('Automated activity detected. Please try again later.'));
        return;
      }
      // Signing in as anyone but the staff account: this device is no
      // longer a staff device (stops the boot-time jump to /inventory).
      if (!isInventoryEmail(data.email)) clearStaffDevice();
      // Never leave the button spinning: if Firebase hasn't answered in
      // 30 s, stop and say so. Should the sign-in land later anyway, the
      // auth listener picks it up and this page redirects on its own.
      const user = await Promise.race([
        login(data.email, data.password),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(LOGIN_TIMEOUT)), LOGIN_TIMEOUT_MS),
        ),
      ]);
      navigate(postLoginDestination(user.email, returnUrl), { replace: true });
    } catch (err: unknown) {
      if ((err as Error)?.message === LOGIN_TIMEOUT) {
        toast.error(
          tNow('Signing in is taking longer than expected. Check your connection and try again.'),
        );
        return;
      }
      const msg = tNow(authErrorMessage(err));
      if (msg) toast.error(msg);
    }
  };

  const handleGoogle = async () => {
    setGLoading(true);
    // Google is never the staff account — un-mark the device BEFORE the
    // sign-in, because on iPhone it can reload the page (redirect flow).
    clearStaffDevice();
    try {
      const user = await loginWithGoogle();
      if (user) {
        navigate(postLoginDestination(user.email, returnUrl), { replace: true });
      }
    } catch (err: unknown) {
      const msg = tNow(authErrorMessage(err));
      if (msg) toast.error(msg);
    } finally {
      setGLoading(false);
    }
  };

  const handleReset = async (data: PasswordResetInput) => {
    setSubmittedEmail(data.email);
    try {
      await resetPassword(data.email);
      // Hardened against account enumeration: the callable always
      // resolves successfully whether or not the email matches an
      // account, so we ALWAYS show the same "check your inbox" modal.
      // Pre-hardening the UI branched on `result.registered` to render
      // a separate "no account found" modal, which doubled as an
      // enumeration oracle. See authEmails.ts → sendBrandedPasswordReset
      // for the full security write-up.
      setShowResetSent(true);
      setShowReset(false);
    } catch (err: unknown) {
      // Genuine errors only — bad email format, rate-limit, or a
      // server-internal failure. Firebase's auth/user-not-found CAN'T
      // surface here anymore (the callable swallows it before
      // returning), so the "no account" modal branch was removed —
      // showing it would leak the same signal the server now hides.
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'functions/resource-exhausted' || code === 'resource-exhausted') {
        toast.error(
          tNow(
            "We've sent a reset link recently for this email. Please check your inbox (including spam) or try again in a few minutes.",
          ),
        );
      } else {
        const msg = tNow(authErrorMessage(err));
        if (msg) toast.error(msg);
      }
    }
  };

  if (showReset)
    return (
      <div className="lp-panel">
        <SeoHead
          title="Sign In | Ele Café"
          description="Sign in to your Ele Café account to track orders, redeem credits, and manage your profile."
          noIndex={true}
        />
        <div className="lp-card">
          <div className="lp-head">
            <h2>{t('Reset password')}</h2>
            <p className="text-sm text-muted lp-subtitle">
              {t("Enter your email and we'll send a reset link.")}
            </p>
          </div>
          <form onSubmit={resetForm.handleSubmit(handleReset)} className="stack-4">
            <Field name="resetEmail" required>
              <Field.Label>{t('Email address')}</Field.Label>
              <Field.Input
                type="email"
                autoComplete="email"
                placeholder={t('your@email.com')}
                {...resetForm.register('email')}
              />
              <Field.Error>{resetForm.formState.errors.email?.message}</Field.Error>
            </Field>
            <SubmitButton variant="dark" loadingLabel={t('Sending…')} className="btn-full">
              {t('Send Reset Link')}
            </SubmitButton>
            <button
              type="button"
              className="btn btn-ghost btn-full btn-sm"
              onClick={() => setShowReset(false)}
            >
              {t('← Back to sign in')}
            </button>
          </form>
        </div>
      </div>
    );

  return (
    <div className="lp-panel">
      <div className="lp-card">
        <div className="lp-head">
          <span className="overline lp-overline">{t('Ele Café · Vancouver')}</span>
          <h2>{t('Welcome back')}</h2>
          <p className="text-sm text-muted lp-subtitle">{t('Sign in to your account')}</p>
          <div className="hero-rule lp-rule" />
        </div>

        <div className="stack-4">
          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={gLoading}
            className="btn btn-outline btn-full lp-google"
          >
            <GoogleIcon />
            {gLoading ? t('Signing in…') : t('Continue with Google')}
          </button>

          {/* Divider */}
          <div className="lp-divider-row">
            <div className="divider lp-divider" />
            <span className="lp-divider-text">{t('or')}</span>
            <div className="divider lp-divider" />
          </div>

          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="stack-4">
            <Field name="email" required>
              <Field.Label>{t('Email address')}</Field.Label>
              <Field.Input
                type="email"
                autoComplete="email"
                placeholder={t('your@email.com')}
                {...loginForm.register('email')}
              />
              <Field.Error>{loginForm.formState.errors.email?.message}</Field.Error>
            </Field>
            <Field name="password" required>
              <div className="lp-pass-row">
                <Field.Label className="lp-pass-label">{t('Password')}</Field.Label>
                <button
                  type="button"
                  onClick={() => {
                    resetForm.reset({ email: loginForm.getValues('email') });
                    setShowReset(true);
                  }}
                  className="lp-forgot-btn"
                >
                  {t('Forgot?')}
                </button>
              </div>
              <Field.Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...loginForm.register('password')}
              />
              <Field.Error>{loginForm.formState.errors.password?.message}</Field.Error>
            </Field>
            <SubmitButton variant="dark" loadingLabel={t('Signing in…')} className="btn-full">
              {t('Sign In')}
            </SubmitButton>
          </form>

          <p className="text-sm text-muted lp-signup-prompt">
            {t('New to Ele Café?')}{' '}
            <Link to={`${ROUTES.SIGNUP}${location.search}`} className="lp-signup-link">
              {t('Create account')}
            </Link>
          </p>
        </div>
      </div>

      {/* Reset-flow result modal. Single uniform "check your inbox"
          confirmation regardless of whether the email matched an
          account — see handleReset for the security rationale. */}
      <PasswordResetSentModal
        open={showResetSent}
        onClose={() => setShowResetSent(false)}
        email={submittedEmail}
      />
    </div>
  );
}
export default LoginPage;
