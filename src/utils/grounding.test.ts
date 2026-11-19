import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGroundingSources,
  extractSearchQueries,
  parseGroundedFactCheck,
} from './grounding';

test('extractGroundingSources deduplicates valid http/https URLs and normalizes titles', () => {
  const sources = extractGroundingSources({
    groundingChunks: [
      { web: { uri: 'https://example.com/rates', title: 'Актуальні ставки НБУ' } },
      { web: { uri: 'https://example.com/rates', title: 'Дублікат' } },
      { web: { uri: 'https://finance.ua/market/2026', title: '   ' } },
      { web: { uri: 'javascript:alert(1)', title: 'Unsafe' } },
      { web: {} },
    ],
  });

  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], {
    title: 'Актуальні ставки НБУ',
    uri: 'https://example.com/rates',
  });
  assert.deepEqual(sources[1], {
    title: 'finance.ua',
    uri: 'https://finance.ua/market/2026',
  });
});

test('extractSearchQueries deduplicates case-insensitively and limits count', () => {
  const queries = extractSearchQueries(
    {
      webSearchQueries: [
        'ставки іпотеки Україна 2026',
        'Ставки Іпотеки Україна 2026',
        'ціни на оренду Київ',
        '   ',
      ],
    },
    3,
  );

  assert.deepEqual(queries, [
    'ставки іпотеки Україна 2026',
    'ціни на оренду Київ',
  ]);
});

test('parseGroundedFactCheck parses structured Ukrainian heading, bullets, and tiebreaker question', () => {
  const markdown = [
    'Заголовок: Актуальна ситуація на ринку оренди та іпотеки',
    '- Середня дохідність оренди у великих містах становить 5–6% річних.',
    '- Умови пільгової іпотеки вимагають першого внеску від 20%.',
    '- Додаткові витрати на оформлення та ремонт складають 10–15% бюджету.',
    'Питання на подумати: Чи збережеться ваша фінансова подушка на 6 місяців після першого внеску?',
  ].join('\n');

  const parsed = parseGroundedFactCheck(markdown);
  assert.equal(parsed.heading, 'Актуальна ситуація на ринку оренди та іпотеки');
  assert.equal(parsed.points.length, 3);
  assert.equal(
    parsed.tiebreakerQuestion,
    'Чи збережеться ваша фінансова подушка на 6 місяців після першого внеску?',
  );
});

test('parseGroundedFactCheck gracefully handles unstructured text fallback', () => {
  const parsed = parseGroundedFactCheck(
    'Ринок показав зростання на 8% за останній квартал за даними відкритих звітів.',
    'Перевірка фактів',
  );
  assert.ok(parsed.heading.length > 0);
  assert.equal(parsed.points.length, 1);
  assert.ok(parsed.tiebreakerQuestion.length > 0);
});
