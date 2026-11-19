import { useEffect, useState } from 'react';
import { Cloud, Loader2, LogOut, ShieldCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  mapFirebaseAuthError,
  signInWithGoogle,
  signOutUser,
} from '../firebase';

interface AuthModalProps {
  open: boolean;
  user: User | null;
  cloudSyncCount: number;
  onClose: () => void;
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.51 5.51 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3a7.17 7.17 0 0 1-10.67-3.77H1.41v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.32A7.2 7.2 0 0 1 5.02 12c0-.81.14-1.59.38-2.32V6.59H1.41A12 12 0 0 0 0 12c0 1.94.46 3.77 1.41 5.41l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.41 6.59l3.99 3.09A7.15 7.15 0 0 1 12 4.75Z"
      />
    </svg>
  );
}

export function AuthModal({
  open,
  user,
  cloudSyncCount,
  onClose,
}: AuthModalProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsBusy(false);
    }
  }, [open]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isBusy) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isBusy, onClose]);

  if (!open) return null;

  async function handleGoogleSignIn() {
    setIsBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    setIsBusy(true);
    setError(null);
    try {
      await signOutUser();
      onClose();
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setIsBusy(false);
    }
  }

  const initial = (user?.displayName || user?.email || 'G')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        onClick={() => {
          if (!isBusy) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <span className="font-display text-base font-bold tracking-tight text-slate-950">
            The Tiebreaker
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Закрити форму авторизації"
            className="inline-flex items-center justify-center w-9 h-9 -mr-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {user ? (
            <>
              <div className="space-y-1">
                <h2
                  id="auth-modal-title"
                  className="font-display text-xl font-bold text-slate-950"
                >
                  Обліковий запис Google
                </h2>
                <p className="text-sm text-slate-600">
                  Ваші рішення автоматично синхронізуються у приватному хмарному сховищі.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3.5">
                {user.photoURL && !avatarFailed ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Аватар користувача'}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-11 h-11 rounded-full bg-slate-900 text-white font-display font-bold text-base flex items-center justify-center shrink-0"
                  >
                    {initial}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950 truncate">
                    {user.displayName || 'Користувач Google'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {user.email}
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-medium">
                    Синхронізовано у хмарі ·{' '}
                    <span className="font-mono tabular-nums">
                      {cloudSyncCount}
                    </span>{' '}
                    {cloudSyncCount === 1
                      ? 'рішення'
                      : cloudSyncCount >= 2 && cloudSyncCount <= 4
                        ? 'рішення'
                        : 'рішень'}
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800"
                >
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isBusy}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 rounded-lg transition-colors whitespace-nowrap"
                >
                  Готово
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  Вийти з акаунта
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <h2
                  id="auth-modal-title"
                  className="font-display text-xl font-bold text-slate-950 text-balance"
                >
                  Увійдіть через Google
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Зберігайте свої порівняльні таблиці, плюси й мінуси та SWOT-аналізи у приватному хмарному журналі.
                </p>
              </div>

              <div className="space-y-2.5 py-1 text-xs text-slate-600">
                <div className="flex items-start gap-2.5">
                  <Cloud className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>
                    Автоматична синхронізація всіх ваших рішень між браузерами та пристроями.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>
                    Захищений вхід за допомогою вашого акаунта Google — доступ до журналу маєте лише ви.
                  </span>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800 leading-relaxed"
                >
                  {error}
                </div>
              )}

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isBusy}
                  className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 disabled:opacity-60"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-700 shrink-0" />
                      <span>Підключення до Google...</span>
                    </>
                  ) : (
                    <>
                      <GoogleMark />
                      <span>Продовжити через Google</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={isBusy}
                  className="w-full px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors rounded-lg"
                >
                  Продовжити локально як гість
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
