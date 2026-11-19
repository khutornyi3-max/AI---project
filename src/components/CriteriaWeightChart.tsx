import { useState } from 'react';
import type { CriteriaWeightImpactSummary } from '../utils/decisionMath';

interface CriteriaWeightChartProps {
  impact: CriteriaWeightImpactSummary;
  highlightedCriterionId: string | null;
  onHighlightCriterion: (criterionId: string | null) => void;
}

const SEGMENT_COLORS = [
  'bg-blue-700',
  'bg-slate-800',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-amber-600',
  'bg-slate-500',
];

type ChartMetricMode = 'share' | 'spread';

export function CriteriaWeightChart({
  impact,
  highlightedCriterionId,
  onHighlightCriterion,
}: CriteriaWeightChartProps) {
  const [mode, setMode] = useState<ChartMetricMode>('share');

  if (impact.items.length === 0) {
    return (
      <div className="px-5 py-5 border-b border-slate-200 bg-slate-50/50 text-xs text-slate-500">
        Додайте принаймні один критерій нижче, щоб побачити розподіл ваг і вплив кожного фактора на рішення.
      </div>
    );
  }

  const orderedItems = [...impact.items].sort((a, b) => {
    if (mode === 'spread') {
      return b.spreadPoints - a.spreadPoints || b.weight - a.weight;
    }
    return b.weight - a.weight || b.sharePercent - a.sharePercent;
  });

  const colorById = new Map<string, string>();
  impact.items.forEach((item, index) => {
    colorById.set(
      item.criterionId,
      SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    );
  });

  const maxSpread = Math.max(
    1,
    ...impact.items.map((item) => item.spreadPoints),
  );

  const stackedAriaLabel = impact.items
    .map((item) => `${item.name}: ${item.sharePercent}% (вага ${item.weight} з 5)`)
    .join('; ');

  return (
    <div
      aria-label="Візуалізація ваг критеріїв"
      className="px-5 py-5 border-b border-slate-200 bg-slate-50/40 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Вплив критеріїв на загальне рішення
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            <span>Сумарна вага: </span>
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {impact.totalWeight}
            </span>
            {impact.dominantCriterionName && (
              <>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>Найбільша частка: </span>
                <span className="font-medium text-slate-800">
                  {impact.dominantCriterionName}
                </span>{' '}
                <span className="font-mono tabular-nums font-medium text-blue-700">
                  ({impact.dominantSharePercent}%)
                </span>
              </>
            )}
          </p>
        </div>

        <div
          role="group"
          aria-label="Режим графіка впливу критеріїв"
          className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg shrink-0"
        >
          <button
            type="button"
            aria-pressed={mode === 'share'}
            onClick={() => setMode('share')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              mode === 'share'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Частка ваги
          </button>
          <button
            type="button"
            aria-pressed={mode === 'spread'}
            onClick={() => setMode('spread')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              mode === 'spread'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Вплив на відрив
          </button>
        </div>
      </div>

      {/* 100% Proportional Stacked Distribution Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {mode === 'share'
              ? 'Пропорційний розподіл 100% ваги рішення'
              : 'Поточний розподіл ваги (наведіть на критерій нижче, щоб підсвітити рядок)'}
          </span>
          <span className="font-mono tabular-nums text-slate-600">
            100% ({impact.items.length}{' '}
            {impact.items.length === 1
              ? 'критерій'
              : impact.items.length >= 2 && impact.items.length <= 4
                ? 'критерії'
                : 'критеріїв'}
            )
          </span>
        </div>

        <div
          role="img"
          aria-label={`Розподіл ваг критеріїв: ${stackedAriaLabel}`}
          className="h-3 w-full flex rounded-md overflow-hidden bg-slate-200/80 gap-0.5"
        >
          {impact.items.map((item) => {
            const colorClass = colorById.get(item.criterionId) ?? 'bg-slate-600';
            const isHighlighted = highlightedCriterionId === item.criterionId;
            const isDimmed =
              highlightedCriterionId !== null && !isHighlighted;
            return (
              <div
                key={item.criterionId}
                title={`${item.name}: ${item.sharePercent}% (вага ${item.weight}/5)`}
                onMouseEnter={() => onHighlightCriterion(item.criterionId)}
                onMouseLeave={() => onHighlightCriterion(null)}
                style={{ flexGrow: item.weight, flexBasis: 0 }}
                className={`h-full transition-opacity duration-150 ${colorClass} ${
                  isDimmed ? 'opacity-35' : 'opacity-100'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Detailed Criterion Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 pt-1">
        {orderedItems.map((item) => {
          const colorClass = colorById.get(item.criterionId) ?? 'bg-slate-600';
          const isHighlighted = highlightedCriterionId === item.criterionId;
          const barPercent =
            mode === 'share'
              ? item.sharePercent
              : item.spreadPoints === 0
                ? 0
                : Math.round((item.spreadPoints / maxSpread) * 100);
          const scaleValue = Math.max(0, Math.min(1, barPercent / 100));

          return (
            <div
              key={item.criterionId}
              onMouseEnter={() => onHighlightCriterion(item.criterionId)}
              onMouseLeave={() => onHighlightCriterion(null)}
              className={`rounded-lg px-2.5 py-2 -mx-2.5 transition-colors ${
                isHighlighted ? 'bg-blue-50/70' : 'hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-xs shrink-0 ${colorClass}`}
                  />
                  <span className="font-medium text-slate-900 truncate">
                    {item.name}
                  </span>
                </div>

                {mode === 'share' ? (
                  <div className="flex items-baseline gap-1.5 shrink-0 font-mono tabular-nums">
                    <span className="font-semibold text-slate-950">
                      {item.sharePercent}%
                    </span>
                    <span className="text-[11px] text-slate-500">
                      · {item.weight}/5 · до {item.maxPointsContribution} б.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1.5 shrink-0 font-mono tabular-nums">
                    <span className="font-semibold text-slate-950">
                      Δ {item.spreadPoints} б.
                    </span>
                    <span className="text-[11px] text-slate-500">
                      · вага {item.weight}/5
                    </span>
                  </div>
                )}
              </div>

              <div
                role="progressbar"
                aria-label={
                  mode === 'share'
                    ? `Частка ваги критерію «${item.name}»: ${item.sharePercent}%`
                    : `Вплив критерію «${item.name}» на відрив між варіантами: ${item.spreadPoints} балів`
                }
                aria-valuemin={0}
                aria-valuemax={mode === 'share' ? 100 : maxSpread}
                aria-valuenow={
                  mode === 'share' ? item.sharePercent : item.spreadPoints
                }
                className="mt-1.5 h-2 w-full bg-slate-200/80 rounded-full overflow-hidden"
              >
                <div
                  className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${colorClass}`}
                  style={{ transform: `scaleX(${scaleValue})` }}
                />
              </div>

              {mode === 'spread' && (
                <div className="mt-1 text-[11px] text-slate-500 truncate">
                  {item.spreadPoints === 0
                    ? 'Усі варіанти мають однакову оцінку — критерій не створює переваги'
                    : item.leadingOptionNames.length === 1
                      ? `Перевага для «${item.leadingOptionNames[0]}»`
                      : `Рівне лідерство: ${item.leadingOptionNames.join(', ')}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
