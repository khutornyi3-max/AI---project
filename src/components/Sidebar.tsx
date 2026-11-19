import { useMemo, useState } from 'react';
import { LogIn, Plus, Search, Trash2, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { DecisionRecord } from '../types/decision';

interface SidebarProps {
  decisions: DecisionRecord[];
  activeDecisionId: string | null;
  isComposing: boolean;
  mobileOpen: boolean;
  user: User | null;
  onCloseMobile: () => void;
  onSelectDecision: (id: string) => void;
  onStartNew: () => void;
  onDeleteDecision: (id: string) => void;
  onOpenAuth: () => void;
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatOptionsCount(count: number): string {
  if (count === 1) return '1 варіант';
  if (count >= 2 && count <= 4) return `${count} варіанти`;
  return `${count} варіантів`;
}

export function Sidebar({
  decisions,
  activeDecisionId,
  isComposing,
  mobileOpen,
  user,
  onCloseMobile,
  onSelectDecision,
  onStartNew,
  onDeleteDecision,
  onOpenAuth,
}: SidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return decisions;
    return decisions.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.options.some((o) => o.name.toLowerCase().includes(q)),
    );
  }, [decisions, query]);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (decisions[0]) {
              onSelectDecision(decisions[0].id);
            } else {
              onStartNew();
            }
            onCloseMobile();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          The Tiebreaker
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Закрити меню навігації"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-200 space-y-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            onStartNew();
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
        >
          <Plus className="w-4 h-4 shrink-0" />
          Нове рішення
        </button>

        {decisions.length > 0 && (
          <div className="relative">
            <label htmlFor="sidebar-decision-search" className="sr-only">
              Пошук серед збережених рішень
            </label>
            <Search
              aria-hidden="true"
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              id="sidebar-decision-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук рішень..."
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
        )}
      </div>

      <nav
        aria-label="Збережені рішення"
        className="flex-1 overflow-y-auto px-3 py-3 space-y-1"
      >
        <div className="px-2 pb-2 flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Журнал рішень</span>
          <span className="font-mono tabular-nums">{filtered.length}</span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-xs text-slate-500 leading-relaxed">
            {decisions.length === 0
              ? 'Ще немає збережених рішень. Створіть перше, щоб порівняти варіанти.'
              : 'За вашим запитом рішень не знайдено.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((decision) => {
              const isSelected = !isComposing && decision.id === activeDecisionId;
              const chosenOption = decision.chosenOptionId
                ? decision.options.find((o) => o.id === decision.chosenOptionId)
                : null;

              return (
                <li key={decision.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDecision(decision.id);
                      onCloseMobile();
                    }}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`w-full text-left px-3 py-2.5 pr-9 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-sm font-medium leading-snug line-clamp-2">
                      {decision.title}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1.5 text-xs ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      <span className="tabular-nums">
                        {formatOptionsCount(decision.options.length)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {chosenOption
                          ? 'Вирішено'
                          : formatShortDate(decision.updatedAt)}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDecision(decision.id);
                    }}
                    aria-label={`Видалити рішення «${decision.title}»`}
                    className={`absolute right-2 top-2.5 p-1.5 rounded-md transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isSelected
                        ? 'text-slate-300 hover:text-white hover:bg-slate-800 opacity-80 hover:opacity-100'
                        : 'text-slate-400 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="p-3 border-t border-slate-200 shrink-0">
        {user ? (
          <button
            type="button"
            onClick={() => {
              onOpenAuth();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center shrink-0"
            >
              {(user.displayName || user.email || 'G').trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-900 truncate">
                {user.displayName || 'Користувач Google'}
              </span>
              <span className="block text-[11px] text-slate-500 truncate">
                {user.email}
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onOpenAuth();
              onCloseMobile();
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <LogIn className="w-3.5 h-3.5 shrink-0 text-slate-600" />
            <span>Увійти через Google</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[272px] shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Меню журналу рішень"
        >
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 w-[280px] max-w-[85vw] h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
