import type {
  DecisionTemplate,
  FrameworkType,
  InitialCriterionInput,
} from '../types/decision';
import { clamp } from './decisionMath';

export interface ComposerDraftState {
  title: string;
  options: string[];
  context: string;
  preferredFramework: FrameworkType;
  initialCriteria: InitialCriterionInput[];
  selectedTemplateId: string | null;
}

export function sanitizeInitialCriteria(
  raw: Array<{ name?: string; description?: string; weight?: number }> | undefined,
): Array<{ name: string; description: string; weight: number }> {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const cleaned: Array<{ name: string; description: string; weight: number }> = [];

  for (const item of raw) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const description =
      typeof item?.description === 'string' ? item.description.trim() : '';
    const weight = clamp(Math.round(Number(item?.weight ?? 3)), 1, 5);

    cleaned.push({ name, description, weight });
    if (cleaned.length >= 6) break;
  }

  return cleaned;
}

export function applyDecisionTemplateToDraft(
  current: ComposerDraftState,
  template: DecisionTemplate,
  previousTemplate: DecisionTemplate | null,
): ComposerDraftState {
  const trimmedTitle = current.title.trim();
  const titleWasFromPreviousTemplate =
    previousTemplate !== null && trimmedTitle === previousTemplate.title.trim();
  const shouldReplaceTitle = !trimmedTitle || titleWasFromPreviousTemplate;

  const nonEmptyOptions = current.options.map((o) => o.trim()).filter(Boolean);
  const optionsWereFromPreviousTemplate =
    previousTemplate !== null &&
    nonEmptyOptions.length === previousTemplate.options.length &&
    nonEmptyOptions.every((opt, idx) => opt === previousTemplate.options[idx]);
  const shouldReplaceOptions =
    nonEmptyOptions.length === 0 || optionsWereFromPreviousTemplate;

  return {
    title: shouldReplaceTitle ? template.title : current.title,
    options: shouldReplaceOptions ? [...template.options] : current.options,
    context: template.context,
    preferredFramework: template.preferredFramework,
    initialCriteria: template.initialCriteria.map((c) => ({ ...c })),
    selectedTemplateId: template.id,
  };
}
