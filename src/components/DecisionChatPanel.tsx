import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ExternalLink,
  Globe,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';
import type {
  ChatMessage,
  ChatRoleMode,
  DecisionRecord,
} from '../types/decision';

interface DecisionChatPanelProps {
  decision: DecisionRecord;
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  onSendMessage: (
    text: string,
    roleMode: ChatRoleMode,
    useGoogleSearch: boolean,
  ) => Promise<void>;
  onClearChat: () => void;
}

const ROLE_OPTIONS: Array<{
  id: ChatRoleMode;
  label: string;
  description: string;
}> = [
  {
    id: 'advisor',
    label: 'Стратег рішень',
    description: 'Зважений аналіз компромісів, ризиків і довгострокових наслідків.',
  },
  {
    id: 'skeptic',
    label: 'Адвокат диявола',
    description: 'Критична перевірка припущень, прихованих витрат і сліпих зон.',
  },
  {
    id: 'quick',
    label: 'Швидкий помічник',
    description: 'Короткі, конкретні тези та чеклісти для миттєвої перевірки.',
  },
];

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function getRoleLabel(roleMode?: ChatRoleMode): string {
  return ROLE_OPTIONS.find((r) => r.id === roleMode)?.label ?? 'Стратег рішень';
}

export function DecisionChatPanel({
  decision,
  messages,
  isSending,
  error,
  onSendMessage,
  onClearChat,
}: DecisionChatPanelProps) {
  const [roleMode, setRoleMode] = useState<ChatRoleMode>('advisor');
  const [useGoogleSearch, setUseGoogleSearch] = useState(true);
  const [input, setInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, isSending]);

  const activeRole =
    ROLE_OPTIONS.find((r) => r.id === roleMode) ?? ROLE_OPTIONS[0];

  const optionNames = decision.options.map((o) => o.name);
  const firstTwo = optionNames.slice(0, 2).join('» та «');

  const starterPrompts: Array<{ label: string; prompt: string; search: boolean }> = [
    {
      label: 'Актуальні факти з Google',
      prompt: `Перевір актуальні ринкові дані, ціни та ключові тенденції через Google для варіантів рішення «${decision.title}».`,
      search: true,
    },
    {
      label: 'Порівняти два головні шляхи',
      prompt:
        optionNames.length >= 2
          ? `У чому головна практична різниця між «${firstTwo}» на горизонті 3–5 років?`
          : `Які головні компроміси варто врахувати в цьому рішенні на горизонті 3–5 років?`,
      search: useGoogleSearch,
    },
    {
      label: 'Знайти ризик, який я ігнорую',
      prompt: 'Який неочевидний ризик або приховані витрати я, ймовірно, недооцінюю в цьому рішенні?',
      search: useGoogleSearch,
    },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = input.trim();
    if (!cleaned) {
      setLocalError('Введіть запитання або уточнення для ШІ-консультанта.');
      return;
    }
    setLocalError(null);
    setInput('');
    await onSendMessage(cleaned, roleMode, useGoogleSearch);
  }

  async function handleStarterClick(prompt: string, search: boolean) {
    if (isSending) return;
    setLocalError(null);
    if (search !== useGoogleSearch) {
      setUseGoogleSearch(search);
    }
    await onSendMessage(prompt, roleMode, search);
  }

  return (
    <section
      aria-label="ШІ-чат і пошук актуальних даних у Google"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
    >
      {/* Role & Google Search Grounding Toolbar */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-950">
              ШІ-консультант із пошуком у Google
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeRole.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={useGoogleSearch}
              onClick={() => setUseGoogleSearch((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                useGoogleSearch
                  ? 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100/70'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>
                Пошук у Google: {useGoogleSearch ? 'Увімк.' : 'Вимк.'}
              </span>
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClearChat}
                disabled={isSending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Очистити
              </button>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label="Обрати роль ШІ-консультанта"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {ROLE_OPTIONS.map((role) => {
            const isSelected = roleMode === role.id;
            return (
              <button
                key={role.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setRoleMode(role.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isSelected
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {role.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Multi-Turn Conversation Thread */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Історія діалогу з ШІ-консультантом"
        className="min-h-[340px] max-h-[520px] overflow-y-auto px-5 py-5 bg-slate-50/50 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="py-6 max-w-2xl mx-auto text-center space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-900">
                Поставте запитання щодо вашого рішення
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Чат пам’ятає контекст розмови, знає всі варіанти цього рішення та може підтягувати актуальні дані й посилання з Google Пошуку.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left pt-1">
              {starterPrompts.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleStarterClick(starter.prompt, starter.search)}
                  className="p-3 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-lg transition-colors text-left space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
                >
                  <div className="text-xs font-semibold text-slate-900">
                    {starter.label}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {starter.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  <div
                    className={`mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] ${
                      isUser ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    <span className="font-semibold">
                      {isUser ? 'Ви' : getRoleLabel(msg.roleMode)}
                    </span>
                    {!isUser && msg.usedSearch && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-blue-700 font-medium">
                          Google Пошук
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>

                  <div className="whitespace-pre-wrap break-words">
                    {msg.text}
                  </div>

                  {!isUser && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-600">
                        Джерела з Google Пошуку ({msg.sources.length})
                      </div>
                      <ul className="space-y-1">
                        {msg.sources.map((src) => (
                          <li key={src.uri}>
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 hover:underline break-all"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span>{src.title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!isUser &&
                    msg.searchQueries &&
                    msg.searchQueries.length > 0 && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Пошукові запити: {msg.searchQueries.join(' · ')}
                      </div>
                    )}
                </div>
              </div>
            );
          })
        )}

        {isSending && (
          <div className="flex items-start">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700 shrink-0" />
              <span>
                {useGoogleSearch
                  ? 'Шукаю актуальні дані в Google і готую відповідь...'
                  : 'Формую відповідь...'}
              </span>
            </div>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Composer Footer */}
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-white border-t border-slate-200 space-y-2"
      >
        {(localError || error) && (
          <p role="alert" className="text-xs font-medium text-red-700">
            {localError || error}
          </p>
        )}

        <div className="flex items-center gap-2.5">
          <label htmlFor="decision-chat-input" className="sr-only">
            Повідомлення для ШІ-консультанта
          </label>
          <input
            id="decision-chat-input"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={isSending}
            placeholder={
              useGoogleSearch
                ? 'Запитайте про варіанти або перевірте свіжі дані в Google...'
                : 'Уточніть критерії, ризики або поставте додаткове запитання...'
            }
            className="flex-1 min-w-0 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 disabled:opacity-60"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Send className="w-4 h-4 shrink-0" />
            )}
            <span>Надіслати</span>
          </button>
        </div>
      </form>
    </section>
  );
}
