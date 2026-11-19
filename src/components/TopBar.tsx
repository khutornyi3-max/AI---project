import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileDown,
  Loader2,
  LogIn,
  Menu,
} from 'lucide-react';
import type { User } from 'firebase/auth';

interface TopBarProps {
  breadcrumbLabel: string;
  isComposing: boolean;
  hasDecisions: boolean;
  hasActiveDecision: boolean;
  copied: boolean;
  isExportingPdf: boolean;
  pdfExported: boolean;
  user: User | null;
  onOpenMobileMenu: () => void;
  onCopyMarkdown: () => void;
  onExportPdf: () => void;
  onCancelCompose: () => void;
  onOpenAuth: () => void;
}

export function TopBar({
  breadcrumbLabel,
  isComposing,
  hasDecisions,
  hasActiveDecision,
  copied,
  isExportingPdf,
  pdfExported,
  user,
  onOpenMobileMenu,
  onCopyMarkdown,
  onExportPdf,
  onCancelCompose,
  onOpenAuth,
}: TopBarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!exportMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportMenuOpen]);

  const shortName = (user?.displayName || user?.email || 'Акаунт')
    .trim()
    .split(/\s+/)[0];
  const initial = shortName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Відкрити журнал рішень"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 whitespace-nowrap shrink-0 hidden sm:inline">
            Рішення
          </span>
          <span
            aria-hidden="true"
            className="text-slate-300 hidden sm:inline shrink-0"
          >
            /
          </span>
          <span className="font-medium text-slate-900 truncate">
            {breadcrumbLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {isComposing ? (
          hasDecisions ? (
            <button
              type="button"
              onClick={onCancelCompose}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              До аналізу
            </button>
          ) : null
        ) : hasActiveDecision ? (
          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              disabled={isExportingPdf}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
                  <span>Формування PDF...</span>
                </>
              ) : pdfExported ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>PDF збережено</span>
                </>
              ) : copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Скопійовано</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Експорт</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${
                      exportMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </>
              )}
            </button>

            {exportMenuOpen && (
              <div
                role="menu"
                aria-label="Параметри експорту рішення"
                className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={isExportingPdf}
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportPdf();
                  }}
                  className="w-full px-3.5 py-2.5 text-left flex items-start gap-3 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:bg-slate-50 disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      Експорт у PDF
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Зберегти повний звіт (.pdf)
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onCopyMarkdown();
                  }}
                  className="w-full px-3.5 py-2.5 text-left flex items-start gap-3 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:bg-slate-50"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {copied ? 'Скопійовано' : 'Копіювати Markdown'}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Текстовий конспект (.md)
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : null}

        {user ? (
          <button
            type="button"
            onClick={onOpenAuth}
            aria-label={`Обліковий запис Google: ${user.displayName || user.email || 'Користувач'}`}
            className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {user.photoURL && !avatarFailed ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-6 h-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <span
                aria-hidden="true"
                className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0"
              >
                {initial}
              </span>
            )}
            <span className="hidden sm:inline max-w-[110px] truncate">
              {shortName}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>Увійти</span>
          </button>
        )}
      </div>
    </header>
  );
}
