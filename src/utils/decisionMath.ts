import type {
  ComparisonCriterion,
  DecisionOption,
  DecisionRecord,
  OptionSwot,
  ProConItem,
} from '../types/decision';

export interface ProsConsBalance {
  proCount: number;
  conCount: number;
  proWeight: number;
  conWeight: number;
  netScore: number;
  proRatioPercent: number;
  leaning: 'pro' | 'con' | 'tie';
}

export interface OptionComparisonTotal {
  optionId: string;
  optionName: string;
  weightedSum: number;
  maxPossible: number;
  percentScore: number;
  isLeader: boolean;
}

export interface ComparisonSummary {
  totals: OptionComparisonTotal[];
  leaderIds: string[];
  isTie: boolean;
  totalWeight: number;
}

export interface CriterionWeightImpact {
  criterionId: string;
  name: string;
  weight: number;
  sharePercent: number;
  maxPointsContribution: number;
  spreadPoints: number;
  maxSpreadPossible: number;
  leadingOptionNames: string[];
  isTopWeight: boolean;
}

export interface CriteriaWeightImpactSummary {
  totalWeight: number;
  maxTotalSpread: number;
  dominantCriterionName: string | null;
  dominantSharePercent: number;
  items: CriterionWeightImpact[];
}

export interface SwotSummary {
  strengthsCount: number;
  weaknessesCount: number;
  opportunitiesCount: number;
  threatsCount: number;
  helpfulCount: number;
  harmfulCount: number;
  criticalCount: number;
}

export interface OptionBalanceMetric {
  optionId: string;
  optionName: string;
  proWeight: number;
  conWeight: number;
  netProsCons: number;
  prosConsPercent: number;
  hasProsCons: boolean;
  criteriaWeightedSum: number;
  criteriaMaxPossible: number;
  criteriaPercent: number;
  hasCriteria: boolean;
  compositeScore: number;
  isLeader: boolean;
  isProsConsLeader: boolean;
  isCriteriaLeader: boolean;
}

export interface DecisionBalanceSummary {
  hasData: boolean;
  hasProsCons: boolean;
  hasCriteria: boolean;
  totalProWeight: number;
  totalConWeight: number;
  overallProSharePercent: number;
  totalCriteriaWeight: number;
  options: OptionBalanceMetric[];
  leaderIds: string[];
  leaderName: string | null;
  leadMargin: number;
  isTie: boolean;
  alignmentStatus: 'aligned' | 'divergent' | 'single-source' | 'tie';
  prosConsLeaderName: string | null;
  criteriaLeaderName: string | null;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  normalizedTitle: string;
  normalizedOptions: string[];
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function validateDecisionInput(
  title: string,
  rawOptions: string[],
): ValidationResult {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return {
      valid: false,
      error: 'Введіть рішення, яке ви намагаєтесь прийняти.',
      normalizedTitle: '',
      normalizedOptions: [],
    };
  }

  if (normalizedTitle.length < 6) {
    return {
      valid: false,
      error: 'Додайте ще кілька слів, щоб ШІ зміг чітко проаналізувати компроміси.',
      normalizedTitle,
      normalizedOptions: [],
    };
  }

  const seen = new Set<string>();
  const normalizedOptions: string[] = [];
  for (const opt of rawOptions) {
    const cleaned = opt.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalizedOptions.push(cleaned);
    }
  }

  if (normalizedOptions.length > 4) {
    return {
      valid: false,
      error: 'Порівнюйте до 4 варіантів одночасно, щоб аналіз залишався сфокусованим.',
      normalizedTitle,
      normalizedOptions: normalizedOptions.slice(0, 4),
    };
  }

  return {
    valid: true,
    error: null,
    normalizedTitle,
    normalizedOptions,
  };
}

export function calculateProsConsBalance(items: ProConItem[]): ProsConsBalance {
  let proCount = 0;
  let conCount = 0;
  let proWeight = 0;
  let conWeight = 0;

  for (const item of items) {
    const w = clamp(Math.round(item.weight), 1, 5);
    if (item.type === 'pro') {
      proCount += 1;
      proWeight += w;
    } else {
      conCount += 1;
      conWeight += w;
    }
  }

  const totalWeight = proWeight + conWeight;
  const netScore = proWeight - conWeight;
  const proRatioPercent =
    totalWeight === 0 ? 50 : Math.round((proWeight / totalWeight) * 100);

  let leaning: 'pro' | 'con' | 'tie' = 'tie';
  if (netScore > 0) leaning = 'pro';
  else if (netScore < 0) leaning = 'con';

  return {
    proCount,
    conCount,
    proWeight,
    conWeight,
    netScore,
    proRatioPercent,
    leaning,
  };
}

export function calculateComparisonTotals(
  criteria: ComparisonCriterion[],
  options: DecisionOption[],
): ComparisonSummary {
  const totalWeight = criteria.reduce(
    (sum, c) => sum + clamp(Math.round(c.weight), 1, 5),
    0,
  );
  const maxPossible = totalWeight * 10;

  const rawTotals = options.map((opt) => {
    let weightedSum = 0;
    for (const criterion of criteria) {
      const w = clamp(Math.round(criterion.weight), 1, 5);
      const rawScore = criterion.scores[opt.id]?.score ?? 0;
      const score = clamp(Math.round(rawScore), 0, 10);
      weightedSum += w * score;
    }

    const percentScore =
      maxPossible === 0 ? 0 : Math.round((weightedSum / maxPossible) * 100);

    return {
      optionId: opt.id,
      optionName: opt.name,
      weightedSum,
      maxPossible,
      percentScore,
      isLeader: false,
    };
  });

  const highest = rawTotals.reduce(
    (max, item) => (item.weightedSum > max ? item.weightedSum : max),
    -1,
  );

  const leaderIds =
    highest > 0
      ? rawTotals
          .filter((item) => item.weightedSum === highest)
          .map((item) => item.optionId)
      : [];

  const totals = rawTotals.map((item) => ({
    ...item,
    isLeader: leaderIds.includes(item.optionId),
  }));

  return {
    totals,
    leaderIds,
    isTie: leaderIds.length !== 1,
    totalWeight,
  };
}

export function calculateCriteriaWeightImpact(
  criteria: ComparisonCriterion[],
  options: DecisionOption[],
): CriteriaWeightImpactSummary {
  if (criteria.length === 0) {
    return {
      totalWeight: 0,
      maxTotalSpread: 0,
      dominantCriterionName: null,
      dominantSharePercent: 0,
      items: [],
    };
  }

  const normalized = criteria.map((criterion) => ({
    criterion,
    weight: clamp(Math.round(criterion.weight), 1, 5),
  }));

  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  const maxWeight = Math.max(...normalized.map((entry) => entry.weight));

  // Largest-remainder method so displayed share percentages always sum to 100%
  const rawShares = normalized.map((entry, idx) => {
    const exact = totalWeight === 0 ? 0 : (entry.weight / totalWeight) * 100;
    const floor = Math.floor(exact);
    return { idx, floor, remainder: exact - floor };
  });

  let remainderPoints =
    100 - rawShares.reduce((sum, entry) => sum + entry.floor, 0);
  const shares = rawShares.map((entry) => entry.floor);
  const sortedByRemainder = [...rawShares].sort(
    (a, b) => b.remainder - a.remainder || a.idx - b.idx,
  );
  for (let i = 0; i < sortedByRemainder.length && remainderPoints > 0; i += 1) {
    shares[sortedByRemainder[i].idx] += 1;
    remainderPoints -= 1;
  }

  let maxTotalSpread = 0;
  const items: CriterionWeightImpact[] = normalized.map((entry, idx) => {
    const { criterion, weight } = entry;
    const sharePercent = shares[idx];
    const maxPointsContribution = weight * 10;
    const maxSpreadPossible = weight * 9; // max score 10 minus min score 1

    const scoredOptions = options.map((opt) => ({
      name: opt.name,
      score: clamp(Math.round(criterion.scores[opt.id]?.score ?? 0), 0, 10),
    }));

    let spreadPoints = 0;
    let leadingOptionNames: string[] = [];

    if (scoredOptions.length > 0) {
      const scores = scoredOptions.map((o) => o.score);
      const high = Math.max(...scores);
      const low = Math.min(...scores);
      spreadPoints = (high - low) * weight;
      if (high > 0) {
        leadingOptionNames = scoredOptions
          .filter((o) => o.score === high)
          .map((o) => o.name);
      }
    }

    maxTotalSpread += spreadPoints;

    return {
      criterionId: criterion.id,
      name: criterion.name,
      weight,
      sharePercent,
      maxPointsContribution,
      spreadPoints,
      maxSpreadPossible,
      leadingOptionNames,
      isTopWeight: weight === maxWeight,
    };
  });

  const dominant = [...items].sort(
    (a, b) => b.weight - a.weight || b.sharePercent - a.sharePercent,
  )[0];

  return {
    totalWeight,
    maxTotalSpread,
    dominantCriterionName: dominant?.name ?? null,
    dominantSharePercent: dominant?.sharePercent ?? 0,
    items,
  };
}

export function summarizeSwot(swot: OptionSwot | undefined): SwotSummary {
  if (!swot) {
    return {
      strengthsCount: 0,
      weaknessesCount: 0,
      opportunitiesCount: 0,
      threatsCount: 0,
      helpfulCount: 0,
      harmfulCount: 0,
      criticalCount: 0,
    };
  }

  const strengthsCount = swot.strengths.length;
  const weaknessesCount = swot.weaknesses.length;
  const opportunitiesCount = swot.opportunities.length;
  const threatsCount = swot.threats.length;

  const criticalCount = [
    ...swot.strengths,
    ...swot.weaknesses,
    ...swot.opportunities,
    ...swot.threats,
  ].filter((item) => item.critical).length;

  return {
    strengthsCount,
    weaknessesCount,
    opportunitiesCount,
    threatsCount,
    helpfulCount: strengthsCount + opportunitiesCount,
    harmfulCount: weaknessesCount + threatsCount,
    criticalCount,
  };
}

export function computeOverallLeaning(decision: DecisionRecord): {
  leadingOptionName: string | null;
  leadingOptionId: string | null;
  basisLabel: string;
  isTie: boolean;
} {
  const comparison = calculateComparisonTotals(
    decision.comparisonCriteria,
    decision.options,
  );

  if (comparison.totalWeight > 0 && comparison.totals.length > 0) {
    if (!comparison.isTie && comparison.leaderIds.length === 1) {
      const winner = comparison.totals.find(
        (t) => t.optionId === comparison.leaderIds[0],
      );
      if (winner) {
        return {
          leadingOptionName: winner.optionName,
          leadingOptionId: winner.optionId,
          basisLabel: `Лідер зваженої матриці: ${winner.percentScore}% (${winner.weightedSum}/${winner.maxPossible})`,
          isTie: false,
        };
      }
    }
    if (comparison.isTie && comparison.leaderIds.length > 1) {
      return {
        leadingOptionName: null,
        leadingOptionId: null,
        basisLabel: 'Рівний рахунок у зваженій матриці — змініть ваги критеріїв або запустіть ШІ-перевірку',
        isTie: true,
      };
    }
  }

  // Fallback to Pros/Cons net scores across options
  const ranked = decision.options
    .map((opt) => {
      const pc = decision.prosCons.find((entry) => entry.optionId === opt.id);
      const balance = calculateProsConsBalance(pc?.items ?? []);
      return { opt, net: balance.netScore };
    })
    .sort((a, b) => b.net - a.net);

  if (ranked.length === 0) {
    return {
      leadingOptionName: null,
      leadingOptionId: null,
      basisLabel: 'Додайте плюси, мінуси або критерії для розрахунку переваги',
      isTie: true,
    };
  }

  if (ranked.length > 1 && ranked[0].net === ranked[1].net) {
    return {
      leadingOptionName: null,
      leadingOptionId: null,
      basisLabel: 'Рівний баланс за зваженими плюсами та мінусами',
      isTie: true,
    };
  }

  return {
    leadingOptionName: ranked[0].opt.name,
    leadingOptionId: ranked[0].opt.id,
    basisLabel: `Найкращий баланс плюсів і мінусів (${ranked[0].net >= 0 ? '+' : ''}${ranked[0].net} чиста вага)`,
    isTie: false,
  };
}

export function calculateDecisionBalanceSummary(
  decision: DecisionRecord,
): DecisionBalanceSummary {
  const comparison = calculateComparisonTotals(
    decision.comparisonCriteria,
    decision.options,
  );
  const hasCriteria = comparison.totalWeight > 0 && decision.options.length > 0;

  let totalProWeight = 0;
  let totalConWeight = 0;

  const rawOptions = decision.options.map((opt) => {
    const pcEntry = decision.prosCons.find((p) => p.optionId === opt.id);
    const pcBalance = calculateProsConsBalance(pcEntry?.items ?? []);
    const optHasProsCons = pcBalance.proWeight + pcBalance.conWeight > 0;

    totalProWeight += pcBalance.proWeight;
    totalConWeight += pcBalance.conWeight;

    const compEntry = comparison.totals.find((t) => t.optionId === opt.id);
    const criteriaPercent = compEntry?.percentScore ?? 0;
    const criteriaWeightedSum = compEntry?.weightedSum ?? 0;
    const criteriaMaxPossible = compEntry?.maxPossible ?? 0;

    let compositeScore = 0;
    if (optHasProsCons && hasCriteria) {
      compositeScore = Math.round((pcBalance.proRatioPercent + criteriaPercent) / 2);
    } else if (hasCriteria) {
      compositeScore = criteriaPercent;
    } else if (optHasProsCons) {
      compositeScore = pcBalance.proRatioPercent;
    }

    return {
      optionId: opt.id,
      optionName: opt.name,
      proWeight: pcBalance.proWeight,
      conWeight: pcBalance.conWeight,
      netProsCons: pcBalance.netScore,
      prosConsPercent: pcBalance.proRatioPercent,
      hasProsCons: optHasProsCons,
      criteriaWeightedSum,
      criteriaMaxPossible,
      criteriaPercent,
      hasCriteria,
      compositeScore,
      isLeader: false,
      isProsConsLeader: false,
      isCriteriaLeader: comparison.leaderIds.includes(opt.id),
    };
  });

  const hasProsCons = totalProWeight + totalConWeight > 0;
  const hasData = (hasProsCons || hasCriteria) && rawOptions.length > 0;
  const totalArgsWeight = totalProWeight + totalConWeight;
  const overallProSharePercent =
    totalArgsWeight === 0
      ? 50
      : Math.round((totalProWeight / totalArgsWeight) * 100);

  // Pros/Cons leader (by proRatioPercent, tie-broken by netProsCons)
  let prosConsLeaderIds: string[] = [];
  if (hasProsCons) {
    const maxPcPercent = Math.max(
      ...rawOptions.filter((o) => o.hasProsCons).map((o) => o.prosConsPercent),
    );
    const topByPercent = rawOptions.filter(
      (o) => o.hasProsCons && o.prosConsPercent === maxPcPercent,
    );
    const maxNet = Math.max(...topByPercent.map((o) => o.netProsCons));
    prosConsLeaderIds = topByPercent
      .filter((o) => o.netProsCons === maxNet)
      .map((o) => o.optionId);
  }

  // Overall composite leader(s)
  const highestComposite = hasData
    ? Math.max(...rawOptions.map((o) => o.compositeScore))
    : 0;
  const leaderIds =
    hasData && highestComposite > 0
      ? rawOptions
          .filter((o) => o.compositeScore === highestComposite)
          .map((o) => o.optionId)
      : [];

  const options: OptionBalanceMetric[] = rawOptions.map((item) => ({
    ...item,
    isLeader: leaderIds.includes(item.optionId),
    isProsConsLeader: prosConsLeaderIds.includes(item.optionId),
  }));

  const sortedByComposite = [...options].sort(
    (a, b) => b.compositeScore - a.compositeScore || b.criteriaPercent - a.criteriaPercent,
  );
  const leadMargin =
    sortedByComposite.length >= 2
      ? sortedByComposite[0].compositeScore - sortedByComposite[1].compositeScore
      : 0;

  const isTie = leaderIds.length !== 1;
  const leaderName =
    !isTie && leaderIds.length === 1
      ? options.find((o) => o.optionId === leaderIds[0])?.optionName ?? null
      : null;

  const prosConsLeaderName =
    prosConsLeaderIds.length === 1
      ? options.find((o) => o.optionId === prosConsLeaderIds[0])?.optionName ?? null
      : null;
  const criteriaLeaderName =
    comparison.leaderIds.length === 1
      ? options.find((o) => o.optionId === comparison.leaderIds[0])?.optionName ?? null
      : null;

  let alignmentStatus: DecisionBalanceSummary['alignmentStatus'] = 'single-source';
  if (!hasData) {
    alignmentStatus = 'tie';
  } else if (hasProsCons && hasCriteria) {
    if (
      prosConsLeaderIds.length === 1 &&
      comparison.leaderIds.length === 1
    ) {
      alignmentStatus =
        prosConsLeaderIds[0] === comparison.leaderIds[0] ? 'aligned' : 'divergent';
    } else if (isTie) {
      alignmentStatus = 'tie';
    } else {
      alignmentStatus = 'aligned';
    }
  } else if (isTie) {
    alignmentStatus = 'tie';
  }

  return {
    hasData,
    hasProsCons,
    hasCriteria,
    totalProWeight,
    totalConWeight,
    overallProSharePercent,
    totalCriteriaWeight: comparison.totalWeight,
    options,
    leaderIds,
    leaderName,
    leadMargin,
    isTie,
    alignmentStatus,
    prosConsLeaderName,
    criteriaLeaderName,
  };
}

export function formatDecisionMarkdown(decision: DecisionRecord): string {
  const lines: string[] = [];
  lines.push(`# ${decision.title}`);
  if (decision.context.trim()) {
    lines.push('', `**Контекст:** ${decision.context.trim()}`);
  }
  if (decision.chosenOptionId) {
    const chosen = decision.options.find((o) => o.id === decision.chosenOptionId);
    if (chosen) {
      lines.push('', `**Прийняте рішення:** ${chosen.name}`);
    }
  }
  lines.push('', `**Висновок The Tiebreaker:** ${decision.aiTakeaway}`);

  lines.push('', '## Плюси і мінуси');
  for (const opt of decision.options) {
    const pc = decision.prosCons.find((p) => p.optionId === opt.id);
    const balance = calculateProsConsBalance(pc?.items ?? []);
    lines.push(
      '',
      `### ${opt.name} (Баланс: ${balance.netScore >= 0 ? '+' : ''}${balance.netScore})`,
    );
    const pros = (pc?.items ?? []).filter((i) => i.type === 'pro');
    const cons = (pc?.items ?? []).filter((i) => i.type === 'con');
    lines.push('**Плюси:**');
    for (const p of pros) {
      lines.push(`- [Вага ${p.weight}/5] ${p.text} — ${p.rationale}`);
    }
    lines.push('**Мінуси:**');
    for (const c of cons) {
      lines.push(`- [Вага ${c.weight}/5] ${c.text} — ${c.rationale}`);
    }
  }

  if (decision.options.length > 0) {
    lines.push('', '## Порівняльна таблиця варіантів');
    lines.push('| Варіант | Плюси | Мінуси | Ключові міркування |');
    lines.push('| --- | --- | --- | --- |');
    for (const opt of decision.options) {
      const pc = decision.prosCons.find((p) => p.optionId === opt.id);
      const prosText = (pc?.items ?? [])
        .filter((i) => i.type === 'pro')
        .map((i) => i.text)
        .join('; ') || '—';
      const consText = (pc?.items ?? [])
        .filter((i) => i.type === 'con')
        .map((i) => i.text)
        .join('; ') || '—';
      const considerationsText =
        (opt.keyConsiderations ?? []).join('; ') || opt.summary || '—';
      lines.push(
        `| ${opt.name} | ${prosText} | ${consText} | ${considerationsText} |`,
      );
    }
  }

  if (decision.comparisonCriteria.length > 0) {
    lines.push('', '## Зважена матриця критеріїв');
    const header = [
      'Критерій',
      'Вага',
      ...decision.options.map((o) => o.name),
    ];
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const crit of decision.comparisonCriteria) {
      const cells = decision.options.map((o) => {
        const entry = crit.scores[o.id];
        return entry ? `${entry.score}/10 (${entry.note})` : '—';
      });
      lines.push(`| ${crit.name} | ${crit.weight}/5 | ${cells.join(' | ')} |`);
    }
    const comp = calculateComparisonTotals(
      decision.comparisonCriteria,
      decision.options,
    );
    const footer = [
      '**Зважений підсумок**',
      `${comp.totalWeight}`,
      ...comp.totals.map(
        (t) => `**${t.weightedSum}/${t.maxPossible} (${t.percentScore}%)**`,
      ),
    ];
    lines.push(`| ${footer.join(' | ')} |`);
  }

  if (decision.swot.length > 0) {
    lines.push('', '## SWOT-аналіз');
    for (const opt of decision.options) {
      const s = decision.swot.find((entry) => entry.optionId === opt.id);
      if (!s) continue;
      lines.push('', `### ${opt.name}`);
      lines.push('**Сильні сторони:**', ...s.strengths.map((i) => `- ${i.critical ? '[Ключове] ' : ''}${i.text}`));
      lines.push('**Слабкі сторони:**', ...s.weaknesses.map((i) => `- ${i.critical ? '[Ключове] ' : ''}${i.text}`));
      lines.push('**Можливості:**', ...s.opportunities.map((i) => `- ${i.critical ? '[Ключове] ' : ''}${i.text}`));
      lines.push('**Загрози:**', ...s.threats.map((i) => `- ${i.critical ? '[Ключове] ' : ''}${i.text}`));
    }
  }

  return lines.join('\n');
}
