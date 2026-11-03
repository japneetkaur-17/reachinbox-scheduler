import { useEffect, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { links } from '../lib/api';
import { Button } from '../components/ui/Button';
import { FullPageSpinner } from '../components/ui/Spinner';

const errorCopy: Record<string, string> = {
  access_denied: 'You cancelled the Google sign-in.',
  invalid_state: 'The sign-in session expired. Please try again.',
  oauth_failed: 'Google sign-in failed. Please try again.',
};

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export function LoginPage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (error) toast.error(errorCopy[error] ?? 'Sign-in failed.');
  }, [error, toast]);

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/scheduled" replace />;

  // The design shows an email/password form; this deployment authenticates
  // with Google only (as the brief requires), so the form points users there.
  const onEmailLogin = (e: FormEvent) => {
    e.preventDefault();
    toast.info('Email sign-in is not enabled yet — please continue with Google.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-[380px]">
        <h1 className="mb-12 text-center text-6xl font-bold tracking-tight text-ink">Login</h1>

        <a
          href={links.googleLogin}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-mint text-xl text-ink transition-colors hover:bg-brand-100"
        >
          <GoogleIcon />
          Login with Google
        </a>

        <div className="my-8 flex items-center gap-4">
          <span className="h-px flex-1 bg-[#E5E5E5]" />
          <span className="text-base tracking-wide text-ink-faint">or sign up through email</span>
          <span className="h-px flex-1 bg-[#E5E5E5]" />
        </div>

        <form onSubmit={onEmailLogin} className="space-y-4">
          <input type="email" placeholder="Email ID" autoComplete="email" aria-label="Email ID" className="input-filled h-16" />
          <input type="password" placeholder="Password" autoComplete="current-password" aria-label="Password" className="input-filled h-16" />
          <Button type="submit" shape="rounded" size="lg" block className="!mt-8 h-14">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
