import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecisionRecord } from '../types/decision';
import { computeScene3DBalanceModel } from './scene3dMath';

function makeFixtureDecision(
  leftScore: number,
  rightScore: number,
): DecisionRecord {
  return {
    id: 'dec-test',
    title: 'Тестове рішення',
    context: 'Контекст',
    options: [
      { id: 'opt-1', name: 'Перший варіант', summary: '', keyConsiderations: [] },
      { id: 'opt-2', name: 'Другий варіант', summary: '', keyConsiderations: [] },
      { id: 'opt-3', name: 'Третій варіант', summary: '', keyConsiderations: [] },
    ],
    prosCons: [
      {
        optionId: 'opt-1',
        items: [
          { id: 'p1', text: 'Pro', rationale: '', weight: 5, type: 'pro', source: 'ai' },
          { id: 'c1', text: 'Con', rationale: '', weight: 1, type: 'con', source: 'ai' },
        ],
      },
      {
        optionId: 'opt-2',
        items: [
          { id: 'p2', text: 'Pro', rationale: '', weight: 2, type: 'pro', source: 'ai' },
          { id: 'c2', text: 'Con', rationale: '', weight: 4, type: 'con', source: 'ai' },
        ],
      },
      {
        optionId: 'opt-3',
        items: [
          { id: 'p3', text: 'Pro', rationale: '', weight: 3, type: 'pro', source: 'ai' },
          { id: 'c3', text: 'Con', rationale: '', weight: 3, type: 'con', source: 'ai' },
        ],
      },
    ],
    comparisonCriteria: [
      {
        id: 'crit-1',
        name: 'Бюджет',
        description: '',
        weight: 5,
        scores: {
          'opt-1': { score: leftScore, note: '' },
          'opt-2': { score: rightScore, note: '' },
          'opt-3': { score: 5, note: '' },
        },
      },
    ],
    swot: [],
    aiTakeaway: '',
    tiebreakerQuestion: '',
    challenges: [],
    chosenOptionId: 'opt-1',
    activeFramework: 'pros-cons',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

test('computeScene3DBalanceModel tilts scale toward stronger left option and preserves symmetry', () => {
  const decision = makeFixtureDecision(9, 4);
  const model = computeScene3DBalanceModel(decision);

  assert.equal(model.columns.length, 3);
  assert.ok(model.beamTiltRad > 0, 'Expected positive tilt when left option dominates');
  assert.ok(model.leftPanOffsetY < 0, 'Expected left pan lower when left option has more weight');
  assert.ok(model.rightPanOffsetY > 0, 'Expected right pan higher');
  assert.equal(model.columns[0].isLeader, true);
  assert.equal(model.columns[0].isChosen, true);
  assert.equal(model.columns[1].xPosition, 0);
  assert.ok(model.columns[0].towerHeight > model.columns[1].towerHeight);
});

test('computeScene3DBalanceModel stays bounded within max tilt for extreme differences', () => {
  const decision = makeFixtureDecision(1, 10);
  const model = computeScene3DBalanceModel(decision);

  assert.ok(Math.abs(model.beamTiltRad) <= 0.24);
  assert.ok(model.columns.every((c) => c.towerHeight >= 0.45 && c.towerHeight <= 2.85));
});
