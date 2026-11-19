import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_DECISIONS } from '../data/seedDecisions';
import type { DecisionRecord } from '../types/decision';
import { buildDecisionPdfDefinition, buildPdfFilename } from './pdfReport';

test('buildPdfFilename transliterates Ukrainian Cyrillic cleanly into safe .pdf slug', () => {
  const filename = buildPdfFilename(
    'Чи варто прийняти пропозицію в стартапі чи залишитись на поточній роботі?',
  );
  assert.ok(filename.startsWith('the-tiebreaker-'));
  assert.ok(filename.endsWith('.pdf'));
  assert.match(filename, /^[a-z0-9-]+\.pdf$/);
  assert.ok(filename.length <= 'the-tiebreaker-.pdf'.length + 56);
});

test('buildPdfFilename handles special characters and empty titles gracefully', () => {
  assert.equal(buildPdfFilename('   '), 'the-tiebreaker-zvit-rishennya.pdf');
  assert.equal(
    buildPdfFilename('Європейський ґанок і їжак!'),
    'the-tiebreaker-yevropeyskyy-ganok-i-yizhak.pdf',
  );
});

test('buildDecisionPdfDefinition builds all required Ukrainian report sections for seed decision', () => {
  const decision = SEED_DECISIONS[0];
  const doc = buildDecisionPdfDefinition(
    decision,
    new Date('2026-05-10T12:00:00Z'),
  );

  assert.equal(doc.pageSize, 'A4');
  assert.equal(doc.defaultStyle?.font, 'Roboto');

  const serialized = JSON.stringify(doc.content);
  assert.ok(serialized.includes(decision.title));
  assert.ok(serialized.includes('1. Порівняльна таблиця варіантів'));
  assert.ok(serialized.includes('2. Вплив критеріїв та зважена матриця'));
  assert.ok(serialized.includes('3. Плюси і мінуси за варіантами'));
  assert.ok(serialized.includes('4. SWOT-аналіз'));
  assert.ok(serialized.includes('Зважений підсумок'));
  // Ensure progress bar canvas rects are generated for criteria weights
  assert.ok(serialized.includes('"type":"rect"'));

  // Verify footer function formats Ukrainian page numbers
  assert.equal(typeof doc.footer, 'function');
  if (typeof doc.footer === 'function') {
    const footerContent = doc.footer(2, 4, {
      width: 595,
      height: 842,
      orientation: 'portrait',
    });
    assert.ok(JSON.stringify(footerContent).includes('Сторінка 2 з 4'));
  }
});

test('buildDecisionPdfDefinition includes chosen option status and AI challenges when present', () => {
  const base = SEED_DECISIONS[0];
  const enriched: DecisionRecord = {
    ...base,
    chosenOptionId: base.options[0].id,
    challenges: [
      {
        id: 'ch-1',
        mode: 'devils-advocate',
        promptLabel: 'Адвокат диявола',
        heading: 'Ризик вигорання у перші 6 місяців',
        points: ['Високий темп стартапу може знизити продуктивність.'],
        tiebreakerQuestion: 'Чи є у вас фінансова подушка на 12 місяців?',
        createdAt: '2026-05-10T12:00:00Z',
      },
    ],
  };

  const doc = buildDecisionPdfDefinition(
    enriched,
    new Date('2026-05-10T12:00:00Z'),
  );
  const serialized = JSON.stringify(doc.content);

  assert.ok(serialized.includes(`Рішення зафіксовано: ${base.options[0].name}`));
  assert.ok(serialized.includes('5. ШІ-перевірка на міцність'));
  assert.ok(serialized.includes('Ризик вигорання у перші 6 місяців'));
});

test('buildDecisionPdfDefinition handles minimal decision without criteria or SWOT safely', () => {
  const minimal: DecisionRecord = {
    id: 'min-1',
    title: 'Купити чи орендувати авто?',
    context: '',
    options: [
      {
        id: 'o1',
        name: 'Купити',
        summary: 'Власне авто',
        keyConsiderations: ['Витрати на обслуговування'],
      },
      {
        id: 'o2',
        name: 'Орендувати',
        summary: 'Гнучкість',
        keyConsiderations: ['Щомісячний платіж'],
      },
    ],
    prosCons: [],
    comparisonCriteria: [],
    swot: [],
    aiTakeaway: 'Оцініть горизонт володіння.',
    tiebreakerQuestion: 'Чи плануєте користуватись авто понад 3 роки?',
    challenges: [],
    chosenOptionId: null,
    activeFramework: 'pros-cons',
    createdAt: '2026-05-10T12:00:00Z',
    updatedAt: '2026-05-10T12:00:00Z',
  };

  const doc = buildDecisionPdfDefinition(minimal);
  const serialized = JSON.stringify(doc.content);
  assert.ok(serialized.includes('1. Порівняльна таблиця варіантів'));
  assert.ok(!serialized.includes('2. Вплив критеріїв та зважена матриця'));
  assert.ok(!serialized.includes('4. SWOT-аналіз'));
  assert.ok(!serialized.includes('5. ШІ-перевірка на міцність'));
});
