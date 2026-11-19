import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DecisionOption, OptionProsCons, ProConItem } from '../types/decision';
import { calculateProsConsBalance } from '../utils/decisionMath';

interface ProsConsViewProps {
  options: DecisionOption[];
  prosCons: OptionProsCons[];
  onUpdateWeight: (optionId: string, itemId: string, weight: number) => void;
  onAddItem: (
    optionId: string,
    type: 'pro' | 'con',
    text: string,
    rationale: string,
    weight: number,
  ) => void;
  onRemoveItem: (optionId: string, itemId: string) => void;
}

const WEIGHT_LEVELS = [1, 2, 3, 4, 5];

function formatItemsCount(count: number): string {
  if (count === 1) return '1 пункт';
  if (count >= 2 && count <= 4) return `${count} пункти`;
  return `${count} пунктів`;
}

export function ProsConsView({
  options,
  prosCons,
  onUpdateWeight,
  onAddItem,
  onRemoveItem,
}: ProsConsViewProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    options[0]?.id ?? '',
  );
  const [draftSide, setDraftSide] = useState<'pro' | 'con' | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftRationale, setDraftRationale] = useState('');
  const [draftWeight, setDraftWeight] = useState(3);
  const [draftError, setDraftError] = useState<string | null>(null);

  const activeOption =
    options.find((o) => o.id === selectedOptionId) ?? options[0];
  const activeList =
    prosCons.find((entry) => entry.optionId === activeOption?.id)?.items ?? [];

  const pros = activeList.filter((i) => i.type === 'pro');
  const cons = activeList.filter((i) => i.type === 'con');
  const balance = calculateProsConsBalance(activeList);

  function openAddForm(side: 'pro' | 'con') {
    setDraftSide(side);
    setDraftText('');
    setDraftRationale('');
    setDraftWeight(3);
    setDraftError(null);
  }

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOption || !draftSide) return;
    const cleaned = draftText.trim();
    if (!cleaned) {
      setDraftError(
        `Введіть аргумент «${draftSide === 'pro' ? 'Плюс' : 'Мінус'}» перед збереженням.`,
      );
      return;
    }
    onAddItem(
      activeOption.id,
      draftSide,
      cleaned,
      draftRationale.trim() || 'Додано вами',
      draftWeight,
    );
    setDraftSide(null);
    setDraftText('');
    setDraftRationale('');
    setDraftError(null);
  }

  function renderItemList(items: ProConItem[], side: 'pro' | 'con') {
    const isPro = side === 'pro';
    return (
      <section
        aria-label={`${isPro ? 'Плюси' : 'Мінуси'} для «${activeOption?.name ?? ''}»`}
        className="bg-white border border-slate-200 rounded-xl flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h3
              className={`font-display text-base font-bold ${
                isPro ? 'text-emerald-800' : 'text-red-800'
              }`}
            >
              {isPro ? 'Плюси' : 'Мінуси'}
            </h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {formatItemsCount(items.length)} · {isPro ? balance.proWeight : balance.conWeight} б.
            </span>
          </div>

          <button
            type="button"
            onClick={() => openAddForm(side)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Plus className="w-3.5 h-3.5" />
            {isPro ? 'Додати плюс' : 'Додати мінус'}
          </button>
        </div>

        {draftSide === side && (
          <form
            onSubmit={handleAddSubmit}
            className="p-4 bg-slate-50 border-b border-slate-200 space-y-3"
          >
            <div>
              <label
                htmlFor={`new-${side}-text`}
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                {isPro ? 'Новий плюс' : 'Новий мінус'}
              </label>
              <input
                id={`new-${side}-text`}
                type="text"
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  if (draftError) setDraftError(null);
                }}
                placeholder={
                  isPro
                    ? 'Наприклад: коротша дорога заощаджує 4 години на тиждень'
                    : 'Наприклад: вищі початкові витрати на оформлення'
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
            <div>
              <label
                htmlFor={`new-${side}-rationale`}
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Чому це важливо <span className="font-normal text-slate-500">(необов’язково)</span>
              </label>
              <input
                id={`new-${side}-rationale`}
                type="text"
                value={draftRationale}
                onChange={(e) => setDraftRationale(e.target.value)}
                placeholder="Коротка примітка або конкретна цифра"
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
            {draftError && (
              <p role="alert" className="text-xs text-red-700 font-medium">
                {draftError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-600 mr-1">Вага:</span>
                {WEIGHT_LEVELS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDraftWeight(w)}
                    aria-label={`Встановити вагу нового пункту ${w}`}
                    aria-pressed={draftWeight === w}
                    className={`w-7 h-7 text-xs font-mono font-semibold rounded-md border transition-colors ${
                      draftWeight === w
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraftSide(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap"
                >
                  Зберегти
                </button>
              </div>
            </div>
          </form>
        )}

        <ul className="divide-y divide-slate-100 flex-1">
          {items.length === 0 ? (
            <li className="px-5 py-8 text-sm text-slate-500">
              Поки немає жодного {isPro ? 'плюса' : 'мінуса'}. Додайте пункт вище, щоб збалансувати цей варіант.
            </li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="px-5 py-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">
                      {item.text}
                    </p>
                    {item.rationale && (
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {item.rationale}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      activeOption && onRemoveItem(activeOption.id, item.id)
                    }
                    aria-label={`Видалити ${isPro ? 'плюс' : 'мінус'} «${item.text}»`}
                    className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    Важливість{' '}
                    <span className="font-mono tabular-nums font-medium text-slate-700">
                      {item.weight}/5
                    </span>
                    {item.source === 'user' ? ' · Додано вами' : ''}
                  </span>
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={`Вага важливості для «${item.text}»`}
                  >
                    {WEIGHT_LEVELS.map((w) => {
                      const active = item.weight === w;
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() =>
                            activeOption && onUpdateWeight(activeOption.id, item.id, w)
                          }
                          aria-label={`Встановити вагу для «${item.text}» на ${w}`}
                          aria-pressed={active}
                          className={`w-7 h-7 text-xs font-mono tabular-nums font-medium rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                            active
                              ? isPro
                                ? 'bg-emerald-700 text-white border-emerald-700'
                                : 'bg-red-700 text-white border-red-700'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {w}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    );
  }

  if (!activeOption) return null;

  return (
    <div className="space-y-6">
      {options.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
            role="group"
            aria-label="Обрати варіант для плюсів і мінусів"
          >
            {options.map((opt) => {
              const optItems =
                prosCons.find((p) => p.optionId === opt.id)?.items ?? [];
              const optBal = calculateProsConsBalance(optItems);
              const isSelected = opt.id === activeOption.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedOptionId(opt.id);
                    setDraftSide(null);
                  }}
                  aria-pressed={isSelected}
                  className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isSelected
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{opt.name}</span>
                  <span
                    className={`ml-2 font-mono text-xs tabular-nums ${
                      optBal.netScore > 0
                        ? 'text-emerald-700'
                        : optBal.netScore < 0
                          ? 'text-red-700'
                          : 'text-slate-500'
                    }`}
                  >
                    {optBal.netScore >= 0 ? `+${optBal.netScore}` : optBal.netScore}
                  </span>
                </button>
              );
            })}
          </div>
          {activeOption.summary && (
            <p className="text-sm text-slate-600 max-w-xl">
              {activeOption.summary}
            </p>
          )}
        </div>
      )}

      {/* Weighted Balance Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-3">
          <div>
            <span className="text-xs font-medium text-slate-500">
              Зважений баланс: {activeOption.name}
            </span>
            <div className="mt-0.5 flex items-baseline gap-3">
              <span
                className={`font-mono text-2xl font-semibold tabular-nums ${
                  balance.netScore > 0
                    ? 'text-emerald-700'
                    : balance.netScore < 0
                      ? 'text-red-700'
                      : 'text-slate-800'
                }`}
              >
                {balance.netScore >= 0 ? `+${balance.netScore}` : balance.netScore} баланс
              </span>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Плюси {balance.proWeight} б. · Мінуси {balance.conWeight} б.
              </span>
            </div>
          </div>

          <div className="text-xs font-medium text-slate-600 font-mono tabular-nums">
            {balance.proRatioPercent}% позитивної ваги
          </div>
        </div>

        <div
          className="h-2.5 w-full bg-red-100 rounded-full overflow-hidden flex"
          role="img"
          aria-label={`Шкала балансу: ${balance.proRatioPercent}% ваги плюсів проти ${100 - balance.proRatioPercent}% ваги мінусів`}
        >
          <div
            className="h-full bg-emerald-600 transition-all duration-200"
            style={{ width: `${balance.proRatioPercent}%` }}
          />
        </div>
      </div>

      {/* Two Distinct Columns: Pros & Cons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {renderItemList(pros, 'pro')}
        {renderItemList(cons, 'con')}
      </div>
    </div>
  );
}
