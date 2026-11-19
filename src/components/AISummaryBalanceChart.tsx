import { useState } from 'react';
import type { DecisionRecord } from '../types/decision';
import { calculateDecisionBalanceSummary } from '../utils/decisionMath';

interface AISummaryBalanceChartProps {
  decision: DecisionRecord;
}

type BalanceLens = 'combined' | 'pros-cons' | 'criteria';

const LENS_OPTIONS: Array<{ id: BalanceLens; label: string }> = [
  { id: 'combined', label: 'Загальний баланс' },
  { id: 'pros-cons', label: 'Плюси / Мінуси' },
  { id: 'criteria', label: 'Критерії' },
];

export function AISummaryBalanceChart({ decision }: AISummaryBalanceChartProps) {
  const [lens, setLens] = useState<BalanceLens>('combined');
  const summary = calculateDecisionBalanceSummary(decision);

  if (!summary.hasData) {
    return (
      <div
        aria-label="ШІ-підсумок: діаграма балансу рішення"
        className="pt-5 border-t border-slate-200 text-xs text-slate-500"
      >
        Додайте плюси, мінуси або критерії оцінювання, щоб побачити діаграму загального балансу рішення.
      </div>
    );
  }

  const orderedOptions = [...summary.options].sort((a, b) => {
    if (lens === 'pros-cons') {
      return b.prosConsPercent - a.prosConsPercent || b.netProsCons - a.netProsCons;
    }
    if (lens === 'criteria') {
      return b.criteriaPercent - a.criteriaPercent || b.criteriaWeightedSum - a.criteriaWeightedSum;
    }
    return b.compositeScore - a.compositeScore || b.criteriaPercent - a.criteriaPercent;
  });

  const conSharePercent = 100 - summary.overallProSharePercent;

  const alignmentLine =
    summary.alignmentStatus === 'aligned' && summary.leaderName
      ? `Обидві моделі (плюси/мінуси та критерії) вказують на «${summary.leaderName}»`
      : summary.alignmentStatus === 'divergent' &&
          summary.prosConsLeaderName &&
          summary.criteriaLeaderName
        ? `Розбіжність оцінок: плюси/мінуси за «${summary.prosConsLeaderName}», критерії за «${summary.criteriaLeaderName}»`
        : summary.isTie
          ? 'Між провідними варіантами зберігається паритет — скоригуйте ваги для вирішальної переваги'
          : summary.leaderName
            ? `Зведений лідер за поточними вагами: «${summary.leaderName}» (+${summary.leadMargin}%)`
            : null;

  const macroChartLabel = `Загальний баланс аргументів рішення: плюси ${summary.overallProSharePercent}% (вага ${summary.totalProWeight}) проти мінусів ${conSharePercent}% (вага ${summary.totalConWeight})`;

  return (
    <div
      aria-label="ШІ-підсумок: діаграма балансу рішення"
      className="pt-5 border-t border-slate-200 space-y-5"
    >
      {/* Header & View Lens */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">
            ШІ-підсумок · Діаграма балансу рішення
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-mono tabular-nums">
            <span>Плюси {summary.totalProWeight} б.</span>
            <span aria-hidden="true">·</span>
            <span>Мінуси {summary.totalConWeight} б.</span>
            <span aria-hidden="true">·</span>
            <span>Вага критеріїв {summary.totalCriteriaWeight}</span>
          </div>
          {alignmentLine && (
            <p className="text-xs text-slate-600 leading-relaxed">
              {alignmentLine}
            </p>
          )}
        </div>

        <div
          role="group"
          aria-label="Режим діаграми балансу"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start"
        >
          {LENS_OPTIONS.map((item) => {
            const isActive = lens === item.id;
            const disabled =
              (item.id === 'pros-cons' && !summary.hasProsCons) ||
              (item.id === 'criteria' && !summary.hasCriteria);
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                aria-pressed={isActive}
                onClick={() => setLens(item.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 ${
                  isActive
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overall Pro vs Con Weight Balance Gauge */}
      {summary.hasProsCons && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-slate-700">
              Сумарний баланс ваг усіх плюсів і мінусів
            </span>
            <span className="font-mono tabular-nums text-slate-700">
              <span className="font-semibold text-emerald-700">
                Плюси {summary.overallProSharePercent}%
              </span>
              <span className="mx-1.5 text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-rose-700">
                Мінуси {conSharePercent}%
              </span>
            </span>
          </div>

          <div
            role="img"
            aria-label={macroChartLabel}
            className="relative h-2.5 w-full rounded-full overflow-hidden bg-slate-100 flex"
          >
            <div
              className="h-full bg-emerald-600 transition-all duration-200"
              style={{ width: `${summary.overallProSharePercent}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-200"
              style={{ width: `${conSharePercent}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 w-px bg-white/90"
            />
          </div>
        </div>
      )}

      {/* Comparative Option Balance Chart */}
      <div className="space-y-3">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {lens === 'combined' && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2 rounded-xs bg-slate-900"
                  />
                  Зведений індекс
                </span>
                {summary.hasProsCons && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2 rounded-xs bg-emerald-600"
                    />
                    Плюси / Мінуси
                  </span>
                )}
                {summary.hasCriteria && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2 rounded-xs bg-blue-700"
                    />
                    Критерії
                  </span>
                )}
              </>
            )}
            {lens === 'pros-cons' && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2 rounded-xs bg-emerald-600"
                  />
                  Вага плюсів
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2 rounded-xs bg-rose-500"
                  />
                  Вага мінусів
                </span>
              </>
            )}
            {lens === 'criteria' && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2 rounded-xs bg-blue-700"
                />
                Зважений результат матриці критеріїв (0–100%)
              </span>
            )}
          </div>
        </div>

        {/* Full-Width Axis Scale Aligned With Bars */}
        <div
          aria-hidden="true"
          className="flex items-center justify-between font-mono tabular-nums text-[10px] text-slate-400 border-b border-slate-100 pb-1"
        >
          <span>0%</span>
          <span>50% · паритет</span>
          <span>100%</span>
        </div>

        {/* Option Rows */}
        <ul className="divide-y divide-slate-100">
          {orderedOptions.map((opt) => {
            const isChosen = decision.chosenOptionId === opt.optionId;
            const isTopInLens =
              lens === 'combined'
                ? opt.isLeader
                : lens === 'pros-cons'
                  ? opt.isProsConsLeader
                  : opt.isCriteriaLeader;

            const activePercent =
              lens === 'combined'
                ? opt.compositeScore
                : lens === 'pros-cons'
                  ? opt.prosConsPercent
                  : opt.criteriaPercent;

            const netSign = opt.netProsCons > 0 ? '+' : '';

            return (
              <li
                key={opt.optionId}
                className="py-3 first:pt-2 last:pb-0 space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {opt.optionName}
                    </span>
                    {isChosen ? (
                      <span className="text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
                        · Обрано
                      </span>
                    ) : isTopInLens ? (
                      <span className="text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
                        · Лідер
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-baseline gap-2 font-mono tabular-nums text-xs shrink-0">
                    <span
                      className={`text-sm font-bold ${
                        isChosen
                          ? 'text-emerald-700'
                          : isTopInLens
                            ? 'text-slate-950'
                            : 'text-slate-700'
                      }`}
                    >
                      {activePercent}%
                    </span>
                    {lens === 'pros-cons' && (
                      <span className="text-slate-500">
                        · {netSign}
                        {opt.netProsCons} ({opt.proWeight} за / {opt.conWeight}{' '}
                        проти)
                      </span>
                    )}
                    {lens === 'criteria' && (
                      <span className="text-slate-500">
                        · {opt.criteriaWeightedSum}/{opt.criteriaMaxPossible} б.
                      </span>
                    )}
                    {lens === 'combined' && (
                      <span className="text-slate-500">
                        · баланс {netSign}
                        {opt.netProsCons}
                        {opt.hasCriteria ? ` · критерії ${opt.criteriaPercent}%` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Bar for Active Lens (keyed by lens to prevent stale inline styles) */}
                {lens === 'pros-cons' ? (
                  <div
                    key="pros-cons-bar"
                    role="img"
                    aria-label={`${opt.optionName}: плюси ${opt.prosConsPercent}% (вага ${opt.proWeight}), мінуси ${100 - opt.prosConsPercent}% (вага ${opt.conWeight})`}
                    className="relative h-3 w-full rounded-md overflow-hidden bg-slate-100 flex"
                  >
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${opt.prosConsPercent}%` }}
                    />
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${100 - opt.prosConsPercent}%` }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-1/2 w-0.5 bg-white"
                    />
                  </div>
                ) : (
                  <div
                    key={`progress-bar-${lens}`}
                    role="progressbar"
                    aria-label={
                      lens === 'combined'
                        ? `Загальний баланс «${opt.optionName}»: ${opt.compositeScore}%`
                        : `Оцінка за критеріями «${opt.optionName}»: ${opt.criteriaPercent}%`
                    }
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={activePercent}
                    className="relative h-3 w-full rounded-md overflow-hidden bg-slate-100"
                  >
                    <div
                      className={`h-full w-full origin-left rounded-md transition-transform duration-150 ${
                        isChosen
                          ? 'bg-emerald-700'
                          : lens === 'criteria'
                            ? isTopInLens
                              ? 'bg-blue-700'
                              : 'bg-slate-500'
                            : isTopInLens
                              ? 'bg-slate-900'
                              : 'bg-slate-500'
                      }`}
                      style={{
                        transform: `scaleX(${Math.max(0, Math.min(1, activePercent / 100))})`,
                      }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-1/2 w-px bg-slate-300/70"
                    />
                  </div>
                )}

                {/* Dual Component Breakdown Bars in Combined Mode */}
                {lens === 'combined' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-0.5">
                    {opt.hasProsCons && (
                      <div className="flex items-center gap-2.5 text-[11px]">
                        <span className="text-slate-500 w-24 shrink-0">
                          Плюси / Мінуси
                        </span>
                        <div className="relative flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100 flex">
                          <div
                            className="h-full bg-emerald-600"
                            style={{ width: `${opt.prosConsPercent}%` }}
                          />
                          <div
                            className="h-full bg-rose-400"
                            style={{ width: `${100 - opt.prosConsPercent}%` }}
                          />
                        </div>
                        <span className="font-mono tabular-nums text-slate-700 w-16 text-right shrink-0">
                          {opt.prosConsPercent}% ({netSign}
                          {opt.netProsCons})
                        </span>
                      </div>
                    )}

                    {opt.hasCriteria && (
                      <div className="flex items-center gap-2.5 text-[11px]">
                        <span className="text-slate-500 w-24 shrink-0">
                          Критерії
                        </span>
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                          <div
                            className="h-full w-full origin-left bg-blue-700 rounded-full transition-transform duration-200"
                            style={{
                              transform: `scaleX(${Math.max(0, Math.min(1, opt.criteriaPercent / 100))})`,
                            }}
                          />
                        </div>
                        <span className="font-mono tabular-nums text-slate-700 w-16 text-right shrink-0">
                          {opt.criteriaPercent}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
