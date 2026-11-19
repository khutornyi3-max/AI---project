import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Globe,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { DECISION_TEMPLATES } from '../data/decisionTemplates';
import type {
  AnalyzeDecisionRequest,
  DecisionTemplate,
  FrameworkType,
  InitialCriterionInput,
} from '../types/decision';
import { validateDecisionInput } from '../utils/decisionMath';
import {
  applyDecisionTemplateToDraft,
  sanitizeInitialCriteria,
} from '../utils/templates';

interface DecisionComposerProps {
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (payload: AnalyzeDecisionRequest) => Promise<void>;
}

const FRAMEWORK_CHOICES: Array<{ id: FrameworkType; label: string; detail: string }> = [
  {
    id: 'pros-cons',
    label: 'Плюси і мінуси',
    detail: 'Дві колонки зі зваженими аргументами',
  },
  {
    id: 'comparison',
    label: 'Порівняльна таблиця',
    detail: 'Таблиця 3+ варіантів та матриця критеріїв',
  },
  {
    id: 'swot',
    label: 'SWOT-аналіз',
    detail: 'Сильні, слабкі сторони, можливості й загрози',
  },
];

function formatCriteriaCount(count: number): string {
  if (count === 1) return '1 критерій';
  if (count >= 2 && count <= 4) return `${count} критерії`;
  return `${count} критеріїв`;
}

export function DecisionComposer({
  isSubmitting,
  apiError,
  onSubmit,
}: DecisionComposerProps) {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '']);
  const [context, setContext] = useState('');
  const [preferredFramework, setPreferredFramework] =
    useState<FrameworkType>('pros-cons');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [initialCriteria, setInitialCriteria] = useState<InitialCriterionInput[]>(
    [],
  );
  const [newCriterionName, setNewCriterionName] = useState('');
  const [newCriterionWeight, setNewCriterionWeight] = useState<number>(3);
  const [showAddCriterion, setShowAddCriterion] = useState(false);
  const [useGoogleSearch, setUseGoogleSearch] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeTemplate =
    DECISION_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null;

  function handleOptionChange(index: number, value: string) {
    setOptions((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function handleAddOption() {
    if (options.length < 4) {
      setOptions((prev) => [...prev, '']);
    }
  }

  function handleRemoveOption(index: number) {
    if (options.length <= 2) {
      handleOptionChange(index, '');
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSelectTemplate(template: DecisionTemplate) {
    const merged = applyDecisionTemplateToDraft(
      {
        title,
        options,
        context,
        preferredFramework,
        initialCriteria,
        selectedTemplateId,
      },
      template,
      activeTemplate,
    );

    setTitle(merged.title);
    setOptions(merged.options);
    setContext(merged.context);
    setPreferredFramework(merged.preferredFramework);
    setInitialCriteria(merged.initialCriteria);
    setSelectedTemplateId(merged.selectedTemplateId);
    setShowAddCriterion(false);
    setValidationError(null);
  }

  function handleResetTemplate() {
    if (activeTemplate) {
      if (title.trim() === activeTemplate.title.trim()) {
        setTitle('');
      }
      const nonEmpty = options.map((o) => o.trim()).filter(Boolean);
      const matchesTemplateOptions =
        nonEmpty.length === activeTemplate.options.length &&
        nonEmpty.every((o, i) => o === activeTemplate.options[i]);
      if (matchesTemplateOptions) {
        setOptions(['', '', '']);
      }
      if (context.trim() === activeTemplate.context.trim()) {
        setContext('');
      }
    }
    setSelectedTemplateId(null);
    setInitialCriteria([]);
    setShowAddCriterion(false);
  }

  function handleUpdateCriterionWeight(id: string, weight: number) {
    setInitialCriteria((prev) =>
      prev.map((item) => (item.id === id ? { ...item, weight } : item)),
    );
  }

  function handleRemoveCriterion(id: string) {
    setInitialCriteria((prev) => prev.filter((item) => item.id !== id));
  }

  function handleAddCustomCriterion() {
    const trimmed = newCriterionName.trim();
    if (!trimmed || initialCriteria.length >= 6) return;
    if (
      initialCriteria.some(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      return;
    }
    setInitialCriteria((prev) => [
      ...prev,
      {
        id: `custom-crit-${Date.now().toString(36)}`,
        name: trimmed,
        description: '',
        weight: newCriterionWeight,
      },
    ]);
    setNewCriterionName('');
    setNewCriterionWeight(3);
    setShowAddCriterion(false);
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateDecisionInput(title, options);
    if (!result.valid) {
      setValidationError(result.error);
      return;
    }
    setValidationError(null);
    const cleanedCriteria = sanitizeInitialCriteria(initialCriteria);
    await onSubmit({
      title: result.normalizedTitle,
      options: result.normalizedOptions,
      context: context.trim(),
      preferredFramework,
      useGoogleSearch,
      ...(cleanedCriteria.length > 0 ? { initialCriteria: cleanedCriteria } : {}),
    });
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 text-balance">
          Сформулюйте ваше рішення
        </h1>
        <p className="mt-2.5 text-base text-slate-600 leading-relaxed max-w-2xl">
          Оберіть готовий шаблон або опишіть власний вибір. ШІ створить список плюсів і мінусів, порівняльну таблицю з вашими критеріями та SWOT-аналіз.
        </p>
      </div>

      {/* Decision Templates Picker */}
      <section aria-label="Шаблони рішень" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Шаблони рішень
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Автоматично заповнюють контекст і початкові критерії оцінювання — ви можете змінити будь-яке поле.
            </p>
          </div>

          {selectedTemplateId && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleResetTemplate}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1.5 py-1"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              Скинути шаблон
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {DECISION_TEMPLATES.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                disabled={isSubmitting}
                aria-pressed={isSelected}
                onClick={() => handleSelectTemplate(template)}
                className={`text-left p-3.5 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-600'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-950 truncate">
                    {template.name}
                  </span>
                  {isSelected && (
                    <Check
                      aria-hidden="true"
                      className="w-4 h-4 text-blue-700 shrink-0"
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-snug line-clamp-2">
                  {template.summary}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>{template.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatCriteriaCount(template.initialCriteria.length)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <form
        onSubmit={handleFormSubmit}
        noValidate
        className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
      >
        {(validationError || apiError) && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-700" />
            <span>{validationError || apiError}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="decision-title-input"
            className="block text-sm font-semibold text-slate-900 mb-2"
          >
            Яке рішення вам потрібно прийняти?
          </label>
          <textarea
            id="decision-title-input"
            rows={2}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (validationError) setValidationError(null);
            }}
            disabled={isSubmitting}
            placeholder="Наприклад: Зробити ремонт на кухні зараз чи відкладати на більшу квартиру протягом 3 років?"
            className="w-full px-3.5 py-2.5 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-semibold text-slate-900">
              Варіанти для порівняння{' '}
              <span className="font-normal text-slate-500">
                (необов’язково — ШІ запропонує щонайменше 3)
              </span>
            </span>
            {options.length < 4 && (
              <button
                type="button"
                onClick={handleAddOption}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1.5 py-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Додати варіант
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="font-mono text-xs font-medium text-slate-400 tabular-nums w-5 text-right shrink-0"
                >
                  {idx + 1}.
                </span>
                <label htmlFor={`decision-option-${idx}`} className="sr-only">
                  Варіант {idx + 1}
                </label>
                <input
                  id={`decision-option-${idx}`}
                  type="text"
                  value={opt}
                  disabled={isSubmitting}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  placeholder={`Варіант ${idx + 1} (напр., ${
                    idx === 0
                      ? 'Ремонт зараз'
                      : idx === 1
                        ? 'Накопичити на переїзд'
                        : idx === 2
                          ? 'Косметичне оновлення'
                          : 'Альтернативний шлях'
                  })`}
                  className="flex-1 min-w-0 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    aria-label={`Видалити варіант ${idx + 1}`}
                    disabled={isSubmitting}
                    className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="decision-context-input"
            className="block text-sm font-semibold text-slate-900 mb-2"
          >
            Контекст, пріоритети або обмеження{' '}
            <span className="font-normal text-slate-500">(необов’язково)</span>
          </label>
          <textarea
            id="decision-context-input"
            rows={2}
            value={context}
            disabled={isSubmitting}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Наприклад: бюджет $20 000, важливі вільні вихідні, рішення потрібне до п’ятниці"
            className="w-full px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50"
          />
        </div>

        {/* Initial Evaluation Criteria (populated by templates or added manually) */}
        <div
          aria-label="Початкові критерії оцінювання"
          className="pt-5 border-t border-slate-200 space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="block text-sm font-semibold text-slate-900">
                Початкові критерії для порівняльної матриці{' '}
                <span className="font-normal text-slate-500">
                  ({initialCriteria.length}/6)
                </span>
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                {initialCriteria.length > 0
                  ? 'ШІ оцінить усі варіанти за цими критеріями з урахуванням вказаної ваги.'
                  : 'Оберіть шаблон вище або додайте власні критерії — інакше ШІ підбере їх автоматично.'}
              </p>
            </div>

            {initialCriteria.length < 6 && !showAddCriterion && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowAddCriterion(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1.5 py-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Додати критерій
              </button>
            )}
          </div>

          {initialCriteria.length > 0 && (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/40">
              {initialCriteria.map((criterion) => (
                <li
                  key={criterion.id}
                  className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {criterion.name}
                    </div>
                    {criterion.description && (
                      <div className="text-xs text-slate-500 leading-snug mt-0.5">
                        {criterion.description}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      Вага {criterion.weight}/5
                    </span>
                    <div
                      role="group"
                      aria-label={`Вага критерію «${criterion.name}»`}
                      className="inline-flex items-center gap-0.5"
                    >
                      {[1, 2, 3, 4, 5].map((w) => {
                        const active = criterion.weight === w;
                        return (
                          <button
                            key={w}
                            type="button"
                            disabled={isSubmitting}
                            aria-pressed={active}
                            aria-label={`Встановити вагу критерію «${criterion.name}» на ${w}`}
                            onClick={() =>
                              handleUpdateCriterionWeight(criterion.id, w)
                            }
                            className={`w-6 h-6 text-xs font-mono tabular-nums rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                              active
                                ? 'bg-slate-900 text-white font-semibold'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {w}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      aria-label={`Видалити критерій «${criterion.name}»`}
                      onClick={() => handleRemoveCriterion(criterion.id)}
                      className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showAddCriterion && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <label htmlFor="new-initial-criterion-name" className="sr-only">
                Назва нового критерію
              </label>
              <input
                id="new-initial-criterion-name"
                type="text"
                value={newCriterionName}
                disabled={isSubmitting}
                onChange={(e) => setNewCriterionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCriterion();
                  }
                }}
                placeholder="Наприклад: Валютна диверсифікація"
                className="flex-1 min-w-0 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <div className="flex items-center gap-2 shrink-0">
                <label
                  htmlFor="new-initial-criterion-weight"
                  className="text-xs text-slate-600 whitespace-nowrap"
                >
                  Вага:
                </label>
                <select
                  id="new-initial-criterion-weight"
                  value={newCriterionWeight}
                  disabled={isSubmitting}
                  onChange={(e) => setNewCriterionWeight(Number(e.target.value))}
                  className="px-2 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value={1}>1/5</option>
                  <option value={2}>2/5</option>
                  <option value={3}>3/5</option>
                  <option value={4}>4/5</option>
                  <option value={5}>5/5</option>
                </select>
                <button
                  type="button"
                  disabled={isSubmitting || !newCriterionName.trim()}
                  onClick={handleAddCustomCriterion}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-md whitespace-nowrap transition-colors"
                >
                  Додати
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCriterion(false);
                    setNewCriterionName('');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md whitespace-nowrap"
                >
                  Скасувати
                </button>
              </div>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="block text-sm font-semibold text-slate-900 mb-2">
            Відкрити спершу у форматі
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {FRAMEWORK_CHOICES.map((fw) => {
              const active = preferredFramework === fw.id;
              return (
                <button
                  key={fw.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setPreferredFramework(fw.id)}
                  aria-pressed={active}
                  className={`text-left p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    active
                      ? 'bg-blue-50/70 border-blue-600 text-slate-950'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold whitespace-nowrap">
                    {fw.label}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 leading-snug">
                    {fw.detail}
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                Актуальні дані з Google Пошуку
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                ШІ перевірить свіжі ціни, ставки, тренди й ринкові умови в Google перед побудовою аналізу та додасть посилання на джерела.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            aria-pressed={useGoogleSearch}
            onClick={() => setUseGoogleSearch((prev) => !prev)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              useGoogleSearch
                ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100/70'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {useGoogleSearch ? 'Пошук у Google: Увімк.' : 'Пошук у Google: Вимк.'}
          </button>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Одночасно генерує Плюси і мінуси, Порівняльну таблицю та SWOT-аналіз.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Аналізуємо рішення...
              </>
            ) : (
              <>
                Аналізувати рішення
                <ArrowRight className="w-4 h-4 shrink-0" />
              </>
            )}
          </button>
        </div>
      </form>

      {isSubmitting && (
        <div
          aria-live="polite"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span className="font-medium text-slate-900">
              Формуємо Плюси і мінуси, Порівняльну таблицю та SWOT-аналіз...
            </span>
            <span className="font-mono text-xs text-slate-500">3 формати</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}
