import { useState, type FormEvent } from 'react';
import { Flag, Plus, Trash2 } from 'lucide-react';
import type {
  DecisionOption,
  OptionSwot,
  SwotQuadrantKey,
} from '../types/decision';
import { summarizeSwot } from '../utils/decisionMath';

interface SwotViewProps {
  options: DecisionOption[];
  swotList: OptionSwot[];
  onAddSwotItem: (
    optionId: string,
    quadrant: SwotQuadrantKey,
    text: string,
    critical: boolean,
  ) => void;
  onToggleCritical: (
    optionId: string,
    quadrant: SwotQuadrantKey,
    itemId: string,
  ) => void;
  onRemoveSwotItem: (
    optionId: string,
    quadrant: SwotQuadrantKey,
    itemId: string,
  ) => void;
}

const QUADRANTS: Array<{
  key: SwotQuadrantKey;
  title: string;
  axis: string;
  headingClass: string;
  placeholder: string;
}> = [
  {
    key: 'strengths',
    title: 'Сильні сторони',
    axis: 'Внутрішні · Позитивні',
    headingClass: 'text-emerald-800',
    placeholder: 'Напр.: висока ліквідність та перевірена надійність',
  },
  {
    key: 'weaknesses',
    title: 'Слабкі сторони',
    axis: 'Внутрішні · Негативні',
    headingClass: 'text-amber-800',
    placeholder: 'Напр.: складний період адаптації в перші 6 місяців',
  },
  {
    key: 'opportunities',
    title: 'Можливості',
    axis: 'Зовнішні · Позитивні',
    headingClass: 'text-blue-800',
    placeholder: 'Напр.: рефінансувати умови пізніше при зниженні ставок',
  },
  {
    key: 'threats',
    title: 'Загрози',
    axis: 'Зовнішні · Негативні',
    headingClass: 'text-red-800',
    placeholder: 'Напр.: непередбачуване зростання цін або зміна правил',
  },
];

export function SwotView({
  options,
  swotList,
  onAddSwotItem,
  onToggleCritical,
  onRemoveSwotItem,
}: SwotViewProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    options[0]?.id ?? '',
  );
  const [activeDraftQuadrant, setActiveDraftQuadrant] =
    useState<SwotQuadrantKey | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftCritical, setDraftCritical] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const activeOption =
    options.find((o) => o.id === selectedOptionId) ?? options[0];
  const activeSwot = swotList.find((s) => s.optionId === activeOption?.id);
  const summary = summarizeSwot(activeSwot);

  function openDraft(quadrant: SwotQuadrantKey) {
    setActiveDraftQuadrant(quadrant);
    setDraftText('');
    setDraftCritical(false);
    setDraftError(null);
  }

  function handleDraftSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOption || !activeDraftQuadrant) return;
    const cleaned = draftText.trim();
    if (!cleaned) {
      setDraftError('Введіть фактор перед збереженням.');
      return;
    }
    onAddSwotItem(activeOption.id, activeDraftQuadrant, cleaned, draftCritical);
    setActiveDraftQuadrant(null);
    setDraftText('');
    setDraftCritical(false);
    setDraftError(null);
  }

  if (!activeOption) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {options.length > 1 ? (
          <div
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
            role="group"
            aria-label="Обрати варіант для SWOT-аналізу"
          >
            {options.map((opt) => {
              const isSelected = opt.id === activeOption.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedOptionId(opt.id);
                    setActiveDraftQuadrant(null);
                  }}
                  aria-pressed={isSelected}
                  className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm font-semibold text-slate-900">
            SWOT-матриця: {activeOption.name}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
          <span>Позитивних {summary.helpfulCount}</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Ризиків {summary.harmfulCount}</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Ключових {summary.criticalCount}</span>
        </div>
      </div>

      {/* 2x2 Strategic SWOT Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        {QUADRANTS.map((quadrant) => {
          const items = activeSwot?.[quadrant.key] ?? [];
          return (
            <section
              key={quadrant.key}
              aria-label={`${quadrant.title} для «${activeOption.name}»`}
              className="bg-white border border-slate-200 rounded-xl flex flex-col"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <h3
                    className={`font-display text-base font-bold ${quadrant.headingClass}`}
                  >
                    {quadrant.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {quadrant.axis} ·{' '}
                    <span className="font-mono tabular-nums">
                      {items.length}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openDraft(quadrant.key)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Додати
                </button>
              </div>

              {activeDraftQuadrant === quadrant.key && (
                <form
                  onSubmit={handleDraftSubmit}
                  className="p-4 bg-slate-50 border-b border-slate-200 space-y-3"
                >
                  <div>
                    <label
                      htmlFor={`swot-input-${quadrant.key}`}
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Додати до розділу «{quadrant.title}»
                    </label>
                    <input
                      id={`swot-input-${quadrant.key}`}
                      type="text"
                      value={draftText}
                      onChange={(e) => {
                        setDraftText(e.target.value);
                        if (draftError) setDraftError(null);
                      }}
                      placeholder={quadrant.placeholder}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                  {draftError && (
                    <p role="alert" className="text-xs text-red-700 font-medium">
                      {draftError}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftCritical}
                        onChange={(e) => setDraftCritical(e.target.checked)}
                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      Позначити як ключовий фактор
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveDraftQuadrant(null)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md"
                      >
                        Скасувати
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap"
                      >
                        Зберегти
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <ul className="divide-y divide-slate-100 flex-1">
                {items.length === 0 ? (
                  <li className="px-5 py-7 text-xs text-slate-500">
                    У цьому блоці ще немає записів.
                  </li>
                ) : (
                  items.map((item) => (
                    <li
                      key={item.id}
                      className={`px-5 py-3.5 flex items-start justify-between gap-3 ${
                        item.critical ? 'bg-slate-50/70' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900 leading-relaxed">
                          {item.text}
                        </p>
                        {item.critical && (
                          <span className="mt-1 inline-block text-xs font-semibold text-blue-700">
                            Ключовий фактор рішення
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onToggleCritical(activeOption.id, quadrant.key, item.id)
                          }
                          aria-label={
                            item.critical
                              ? `Зняти позначку ключового фактора для «${item.text}»`
                              : `Позначити «${item.text}» як ключовий фактор`
                          }
                          aria-pressed={item.critical}
                          title={
                            item.critical
                              ? 'Зняти позначку ключового фактора'
                              : 'Позначити як ключовий фактор'
                          }
                          className={`p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                            item.critical
                              ? 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onRemoveSwotItem(activeOption.id, quadrant.key, item.id)
                          }
                          aria-label={`Видалити пункт «${item.text}» із розділу «${quadrant.title}»`}
                          className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
