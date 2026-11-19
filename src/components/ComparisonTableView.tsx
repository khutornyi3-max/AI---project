import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ComparisonCriterion,
  DecisionOption,
  OptionProsCons,
} from '../types/decision';
import {
  calculateComparisonTotals,
  calculateCriteriaWeightImpact,
} from '../utils/decisionMath';
import { CriteriaWeightChart } from './CriteriaWeightChart';

interface ComparisonTableViewProps {
  options: DecisionOption[];
  prosCons: OptionProsCons[];
  criteria: ComparisonCriterion[];
  onUpdateCriterionWeight: (criterionId: string, weight: number) => void;
  onUpdateScore: (criterionId: string, optionId: string, score: number) => void;
  onAddCriterion: (name: string, description: string, weight: number) => void;
  onRemoveCriterion: (criterionId: string) => void;
}

export function ComparisonTableView({
  options,
  prosCons,
  criteria,
  onUpdateCriterionWeight,
  onUpdateScore,
  onAddCriterion,
  onRemoveCriterion,
}: ComparisonTableViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newWeight, setNewWeight] = useState(3);
  const [formError, setFormError] = useState<string | null>(null);
  const [highlightedCriterionId, setHighlightedCriterionId] = useState<string | null>(null);

  const summary = calculateComparisonTotals(criteria, options);
  const weightImpact = calculateCriteriaWeightImpact(criteria, options);
  const impactById = new Map(
    weightImpact.items.map((item) => [item.criterionId, item]),
  );

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = newName.trim();
    if (!cleaned) {
      setFormError('Введіть назву критерію перед збереженням.');
      return;
    }
    onAddCriterion(
      cleaned,
      newDescription.trim() || 'Власний фактор оцінки',
      newWeight,
    );
    setNewName('');
    setNewDescription('');
    setNewWeight(3);
    setFormError(null);
    setShowAddForm(false);
  }

  return (
    <div className="space-y-8">
      {/* Option Score Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.totals.map((item) => (
          <div
            key={item.optionId}
            className={`bg-white border rounded-xl p-4 ${
              item.isLeader && !summary.isTie
                ? 'border-blue-600'
                : 'border-slate-200'
            }`}
          >
            <div className="min-h-[1.25rem] flex items-center justify-between gap-2 text-xs">
              <span
                className={
                  item.isLeader && !summary.isTie
                    ? 'font-semibold text-blue-700'
                    : item.isLeader && summary.isTie && summary.leaderIds.length > 1
                      ? 'font-semibold text-amber-700'
                      : 'text-slate-500'
                }
              >
                {item.isLeader && !summary.isTie
                  ? 'Лідер'
                  : item.isLeader && summary.isTie && summary.leaderIds.length > 1
                    ? 'Рівний рахунок'
                    : 'Оцінка варіанту'}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
              {item.optionName}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold text-slate-950 tabular-nums">
                {item.percentScore}%
              </span>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {item.weightedSum} / {item.maxPossible} б.
              </span>
            </div>
            <div className="mt-2.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  item.isLeader && !summary.isTie ? 'bg-blue-600' : 'bg-slate-400'
                }`}
                style={{ width: `${item.percentScore}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Primary Side-by-Side Comparison Table: Варіант | Плюси | Мінуси | Ключові міркування */}
      <section
        aria-label="Порівняльна таблиця варіантів"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-950">
              Порівняльна таблиця варіантів
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Порівняння {options.length} потенційних варіантів за плюсами, мінусами та ключовими міркуваннями.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {options.length} варіанти
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-700">
                <th scope="col" className="py-3 px-5 w-[20%]">
                  Варіант
                </th>
                <th scope="col" className="py-3 px-4 w-[27%] text-emerald-800">
                  Плюси
                </th>
                <th scope="col" className="py-3 px-4 w-[27%] text-red-800">
                  Мінуси
                </th>
                <th scope="col" className="py-3 px-5 w-[26%] text-slate-800">
                  Ключові міркування
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm align-top">
              {options.map((opt) => {
                const pc = prosCons.find((entry) => entry.optionId === opt.id);
                const pros = (pc?.items ?? []).filter((i) => i.type === 'pro');
                const cons = (pc?.items ?? []).filter((i) => i.type === 'con');
                const considerations =
                  opt.keyConsiderations && opt.keyConsiderations.length > 0
                    ? opt.keyConsiderations
                    : opt.summary
                      ? [opt.summary]
                      : [];
                const totalRow = summary.totals.find((t) => t.optionId === opt.id);

                return (
                  <tr
                    key={opt.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    <th scope="row" className="py-4 px-5 font-normal">
                      <div className="font-semibold text-slate-950 leading-snug">
                        {opt.name}
                      </div>
                      {opt.summary && (
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                          {opt.summary}
                        </p>
                      )}
                      {totalRow && (
                        <div className="mt-2 text-xs font-mono tabular-nums text-slate-600">
                          Матриця: {totalRow.percentScore}%
                        </div>
                      )}
                    </th>

                    <td className="py-4 px-4">
                      {pros.length === 0 ? (
                        <span className="text-xs text-slate-400">Не вказано</span>
                      ) : (
                        <ul className="space-y-1.5 text-xs text-slate-800 list-disc pl-4">
                          {pros.map((item) => (
                            <li key={item.id} className="leading-relaxed">
                              {item.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      {cons.length === 0 ? (
                        <span className="text-xs text-slate-400">Не вказано</span>
                      ) : (
                        <ul className="space-y-1.5 text-xs text-slate-800 list-disc pl-4">
                          {cons.map((item) => (
                            <li key={item.id} className="leading-relaxed">
                              {item.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    <td className="py-4 px-5">
                      {considerations.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                          {considerations.map((note, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {note}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Weighted Criteria Scoring Matrix */}
      <section
        aria-label="Зважена матриця критеріїв"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-950">
              Зважена матриця критеріїв
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Змінюйте вагу кожного критерію (1–5) або оцінку варіантів (1–10), щоб миттєво перерахувати лідера.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Plus className="w-3.5 h-3.5" />
            Додати критерій
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddSubmit}
            className="p-5 bg-slate-50 border-b border-slate-200 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="new-criterion-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Назва критерію
                </label>
                <input
                  id="new-criterion-name"
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Напр.: Ліквідність або швидкість запуску"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div>
                <label
                  htmlFor="new-criterion-desc"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Що оцінює
                </label>
                <input
                  id="new-criterion-desc"
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Коротке пояснення шкали"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div>
                <label
                  htmlFor="new-criterion-weight"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Вага важливості (1–5)
                </label>
                <select
                  id="new-criterion-weight"
                  value={newWeight}
                  onChange={(e) => setNewWeight(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  {[1, 2, 3, 4, 5].map((w) => (
                    <option key={w} value={w}>
                      {w} — {w === 5 ? 'Критично' : w === 4 ? 'Висока' : w === 3 ? 'Середня' : w === 2 ? 'Низька' : 'Мінімальна'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {formError && (
              <p role="alert" className="text-xs font-medium text-red-700">
                {formError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md"
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap"
              >
                Зберегти критерій
              </button>
            </div>
          </form>
        )}

        <CriteriaWeightChart
          impact={weightImpact}
          highlightedCriterionId={highlightedCriterionId}
          onHighlightCriterion={setHighlightedCriterionId}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th scope="col" className="py-3 px-5 w-[26%]">
                  Критерій
                </th>
                <th scope="col" className="py-3 px-4 w-[12%]">
                  Вага
                </th>
                {options.map((opt) => (
                  <th key={opt.id} scope="col" className="py-3 px-4">
                    {opt.name}
                  </th>
                ))}
                <th scope="col" className="py-3 px-3 w-12 text-right">
                  <span className="sr-only">Дії</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {criteria.length === 0 ? (
                <tr>
                  <td
                    colSpan={options.length + 3}
                    className="py-8 px-5 text-center text-sm text-slate-500"
                  >
                    Поки немає критеріїв. Натисніть «Додати критерій» вище, щоб оцінити варіанти.
                  </td>
                </tr>
              ) : (
                criteria.map((crit) => {
                  const critImpact = impactById.get(crit.id);
                  const sharePercent = critImpact?.sharePercent ?? 0;
                  const isHighlighted = highlightedCriterionId === crit.id;
                  return (
                  <tr
                    key={crit.id}
                    onMouseEnter={() => setHighlightedCriterionId(crit.id)}
                    onMouseLeave={() => setHighlightedCriterionId(null)}
                    className={`transition-colors align-top ${
                      isHighlighted ? 'bg-blue-50/60' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <th scope="row" className="py-4 px-5 font-normal">
                      <div className="font-semibold text-slate-900 leading-snug">
                        {crit.name}
                      </div>
                      {crit.description && (
                        <div className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                          {crit.description}
                        </div>
                      )}
                    </th>

                    <td className="py-4 px-4">
                      <div className="space-y-1.5 min-w-[104px]">
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor={`weight-${crit.id}`} className="sr-only">
                            Вага для критерію «{crit.name}»
                          </label>
                          <select
                            id={`weight-${crit.id}`}
                            value={crit.weight}
                            onChange={(e) =>
                              onUpdateCriterionWeight(crit.id, Number(e.target.value))
                            }
                            className="font-mono tabular-nums text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                          >
                            {[1, 2, 3, 4, 5].map((w) => (
                              <option key={w} value={w}>
                                {w} / 5
                              </option>
                            ))}
                          </select>
                          <span className="font-mono tabular-nums text-xs font-medium text-slate-600">
                            {sharePercent}%
                          </span>
                        </div>
                        <div
                          aria-hidden="true"
                          className="h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden"
                        >
                          <div
                            className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                              critImpact?.isTopWeight ? 'bg-blue-700' : 'bg-slate-500'
                            }`}
                            style={{ transform: `scaleX(${Math.max(0, Math.min(1, sharePercent / 100))})` }}
                          />
                        </div>
                      </div>
                    </td>

                    {options.map((opt) => {
                      const cell = crit.scores[opt.id] ?? { score: 5, note: '' };
                      const weightedPoints = cell.score * crit.weight;
                      return (
                        <td key={opt.id} className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`score-${crit.id}-${opt.id}`}
                              className="sr-only"
                            >
                              Оцінка для «{opt.name}» за критерієм «{crit.name}»
                            </label>
                            <select
                              id={`score-${crit.id}-${opt.id}`}
                              value={cell.score}
                              onChange={(e) =>
                                onUpdateScore(
                                  crit.id,
                                  opt.id,
                                  Number(e.target.value),
                                )
                              }
                              className="font-mono tabular-nums text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-md px-2 py-1 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                                <option key={s} value={s}>
                                  {s}/10
                                </option>
                              ))}
                            </select>
                            <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                              +{weightedPoints} б.
                            </span>
                          </div>
                          {cell.note && (
                            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                              {cell.note}
                            </p>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-4 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveCriterion(crit.id)}
                        aria-label={`Видалити критерій «${crit.name}»`}
                        className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>

            {criteria.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-semibold">
                  <td className="py-3.5 px-5 text-sm text-slate-900">
                    Зважений підсумок
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums">
                    {summary.totalWeight} ваги · 100%
                  </td>
                  {summary.totals.map((t) => (
                    <td key={t.optionId} className="py-3.5 px-4">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-mono text-sm tabular-nums ${
                            t.isLeader && !summary.isTie
                              ? 'text-blue-700 font-bold'
                              : 'text-slate-900'
                          }`}
                        >
                          {t.weightedSum} / {t.maxPossible}
                        </span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          ({t.percentScore}%)
                        </span>
                      </div>
                    </td>
                  ))}
                  <td className="py-3.5 px-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
