import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Globe,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';
import type { ChallengeMode, DecisionRecord } from '../types/decision';
import { computeOverallLeaning } from '../utils/decisionMath';
import { AISummaryBalanceChart } from './AISummaryBalanceChart';

interface VerdictPanelProps {
  decision: DecisionRecord;
  isChallenging: boolean;
  challengeError: string | null;
  isExportingPdf: boolean;
  pdfExported: boolean;
  pdfExportError: string | null;
  onExportPdf: () => void;
  onSelectChosenOption: (optionId: string | null) => void;
  onRunChallenge: (
    mode: ChallengeMode,
    customQuestion?: string,
    useGoogleSearch?: boolean,
  ) => Promise<void>;
  onRemoveChallenge: (challengeId: string) => void;
}

const CHALLENGE_ACTIONS: Array<{
  mode: ChallengeMode;
  label: string;
  usesSearch?: boolean;
}> = [
  { mode: 'devils-advocate', label: 'Адвокат диявола' },
  { mode: 'blind-spots', label: 'Знайти сліпі зони' },
  { mode: 'tiebreaker-question', label: 'Вийти з глухого кута' },
  { mode: 'fact-check', label: 'Перевірити факти в Google', usesSearch: true },
];

export function VerdictPanel({
  decision,
  isChallenging,
  challengeError,
  isExportingPdf,
  pdfExported,
  pdfExportError,
  onExportPdf,
  onSelectChosenOption,
  onRunChallenge,
  onRemoveChallenge,
}: VerdictPanelProps) {
  const [customAngle, setCustomAngle] = useState('');
  const [useSearchForCustom, setUseSearchForCustom] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const leaning = computeOverallLeaning(decision);
  const chosenOption = decision.chosenOptionId
    ? decision.options.find((o) => o.id === decision.chosenOptionId)
    : null;

  async function handleCustomSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = customAngle.trim();
    if (cleaned.length < 4) {
      setLocalError('Введіть конкретний сценарій або запитання для перевірки.');
      return;
    }
    setLocalError(null);
    await onRunChallenge('custom', cleaned, useSearchForCustom);
    setCustomAngle('');
  }

  return (
    <div className="space-y-6">
      {/* Tiebreaker Synthesis & Final Decision Selector */}
      <section
        aria-label="Підсумок і статус рішення"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2 flex-1 min-w-0 max-w-2xl">
            <div className="text-xs font-semibold text-slate-500">
              {chosenOption
                ? 'Рішення зафіксовано'
                : leaning.isTie
                  ? 'Поточний стан · Нічия'
                  : 'Поточний стан · Лідер'}
            </div>
            <h2 className="font-display text-xl font-bold text-slate-950">
              {chosenOption
                ? chosenOption.name
                : leaning.leadingOptionName ?? 'Поки що рівний рахунок між варіантами'}
            </h2>
            <p className="text-xs font-mono tabular-nums text-slate-600">
              {chosenOption
                ? `Фінальний вибір збережено · ${leaning.basisLabel}`
                : leaning.basisLabel}
            </p>
            {decision.aiTakeaway && (
              <p className="pt-1 text-sm text-slate-700 leading-relaxed">
                {decision.aiTakeaway}
              </p>
            )}
          </div>

          <div className="lg:w-[320px] shrink-0 space-y-2">
            <span className="block text-xs font-semibold text-slate-700">
              Зафіксувати фінальний вибір
            </span>
            <div className="flex flex-wrap gap-2">
              {decision.options.map((opt) => {
                const isChosen = decision.chosenOptionId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onSelectChosenOption(isChosen ? null : opt.id)
                    }
                    aria-pressed={isChosen}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      isChosen
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {isChosen && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* AI Summary Decision Balance Visualization */}
        <AISummaryBalanceChart decision={decision} />

        {/* Verified Google Search Sources used during analysis */}
        {decision.groundingSources && decision.groundingSources.length > 0 && (
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Globe className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span>Актуальні джерела з Google Пошуку, враховані в аналізі</span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {decision.groundingSources.map((source) => (
                <li key={source.uri}>
                  <a
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-700 hover:text-blue-900 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-md transition-colors max-w-[260px]"
                  >
                    <span className="truncate">{source.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {decision.tiebreakerQuestion ? (
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 min-w-0">
              <span className="text-xs font-semibold text-blue-700 whitespace-nowrap shrink-0">
                Вирішальне питання:
              </span>
              <p className="text-sm font-medium text-slate-900">
                {decision.tiebreakerQuestion}
              </p>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              Збережіть повний аналіз, матрицю ваг та SWOT у зручному файлі для подальшого використання.
            </span>
          )}

          <button
            type="button"
            disabled={isExportingPdf}
            onClick={onExportPdf}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />
                Формування PDF...
              </>
            ) : pdfExported ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                Звіт збережено
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                Зберегти звіт у PDF
              </>
            )}
          </button>
        </div>

        {pdfExportError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
            <span>{pdfExportError}</span>
          </div>
        )}
      </section>

      {/* Stress-Test with AI */}
      <section
        aria-label="Перевірити рішення за допомогою ШІ"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-950">
              Перевірити аналіз на міцність
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Попросіть ШІ оскаржити ваш вибір, знайти приховані ризики або змоделювати сценарій «а що, якщо...».
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CHALLENGE_ACTIONS.map((action) => (
            <button
              key={action.mode}
              type="button"
              disabled={isChallenging}
              onClick={() =>
                onRunChallenge(action.mode, undefined, Boolean(action.usesSearch))
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                action.usesSearch
                  ? 'text-blue-800 bg-blue-50/70 hover:bg-blue-100/70 border-blue-200'
                  : 'text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200'
              }`}
            >
              {action.usesSearch && <Globe className="w-3.5 h-3.5 shrink-0" />}
              {action.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleCustomSubmit} className="space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="custom-stress-test-input" className="sr-only">
              Запропонувати власний сценарій «а що, якщо»
            </label>
            <input
              id="custom-stress-test-input"
              type="text"
              value={customAngle}
              disabled={isChallenging}
              onChange={(e) => {
                setCustomAngle(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder='Перевірте сценарій, напр.: «А що, якщо ставки за кредитом знизяться на 2% наступного року?»'
              className="flex-1 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={isChallenging}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isChallenging ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Перевіряємо...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  Перевірити
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={isChallenging}
              aria-pressed={useSearchForCustom}
              onClick={() => setUseSearchForCustom((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                useSearchForCustom
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              Перевіряти сценарій через Google Пошук: {useSearchForCustom ? 'Увімк.' : 'Вимк.'}
            </button>
          </div>
        </form>

        {(localError || challengeError) && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
            <span>{localError || challengeError}</span>
          </div>
        )}

        {decision.challenges.length > 0 && (
          <div className="pt-2 space-y-3">
            {decision.challenges.map((insight) => (
              <article
                key={insight.id}
                className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-medium text-slate-500">
                      {insight.promptLabel}
                    </span>
                    <h4 className="font-display text-sm font-bold text-slate-950 mt-0.5">
                      {insight.heading}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveChallenge(insight.id)}
                    aria-label={`Закрити перевірку «${insight.heading}»`}
                    className="p-1 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                  {insight.points.map((point, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>

                {insight.tiebreakerQuestion && (
                  <p className="pt-2 border-t border-slate-200 text-xs text-slate-800">
                    <span className="font-semibold text-blue-700">На подумати: </span>
                    {insight.tiebreakerQuestion}
                  </p>
                )}

                {insight.sources && insight.sources.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      <Globe className="w-3 h-3 text-blue-700 shrink-0" />
                      <span>Джерела Google Пошуку</span>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {insight.sources.map((src) => (
                        <li key={src.uri}>
                          <a
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-blue-700 hover:text-blue-900 bg-white border border-slate-200 hover:border-blue-300 rounded transition-colors max-w-[240px]"
                          >
                            <span className="truncate">{src.title}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
