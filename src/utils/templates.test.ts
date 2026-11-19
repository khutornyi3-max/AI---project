import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_TEMPLATES } from '../data/decisionTemplates';
import {
  applyDecisionTemplateToDraft,
  sanitizeInitialCriteria,
  type ComposerDraftState,
} from './templates';

test('DECISION_TEMPLATES contains valid Ukrainian templates including investments, career, and real estate', () => {
  const ids = DECISION_TEMPLATES.map((t) => t.id);
  assert.ok(ids.includes('investments'));
  assert.ok(ids.includes('career'));
  assert.ok(ids.includes('real-estate'));

  for (const tpl of DECISION_TEMPLATES) {
    assert.ok(tpl.name.trim().length > 0);
    assert.ok(tpl.title.trim().length >= 10);
    assert.ok(tpl.context.trim().length >= 20);
    assert.ok(tpl.options.length >= 3);
    assert.ok(tpl.initialCriteria.length >= 4);
    for (const crit of tpl.initialCriteria) {
      assert.ok(crit.name.trim().length > 0);
      assert.ok(crit.weight >= 1 && crit.weight <= 5);
    }
  }
});

test('applyDecisionTemplateToDraft populates empty draft and switches cleanly between templates', () => {
  const blankDraft: ComposerDraftState = {
    title: '',
    options: ['', '', ''],
    context: '',
    preferredFramework: 'pros-cons',
    initialCriteria: [],
    selectedTemplateId: null,
  };

  const realEstate = DECISION_TEMPLATES.find((t) => t.id === 'real-estate')!;
  const investments = DECISION_TEMPLATES.find((t) => t.id === 'investments')!;

  const afterRealEstate = applyDecisionTemplateToDraft(
    blankDraft,
    realEstate,
    null,
  );
  assert.equal(afterRealEstate.selectedTemplateId, 'real-estate');
  assert.equal(afterRealEstate.title, realEstate.title);
  assert.equal(afterRealEstate.context, realEstate.context);
  assert.deepEqual(afterRealEstate.options, realEstate.options);
  assert.equal(
    afterRealEstate.initialCriteria.length,
    realEstate.initialCriteria.length,
  );

  // Switching directly to another template replaces template-generated title & options too
  const afterInvestments = applyDecisionTemplateToDraft(
    afterRealEstate,
    investments,
    realEstate,
  );
  assert.equal(afterInvestments.selectedTemplateId, 'investments');
  assert.equal(afterInvestments.title, investments.title);
  assert.equal(afterInvestments.context, investments.context);
  assert.deepEqual(afterInvestments.options, investments.options);
  assert.equal(
    afterInvestments.initialCriteria[0].name,
    investments.initialCriteria[0].name,
  );
});

test('applyDecisionTemplateToDraft preserves user-entered custom title and options while filling context and criteria', () => {
  const customDraft: ComposerDraftState = {
    title: 'Купити квартиру в Києві чи Львові?',
    options: ['Квартира в Києві', 'Квартира у Львові', 'Оренда'],
    context: '',
    preferredFramework: 'pros-cons',
    initialCriteria: [],
    selectedTemplateId: null,
  };

  const realEstate = DECISION_TEMPLATES.find((t) => t.id === 'real-estate')!;
  const merged = applyDecisionTemplateToDraft(customDraft, realEstate, null);

  assert.equal(merged.title, 'Купити квартиру в Києві чи Львові?');
  assert.deepEqual(merged.options, ['Квартира в Києві', 'Квартира у Львові', 'Оренда']);
  assert.equal(merged.context, realEstate.context);
  assert.equal(merged.initialCriteria.length, realEstate.initialCriteria.length);
  assert.equal(merged.selectedTemplateId, 'real-estate');
});

test('sanitizeInitialCriteria deduplicates, trims, clamps weights, and caps at 6 items', () => {
  const sanitized = sanitizeInitialCriteria([
    { name: '  Дохідність ', description: '  Чистий дохід  ', weight: 9 },
    { name: 'дохідність', description: 'дублікат', weight: 2 },
    { name: '   ', description: 'empty', weight: 3 },
    { name: 'Ліквідність', description: '', weight: 0 },
    { name: 'Ризик', description: 'Просадка', weight: 4 },
    { name: 'Податки', description: '', weight: 3 },
    { name: 'Час', description: '', weight: 2 },
    { name: 'Інфляція', description: '', weight: 5 },
    { name: 'Зайвий сьомий', description: '', weight: 5 },
  ]);

  assert.equal(sanitized.length, 6);
  assert.deepEqual(sanitized[0], {
    name: 'Дохідність',
    description: 'Чистий дохід',
    weight: 5,
  });
  assert.equal(sanitized[1].weight, 1);
  assert.equal(sanitized[5].name, 'Інфляція');
});
