import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateComparisonTotals,
  calculateCriteriaWeightImpact,
  calculateDecisionBalanceSummary,
  calculateProsConsBalance,
  computeOverallLeaning,
  formatDecisionMarkdown,
  summarizeSwot,
  validateDecisionInput,
} from './decisionMath';
import type {
  ComparisonCriterion,
  DecisionOption,
  DecisionRecord,
  OptionSwot,
  ProConItem,
} from '../types/decision';

test('validateDecisionInput rejects empty and overly short prompts', () => {
  const emptyRes = validateDecisionInput('   ', ['Option A', 'Option B']);
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.error);

  const shortRes = validateDecisionInput('Car?', []);
  assert.equal(shortRes.valid, false);
  assert.ok(shortRes.error);
});

test('validateDecisionInput deduplicates options and rejects > 4 options', () => {
  const validRes = validateDecisionInput('Should I lease or buy a car?', [
    '  Lease EV ',
    'Buy Hybrid',
    'lease ev',
    '',
  ]);
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.normalizedOptions, ['Lease EV', 'Buy Hybrid']);

  const tooMany = validateDecisionInput('Pick a cloud provider for launch', [
    'AWS',
    'GCP',
    'Azure',
    'Fly.io',
    'Render',
  ]);
  assert.equal(tooMany.valid, false);
});

test('calculateProsConsBalance computes weights, net score, ratio, and leaning', () => {
  const items: ProConItem[] = [
    { id: '1', text: 'Lower fuel cost', rationale: 'Saves $150/mo', weight: 5, type: 'pro', source: 'ai' },
    { id: '2', text: 'Smooth ride', rationale: 'Quiet cabin', weight: 3, type: 'pro', source: 'user' },
    { id: '3', text: 'Higher upfront price', rationale: '$6k more', weight: 4, type: 'con', source: 'ai' },
  ];

  const balance = calculateProsConsBalance(items);
  assert.equal(balance.proCount, 2);
  assert.equal(balance.conCount, 1);
  assert.equal(balance.proWeight, 8);
  assert.equal(balance.conWeight, 4);
  assert.equal(balance.netScore, 4);
  assert.equal(balance.proRatioPercent, 67);
  assert.equal(balance.leaning, 'pro');

  const emptyBalance = calculateProsConsBalance([]);
  assert.equal(emptyBalance.leaning, 'tie');
  assert.equal(emptyBalance.proRatioPercent, 50);
});

test('calculateComparisonTotals computes weighted scores and handles ties', () => {
  const options: DecisionOption[] = [
    { id: 'a', name: 'Option A', summary: '', keyConsiderations: ['Upfront cash'] },
    { id: 'b', name: 'Option B', summary: '', keyConsiderations: ['Lease cap'] },
  ];
  const criteria: ComparisonCriterion[] = [
    {
      id: 'c1',
      name: 'Cost',
      description: '5-year total cost',
      weight: 5,
      scores: {
        a: { score: 8, note: 'Predictable' },
        b: { score: 6, note: 'Higher insurance' },
      },
    },
    {
      id: 'c2',
      name: 'Flexibility',
      description: 'Exit options',
      weight: 2,
      scores: {
        a: { score: 5, note: 'Resale needed' },
        b: { score: 10, note: 'Easy return' },
      },
    },
  ];

  // Option A: 5*8 + 2*5 = 50 / 70 -> 71%
  // Option B: 5*6 + 2*10 = 50 / 70 -> 71% (Exact tie!)
  const tieSummary = calculateComparisonTotals(criteria, options);
  assert.equal(tieSummary.totalWeight, 7);
  assert.equal(tieSummary.isTie, true);
  assert.deepEqual(tieSummary.leaderIds, ['a', 'b']);

  // Raise Flexibility weight to 3 -> Option B leads (40+15=55 vs 30+30=60)
  criteria[1].weight = 3;
  const winnerSummary = calculateComparisonTotals(criteria, options);
  assert.equal(winnerSummary.isTie, false);
  assert.deepEqual(winnerSummary.leaderIds, ['b']);
  assert.equal(winnerSummary.totals[1].weightedSum, 60);
  assert.equal(winnerSummary.totals[1].percentScore, 75);
});

test('summarizeSwot counts quadrants and critical factors accurately', () => {
  const swot: OptionSwot = {
    optionId: 'a',
    strengths: [
      { id: 's1', text: 'High resale', critical: true, source: 'ai' },
      { id: 's2', text: 'Long range', critical: false, source: 'ai' },
    ],
    weaknesses: [{ id: 'w1', text: 'Maintenance', critical: true, source: 'ai' }],
    opportunities: [{ id: 'o1', text: 'Road trips', critical: false, source: 'user' }],
    threats: [],
  };

  const summary = summarizeSwot(swot);
  assert.equal(summary.helpfulCount, 3);
  assert.equal(summary.harmfulCount, 1);
  assert.equal(summary.criticalCount, 2);
});

test('computeOverallLeaning and formatDecisionMarkdown produce clean summaries', () => {
  const decision: DecisionRecord = {
    id: 'dec-1',
    title: 'Buy Hybrid vs Lease EV',
    context: '12,000 miles per year',
    options: [
      {
        id: 'opt-1',
        name: 'Buy Hybrid',
        summary: 'Own long-term',
        keyConsiderations: ['Requires $8k down payment', 'High resale value'],
      },
      {
        id: 'opt-2',
        name: 'Lease EV',
        summary: 'Lower commitment',
        keyConsiderations: ['Needs 240V home charger', '12k mi/yr mileage cap'],
      },
    ],
    prosCons: [
      {
        optionId: 'opt-1',
        items: [
          { id: 'p1', text: 'Asset ownership', rationale: 'No monthly payment after year 5', weight: 5, type: 'pro', source: 'ai' },
        ],
      },
      {
        optionId: 'opt-2',
        items: [
          { id: 'p2', text: 'Latest battery tech', rationale: 'Upgrade in 3 years', weight: 4, type: 'pro', source: 'ai' },
        ],
      },
    ],
    comparisonCriteria: [
      {
        id: 'cr-1',
        name: '5-Year Cost',
        description: 'Total outflow',
        weight: 5,
        scores: {
          'opt-1': { score: 9, note: 'Strong equity' },
          'opt-2': { score: 6, note: 'Continuous lease payments' },
        },
      },
    ],
    swot: [
      {
        optionId: 'opt-1',
        strengths: [{ id: 's1', text: 'Reliable resale', critical: true, source: 'ai' }],
        weaknesses: [],
        opportunities: [],
        threats: [],
      },
    ],
    aiTakeaway: 'Buying a hybrid wins on 5-year total cost.',
    tiebreakerQuestion: 'Do you plan to keep the car beyond 5 years?',
    challenges: [],
    chosenOptionId: 'opt-1',
    activeFramework: 'pros-cons',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
  };

  const leaning = computeOverallLeaning(decision);
  assert.equal(leaning.leadingOptionId, 'opt-1');
  assert.equal(leaning.isTie, false);

  const md = formatDecisionMarkdown(decision);
  assert.ok(md.includes('# Buy Hybrid vs Lease EV'));
  assert.ok(md.includes('| Варіант | Плюси | Мінуси | Ключові міркування |'));
  assert.ok(md.includes('Requires $8k down payment'));
  assert.ok(md.includes('## Зважена матриця критеріїв'));
  assert.ok(md.includes('## SWOT-аналіз'));
  assert.ok(md.includes('**Прийняте рішення:** Buy Hybrid'));
});

test('calculateCriteriaWeightImpact normalizes shares to 100% and computes option spread', () => {
  const options: DecisionOption[] = [
    { id: 'a', name: 'Варіант А', summary: '', keyConsiderations: [] },
    { id: 'b', name: 'Варіант Б', summary: '', keyConsiderations: [] },
    { id: 'c', name: 'Варіант В', summary: '', keyConsiderations: [] },
  ];

  // Three equal weights: largest-remainder must sum cleanly to 100%
  const equalCriteria: ComparisonCriterion[] = [
    {
      id: 'c1',
      name: 'Ціна',
      description: '',
      weight: 3,
      scores: {
        a: { score: 9, note: '' },
        b: { score: 6, note: '' },
        c: { score: 4, note: '' },
      },
    },
    {
      id: 'c2',
      name: 'Швидкість',
      description: '',
      weight: 3,
      scores: {
        a: { score: 7, note: '' },
        b: { score: 7, note: '' },
        c: { score: 7, note: '' },
      },
    },
    {
      id: 'c3',
      name: 'Надійність',
      description: '',
      weight: 3,
      scores: {
        a: { score: 5, note: '' },
        b: { score: 8, note: '' },
        c: { score: 8, note: '' },
      },
    },
  ];

  const equalImpact = calculateCriteriaWeightImpact(equalCriteria, options);
  assert.equal(equalImpact.totalWeight, 9);
  assert.equal(
    equalImpact.items.reduce((sum, item) => sum + item.sharePercent, 0),
    100,
  );
  // Ціна spread: (9 - 4) * 3 = 15, leader Варіант А
  assert.equal(equalImpact.items[0].spreadPoints, 15);
  assert.deepEqual(equalImpact.items[0].leadingOptionNames, ['Варіант А']);
  // Швидкість spread: (7 - 7) * 3 = 0
  assert.equal(equalImpact.items[1].spreadPoints, 0);
  // Надійність spread: (8 - 5) * 3 = 9, tied leaders Б and В
  assert.equal(equalImpact.items[2].spreadPoints, 9);
  assert.deepEqual(equalImpact.items[2].leadingOptionNames, ['Варіант Б', 'Варіант В']);

  // Uneven weights: 5 + 3 + 2 = 10 -> 50%, 30%, 20%
  equalCriteria[0].weight = 5;
  equalCriteria[1].weight = 3;
  equalCriteria[2].weight = 2;
  const unevenImpact = calculateCriteriaWeightImpact(equalCriteria, options);
  assert.equal(unevenImpact.dominantCriterionName, 'Ціна');
  assert.equal(unevenImpact.dominantSharePercent, 50);
  assert.deepEqual(
    unevenImpact.items.map((i) => i.sharePercent),
    [50, 30, 20],
  );
  assert.equal(unevenImpact.items[0].maxPointsContribution, 50);
  assert.equal(unevenImpact.items[0].isTopWeight, true);
  assert.equal(unevenImpact.items[1].isTopWeight, false);

  // Empty criteria safety
  const emptyImpact = calculateCriteriaWeightImpact([], options);
  assert.equal(emptyImpact.totalWeight, 0);
  assert.equal(emptyImpact.items.length, 0);
  assert.equal(emptyImpact.dominantCriterionName, null);
});

test('calculateDecisionBalanceSummary combines pros/cons weights and criteria scores accurately', () => {
  const baseDecision: DecisionRecord = {
    id: 'bal-1',
    title: 'Тестове рішення',
    context: '',
    options: [
      { id: 'opt-a', name: 'Варіант А', summary: '', keyConsiderations: [] },
      { id: 'opt-b', name: 'Варіант Б', summary: '', keyConsiderations: [] },
    ],
    prosCons: [
      {
        optionId: 'opt-a',
        items: [
          { id: 'p1', text: 'Плюс А', rationale: '', weight: 4, type: 'pro', source: 'ai' },
          { id: 'c1', text: 'Мінус А', rationale: '', weight: 1, type: 'con', source: 'ai' },
        ],
      },
      {
        optionId: 'opt-b',
        items: [
          { id: 'p2', text: 'Плюс Б', rationale: '', weight: 2, type: 'pro', source: 'ai' },
          { id: 'c2', text: 'Мінус Б', rationale: '', weight: 3, type: 'con', source: 'ai' },
        ],
      },
    ],
    comparisonCriteria: [
      {
        id: 'cr-1',
        name: 'Бюджет',
        description: '',
        weight: 5,
        scores: {
          'opt-a': { score: 6, note: '' },
          'opt-b': { score: 10, note: '' },
        },
      },
    ],
    swot: [],
    aiTakeaway: 'Компроміс між бюджетом і перевагами.',
    tiebreakerQuestion: '',
    challenges: [],
    chosenOptionId: null,
    activeFramework: 'pros-cons',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
  };

  // Option A: prosCons 4/(4+1)=80%, criteria 60% -> composite 70%
  // Option B: prosCons 2/(2+3)=40%, criteria 100% -> composite 70% (exact composite tie, divergent leaders!)
  const divergent = calculateDecisionBalanceSummary(baseDecision);
  assert.equal(divergent.hasData, true);
  assert.equal(divergent.totalProWeight, 6);
  assert.equal(divergent.totalConWeight, 4);
  assert.equal(divergent.overallProSharePercent, 60);
  assert.equal(divergent.totalCriteriaWeight, 5);
  assert.equal(divergent.alignmentStatus, 'divergent');
  assert.equal(divergent.prosConsLeaderName, 'Варіант А');
  assert.equal(divergent.criteriaLeaderName, 'Варіант Б');
  assert.equal(divergent.options[0].compositeScore, 70);
  assert.equal(divergent.options[1].compositeScore, 70);
  assert.equal(divergent.isTie, true);

  // When both models favor Option A -> aligned, positive leadMargin
  const alignedDecision: DecisionRecord = {
    ...baseDecision,
    comparisonCriteria: [
      {
        ...baseDecision.comparisonCriteria[0],
        scores: {
          'opt-a': { score: 9, note: '' },
          'opt-b': { score: 5, note: '' },
        },
      },
    ],
  };
  const aligned = calculateDecisionBalanceSummary(alignedDecision);
  assert.equal(aligned.alignmentStatus, 'aligned');
  assert.equal(aligned.leaderName, 'Варіант А');
  assert.equal(aligned.isTie, false);
  assert.equal(aligned.options[0].compositeScore, 85); // (80 + 90) / 2
  assert.equal(aligned.options[1].compositeScore, 45); // (40 + 50) / 2
  assert.equal(aligned.leadMargin, 40);

  // Pros/cons-only decision uses pros/cons weight share directly
  const prosOnly = calculateDecisionBalanceSummary({
    ...baseDecision,
    comparisonCriteria: [],
  });
  assert.equal(prosOnly.hasProsCons, true);
  assert.equal(prosOnly.hasCriteria, false);
  assert.equal(prosOnly.alignmentStatus, 'single-source');
  assert.equal(prosOnly.options[0].compositeScore, 80);
  assert.equal(prosOnly.leaderName, 'Варіант А');

  // Empty decision handles zero data safely
  const empty = calculateDecisionBalanceSummary({
    ...baseDecision,
    prosCons: [],
    comparisonCriteria: [],
  });
  assert.equal(empty.hasData, false);
  assert.equal(empty.overallProSharePercent, 50);
  assert.equal(empty.leaderName, null);
});
