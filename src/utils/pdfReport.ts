import type {
  Content,
  ContentCanvas,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import type { DecisionRecord, ProConItem, SwotItem } from '../types/decision';
import {
  calculateComparisonTotals,
  calculateCriteriaWeightImpact,
  calculateProsConsBalance,
  computeOverallLeaning,
  summarizeSwot,
} from './decisionMath';

const UKRAINIAN_TRANSLIT_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
  "'": '',
  '’': '',
};

const COLORS = {
  ink: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  strongBorder: '#CBD5E1',
  surface: '#F8FAFC',
  blue: '#1D4ED8',
  blueTint: '#EFF6FF',
  emerald: '#047857',
  emeraldTint: '#ECFDF5',
  rose: '#BE123C',
  roseTint: '#FFF1F2',
  amber: '#B45309',
  amberTint: '#FFFBEB',
  white: '#FFFFFF',
};

const CLEAN_TABLE_LAYOUT: CustomTableLayout = {
  hLineWidth: (i, node) => {
    if (i === 0 || i === node.table.body.length) return 0.8;
    if (i === 1) return 1;
    return 0.5;
  },
  vLineWidth: () => 0.5,
  hLineColor: (i) => (i === 1 ? COLORS.strongBorder : COLORS.border),
  vLineColor: () => COLORS.border,
  paddingLeft: () => 7,
  paddingRight: () => 7,
  paddingTop: () => 6,
  paddingBottom: () => 6,
};

const CARD_BOX_LAYOUT: CustomTableLayout = {
  hLineWidth: () => 0.8,
  vLineWidth: () => 0.8,
  hLineColor: () => COLORS.strongBorder,
  vLineColor: () => COLORS.strongBorder,
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 10,
  paddingBottom: () => 10,
};

export function buildPdfFilename(title: string): string {
  const lowered = title.trim().toLowerCase();
  let transliterated = '';
  for (const ch of lowered) {
    if (ch in UKRAINIAN_TRANSLIT_MAP) {
      transliterated += UKRAINIAN_TRANSLIT_MAP[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      transliterated += ch;
    } else {
      transliterated += '-';
    }
  }

  const slug = transliterated
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56)
    .replace(/-$/g, '');

  return `the-tiebreaker-${slug || 'zvit-rishennya'}.pdf`;
}

function formatReportDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function buildSectionHeading(title: string, subtitle?: string): Content {
  const stack: Content[] = [
    {
      text: title,
      style: 'sectionTitle',
      margin: [0, 16, 0, subtitle ? 2 : 6],
    },
  ];
  if (subtitle) {
    stack.push({
      text: subtitle,
      style: 'sectionSubtitle',
      margin: [0, 0, 0, 6],
    });
  }
  return { stack, unbreakable: true };
}

function buildProgressBarCanvas(
  sharePercent: number,
  isTopWeight: boolean,
): ContentCanvas {
  const trackWidth = 96;
  const barHeight = 7;
  const clamped = Math.max(0, Math.min(100, sharePercent));
  const fillWidth =
    clamped === 0 ? 0 : Math.max(4, Math.round((clamped / 100) * trackWidth));

  const canvasItems: ContentCanvas['canvas'] = [
    {
      type: 'rect',
      x: 0,
      y: 2,
      w: trackWidth,
      h: barHeight,
      r: 3,
      color: COLORS.border,
    },
  ];

  if (fillWidth > 0) {
    canvasItems.push({
      type: 'rect',
      x: 0,
      y: 2,
      w: fillWidth,
      h: barHeight,
      r: 3,
      color: isTopWeight ? COLORS.blue : '#475569',
    });
  }

  return {
    canvas: canvasItems,
  };
}

function formatProConBulletList(items: ProConItem[]): Content {
  if (items.length === 0) {
    return { text: 'Немає записів', style: 'emptyText' };
  }

  return {
    stack: items.map((item) => ({
      text: [
        {
          text: `[${item.weight}/5] `,
          bold: true,
          color: item.type === 'pro' ? COLORS.emerald : COLORS.rose,
        },
        { text: item.text, bold: true, color: COLORS.ink },
        ...(item.rationale.trim()
          ? [{ text: ` — ${item.rationale.trim()}`, color: COLORS.body }]
          : []),
      ],
      fontSize: 8.5,
      lineHeight: 1.3,
      margin: [0, 0, 0, 4],
    })),
  };
}

function formatSwotList(items: SwotItem[]): Content {
  if (items.length === 0) {
    return { text: 'Немає записів', style: 'emptyText' };
  }

  return {
    ul: items.map((item) =>
      item.critical
        ? {
            text: [
              { text: '[Ключове] ', bold: true, color: COLORS.amber },
              { text: item.text, color: COLORS.ink },
            ],
            fontSize: 8.5,
            lineHeight: 1.3,
            margin: [0, 0, 0, 3],
          }
        : {
            text: item.text,
            fontSize: 8.5,
            color: COLORS.body,
            lineHeight: 1.3,
            margin: [0, 0, 0, 3],
          },
    ),
  };
}

export function buildDecisionPdfDefinition(
  decision: DecisionRecord,
  generatedAt: Date = new Date(),
): TDocumentDefinitions {
  const leaning = computeOverallLeaning(decision);
  const chosenOption = decision.chosenOptionId
    ? decision.options.find((o) => o.id === decision.chosenOptionId) ?? null
    : null;
  const comparisonSummary = calculateComparisonTotals(
    decision.comparisonCriteria,
    decision.options,
  );
  const weightImpact = calculateCriteriaWeightImpact(
    decision.comparisonCriteria,
    decision.options,
  );
  const formattedDate = formatReportDate(generatedAt);

  const statusLabel = chosenOption
    ? `Рішення зафіксовано: ${chosenOption.name}`
    : leaning.leadingOptionName
      ? `Поточний лідер: ${leaning.leadingOptionName}`
      : 'Поточний стан: Нічия';

  const statusColor = chosenOption
    ? COLORS.emerald
    : leaning.leadingOptionName
      ? COLORS.blue
      : COLORS.amber;

  const content: Content[] = [];

  // 1. Report Masthead
  content.push({
    columns: [
      {
        text: 'THE TIEBREAKER · ЗВІТ ПРО ПРИЙНЯТТЯ РІШЕННЯ',
        fontSize: 8,
        bold: true,
        color: COLORS.blue,
        characterSpacing: 0.6,
      },
      {
        text: formattedDate,
        fontSize: 8,
        color: COLORS.muted,
        alignment: 'right',
      },
    ],
    margin: [0, 0, 0, 6],
  });

  content.push({
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 1,
        lineColor: COLORS.strongBorder,
      },
    ],
    margin: [0, 0, 0, 12],
  });

  // Title & Context
  content.push({
    text: decision.title,
    style: 'docTitle',
    margin: [0, 0, 0, decision.context.trim() ? 6 : 12],
  });

  if (decision.context.trim()) {
    content.push({
      text: decision.context.trim(),
      style: 'contextText',
      margin: [0, 0, 0, 12],
    });
  }

  // Executive Summary Card
  const summaryStack: Content[] = [
    {
      text: statusLabel,
      fontSize: 11,
      bold: true,
      color: statusColor,
      margin: [0, 0, 0, 3],
    },
    {
      text: leaning.basisLabel,
      fontSize: 8.5,
      color: COLORS.muted,
      margin: [0, 0, 0, 6],
    },
  ];

  if (decision.aiTakeaway.trim()) {
    summaryStack.push({
      text: [
        { text: 'Висновок аналізу: ', bold: true, color: COLORS.ink },
        { text: decision.aiTakeaway.trim(), color: COLORS.body },
      ],
      fontSize: 9,
      lineHeight: 1.35,
      margin: [0, 0, 0, decision.tiebreakerQuestion.trim() ? 6 : 0],
    });
  }

  if (decision.tiebreakerQuestion.trim()) {
    summaryStack.push({
      text: [
        { text: 'Вирішальне питання: ', bold: true, color: COLORS.blue },
        { text: decision.tiebreakerQuestion.trim(), color: COLORS.ink },
      ],
      fontSize: 9,
      lineHeight: 1.35,
    });
  }

  content.push({
    table: {
      widths: ['*'],
      body: [[{ stack: summaryStack, fillColor: COLORS.surface }]],
    },
    layout: CARD_BOX_LAYOUT,
    margin: [0, 0, 0, 8],
  });

  // 2. Options Comparison Table (4-column overview)
  if (decision.options.length > 0) {
    content.push(
      buildSectionHeading(
        '1. Порівняльна таблиця варіантів',
        'Зведене порівняння ключових переваг, недоліків та стратегічних міркувань за кожним варіантом.',
      ),
    );

    const overviewBody: TableCell[][] = [
      [
        { text: 'Варіант', style: 'tableHeader' },
        { text: 'Плюси', style: 'tableHeader' },
        { text: 'Мінуси', style: 'tableHeader' },
        { text: 'Ключові міркування', style: 'tableHeader' },
      ],
    ];

    decision.options.forEach((opt, idx) => {
      const pc = decision.prosCons.find((entry) => entry.optionId === opt.id);
      const pros = (pc?.items ?? []).filter((item) => item.type === 'pro');
      const cons = (pc?.items ?? []).filter((item) => item.type === 'con');
      const considerations =
        opt.keyConsiderations && opt.keyConsiderations.length > 0
          ? opt.keyConsiderations
          : opt.summary
            ? [opt.summary]
            : [];
      const rowFill =
        decision.chosenOptionId === opt.id
          ? COLORS.emeraldTint
          : idx % 2 === 1
            ? COLORS.surface
            : COLORS.white;

      overviewBody.push([
        {
          stack: [
            {
              text:
                decision.chosenOptionId === opt.id
                  ? `${opt.name} (Обрано)`
                  : opt.name,
              bold: true,
              fontSize: 9,
              color:
                decision.chosenOptionId === opt.id
                  ? COLORS.emerald
                  : COLORS.ink,
            },
            ...(opt.summary
              ? [
                  {
                    text: opt.summary,
                    fontSize: 8,
                    color: COLORS.muted,
                    margin: [0, 3, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
          ],
          fillColor: rowFill,
        },
        {
          ul:
            pros.length > 0
              ? pros.map((p) => ({
                  text: p.text,
                  fontSize: 8.5,
                  color: COLORS.body,
                }))
              : [{ text: '—', fontSize: 8.5, color: COLORS.muted }],
          fillColor: rowFill,
        },
        {
          ul:
            cons.length > 0
              ? cons.map((c) => ({
                  text: c.text,
                  fontSize: 8.5,
                  color: COLORS.body,
                }))
              : [{ text: '—', fontSize: 8.5, color: COLORS.muted }],
          fillColor: rowFill,
        },
        {
          ul:
            considerations.length > 0
              ? considerations.map((note) => ({
                  text: note,
                  fontSize: 8.5,
                  color: COLORS.body,
                }))
              : [{ text: '—', fontSize: 8.5, color: COLORS.muted }],
          fillColor: rowFill,
        },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['20%', '27%', '27%', '26%'],
        body: overviewBody,
      },
      layout: CLEAN_TABLE_LAYOUT,
    });
  }

  // 3. Criteria Weights & Weighted Scoring Matrix
  if (decision.comparisonCriteria.length > 0) {
    const dominantNote = weightImpact.dominantCriterionName
      ? `Найбільший вплив має «${weightImpact.dominantCriterionName}» (${weightImpact.dominantSharePercent}% від загальної ваги ${weightImpact.totalWeight}).`
      : `Загальна вага критеріїв: ${weightImpact.totalWeight}.`;

    content.push(
      buildSectionHeading('2. Вплив критеріїв та зважена матриця', dominantNote),
    );

    // 3a. Weight distribution with native vector progress bars
    const weightRows: TableCell[][] = [
      [
        { text: 'Критерій', style: 'tableHeader' },
        { text: 'Вага', style: 'tableHeader', alignment: 'center' },
        { text: 'Частка впливу', style: 'tableHeader' },
        { text: '%', style: 'tableHeader', alignment: 'right' },
        { text: 'Розкид / Лідер', style: 'tableHeader' },
      ],
    ];

    weightImpact.items.forEach((item, idx) => {
      const rowFill = idx % 2 === 1 ? COLORS.surface : COLORS.white;
      const leaderText =
        item.spreadPoints === 0
          ? 'Рівні бали (Δ 0)'
          : `Δ ${item.spreadPoints} б. · ${item.leadingOptionNames.join(', ')}`;

      weightRows.push([
        {
          text: item.name,
          fontSize: 8.5,
          bold: item.isTopWeight,
          color: COLORS.ink,
          fillColor: rowFill,
        },
        {
          text: `${item.weight}/5`,
          fontSize: 8.5,
          bold: true,
          alignment: 'center',
          color: item.isTopWeight ? COLORS.blue : COLORS.body,
          fillColor: rowFill,
        },
        {
          ...buildProgressBarCanvas(item.sharePercent, item.isTopWeight),
          fillColor: rowFill,
        },
        {
          text: `${item.sharePercent}%`,
          fontSize: 8.5,
          bold: true,
          alignment: 'right',
          color: item.isTopWeight ? COLORS.blue : COLORS.ink,
          fillColor: rowFill,
        },
        {
          text: leaderText,
          fontSize: 8,
          color: COLORS.body,
          fillColor: rowFill,
        },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 40, 108, 34, '27%'],
        body: weightRows,
      },
      layout: CLEAN_TABLE_LAYOUT,
      margin: [0, 0, 0, 10],
    });

    // 3b. Weighted scoring matrix
    const optionCount = decision.options.length;
    const scoreColWidth = optionCount > 0 ? `${Math.floor(58 / optionCount)}%` : '*';
    const matrixWidths: Array<string | number> = [
      '*',
      38,
      ...decision.options.map(() => scoreColWidth),
    ];

    const matrixBody: TableCell[][] = [
      [
        { text: 'Критерій', style: 'tableHeader' },
        { text: 'Вага', style: 'tableHeader', alignment: 'center' },
        ...decision.options.map((opt) => ({
          text: opt.name,
          style: 'tableHeader',
        })),
      ],
    ];

    decision.comparisonCriteria.forEach((criterion, idx) => {
      const rowFill = idx % 2 === 1 ? COLORS.surface : COLORS.white;
      matrixBody.push([
        {
          stack: [
            { text: criterion.name, bold: true, fontSize: 8.5, color: COLORS.ink },
            ...(criterion.description.trim()
              ? [
                  {
                    text: criterion.description.trim(),
                    fontSize: 7.5,
                    color: COLORS.muted,
                    margin: [0, 2, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
          ],
          fillColor: rowFill,
        },
        {
          text: `${criterion.weight}/5`,
          fontSize: 8.5,
          bold: true,
          alignment: 'center',
          color: COLORS.ink,
          fillColor: rowFill,
        },
        ...decision.options.map((opt) => {
          const entry = criterion.scores[opt.id];
          const score = entry?.score ?? 0;
          const note = entry?.note?.trim() ?? '';
          return {
            stack: [
              {
                text: `${score}/10`,
                bold: true,
                fontSize: 8.5,
                color: score >= 8 ? COLORS.emerald : COLORS.ink,
              },
              ...(note
                ? [
                    {
                      text: note,
                      fontSize: 7.5,
                      color: COLORS.muted,
                      margin: [0, 1, 0, 0] as [number, number, number, number],
                    },
                  ]
                : []),
            ],
            fillColor: rowFill,
          };
        }),
      ]);
    });

    // Totals footer row
    matrixBody.push([
      {
        text: 'Зважений підсумок',
        bold: true,
        fontSize: 9,
        color: COLORS.ink,
        fillColor: COLORS.surface,
      },
      {
        text: `${comparisonSummary.totalWeight}`,
        bold: true,
        fontSize: 8.5,
        alignment: 'center',
        color: COLORS.ink,
        fillColor: COLORS.surface,
      },
      ...comparisonSummary.totals.map((total) => ({
        stack: [
          {
            text: `${total.percentScore}%`,
            bold: true,
            fontSize: 10,
            color: total.isLeader ? COLORS.emerald : COLORS.ink,
          },
          {
            text: `${total.weightedSum} / ${total.maxPossible} б.`,
            fontSize: 7.5,
            color: total.isLeader ? COLORS.emerald : COLORS.muted,
          },
        ],
        fillColor: total.isLeader ? COLORS.emeraldTint : COLORS.surface,
      })),
    ]);

    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: matrixWidths,
        body: matrixBody,
      },
      layout: CLEAN_TABLE_LAYOUT,
    });
  }

  // 4. Pros & Cons per Option
  if (decision.options.length > 0) {
    content.push(
      buildSectionHeading(
        '3. Плюси і мінуси за варіантами',
        'Аргументи з урахуванням індивідуальної ваги кожного пункту (від 1 до 5).',
      ),
    );

    decision.options.forEach((opt) => {
      const pc = decision.prosCons.find((entry) => entry.optionId === opt.id);
      const items = pc?.items ?? [];
      const pros = items.filter((item) => item.type === 'pro');
      const cons = items.filter((item) => item.type === 'con');
      const balance = calculateProsConsBalance(items);
      const netPrefix = balance.netScore > 0 ? '+' : '';

      content.push({
        stack: [
          {
            text: [
              { text: opt.name, bold: true, fontSize: 10.5, color: COLORS.ink },
              {
                text: `   ·   Чистий баланс: ${netPrefix}${balance.netScore} (Плюси: ${balance.proWeight}, Мінуси: ${balance.conWeight})`,
                fontSize: 8.5,
                color:
                  balance.leaning === 'pro'
                    ? COLORS.emerald
                    : balance.leaning === 'con'
                      ? COLORS.rose
                      : COLORS.muted,
              },
            ],
            margin: [0, 6, 0, 4],
          },
          {
            table: {
              headerRows: 1,
              dontBreakRows: true,
              widths: ['50%', '50%'],
              body: [
                [
                  {
                    text: `Плюси (${balance.proCount})`,
                    fontSize: 8.5,
                    bold: true,
                    color: COLORS.emerald,
                    fillColor: COLORS.emeraldTint,
                  },
                  {
                    text: `Мінуси (${balance.conCount})`,
                    fontSize: 8.5,
                    bold: true,
                    color: COLORS.rose,
                    fillColor: COLORS.roseTint,
                  },
                ],
                [formatProConBulletList(pros), formatProConBulletList(cons)],
              ],
            },
            layout: CLEAN_TABLE_LAYOUT,
          },
        ],
        margin: [0, 0, 0, 6],
      });
    });
  }

  // 5. SWOT Analysis per Option
  if (decision.swot.length > 0) {
    content.push(
      buildSectionHeading(
        '4. SWOT-аналіз',
        'Внутрішні та зовнішні фактори для кожного варіанту з виділенням ключових пунктів.',
      ),
    );

    decision.options.forEach((opt) => {
      const swotEntry = decision.swot.find((entry) => entry.optionId === opt.id);
      if (!swotEntry) return;
      const summary = summarizeSwot(swotEntry);

      content.push({
        stack: [
          {
            text: [
              { text: opt.name, bold: true, fontSize: 10.5, color: COLORS.ink },
              {
                text: `   ·   Сприятливі: ${summary.helpfulCount} · Стримувальні: ${summary.harmfulCount} · Ключові: ${summary.criticalCount}`,
                fontSize: 8.5,
                color: COLORS.muted,
              },
            ],
            margin: [0, 6, 0, 4],
          },
          {
            table: {
              dontBreakRows: true,
              widths: ['50%', '50%'],
              body: [
                [
                  {
                    stack: [
                      {
                        text: 'Сильні сторони (Strengths)',
                        fontSize: 8.5,
                        bold: true,
                        color: COLORS.emerald,
                        margin: [0, 0, 0, 4],
                      },
                      formatSwotList(swotEntry.strengths),
                    ],
                    fillColor: COLORS.emeraldTint,
                  },
                  {
                    stack: [
                      {
                        text: 'Слабкі сторони (Weaknesses)',
                        fontSize: 8.5,
                        bold: true,
                        color: COLORS.rose,
                        margin: [0, 0, 0, 4],
                      },
                      formatSwotList(swotEntry.weaknesses),
                    ],
                    fillColor: COLORS.roseTint,
                  },
                ],
                [
                  {
                    stack: [
                      {
                        text: 'Можливості (Opportunities)',
                        fontSize: 8.5,
                        bold: true,
                        color: COLORS.blue,
                        margin: [0, 0, 0, 4],
                      },
                      formatSwotList(swotEntry.opportunities),
                    ],
                    fillColor: COLORS.blueTint,
                  },
                  {
                    stack: [
                      {
                        text: 'Загрози (Threats)',
                        fontSize: 8.5,
                        bold: true,
                        color: COLORS.amber,
                        margin: [0, 0, 0, 4],
                      },
                      formatSwotList(swotEntry.threats),
                    ],
                    fillColor: COLORS.amberTint,
                  },
                ],
              ],
            },
            layout: CLEAN_TABLE_LAYOUT,
          },
        ],
        margin: [0, 0, 0, 6],
      });
    });
  }

  // 6. AI Stress-Test Challenges (when present)
  if (decision.challenges.length > 0) {
    content.push(
      buildSectionHeading(
        '5. ШІ-перевірка на міцність',
        'Додаткові критичні сценарії, сліпі зони та контраргументи.',
      ),
    );

    decision.challenges.forEach((insight) => {
      const cardStack: Content[] = [
        {
          text: insight.promptLabel,
          fontSize: 8,
          bold: true,
          color: COLORS.muted,
        },
        {
          text: insight.heading,
          fontSize: 10,
          bold: true,
          color: COLORS.ink,
          margin: [0, 2, 0, 5],
        },
        {
          ul: insight.points.map((pt) => ({
            text: pt,
            fontSize: 8.5,
            color: COLORS.body,
            lineHeight: 1.35,
            margin: [0, 0, 0, 2],
          })),
        },
      ];

      if (insight.tiebreakerQuestion.trim()) {
        cardStack.push({
          text: [
            { text: 'На подумати: ', bold: true, color: COLORS.blue },
            { text: insight.tiebreakerQuestion.trim(), color: COLORS.ink },
          ],
          fontSize: 8.5,
          margin: [0, 5, 0, 0],
        });
      }

      content.push({
        table: {
          widths: ['*'],
          body: [[{ stack: cardStack, fillColor: COLORS.surface }]],
        },
        layout: CARD_BOX_LAYOUT,
        unbreakable: true,
        margin: [0, 0, 0, 8],
      });
    });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 40, 40, 48],
    info: {
      title: `${decision.title} — The Tiebreaker`,
      author: 'The Tiebreaker',
      subject: 'Аналітичний звіт про прийняття рішення',
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
      color: COLORS.ink,
      lineHeight: 1.3,
    },
    styles: {
      docTitle: {
        fontSize: 18,
        bold: true,
        color: COLORS.ink,
        lineHeight: 1.2,
      },
      contextText: {
        fontSize: 9.5,
        color: COLORS.body,
        lineHeight: 1.4,
      },
      sectionTitle: {
        fontSize: 12.5,
        bold: true,
        color: COLORS.ink,
      },
      sectionSubtitle: {
        fontSize: 8.5,
        color: COLORS.muted,
      },
      tableHeader: {
        fontSize: 8.5,
        bold: true,
        color: COLORS.white,
        fillColor: COLORS.ink,
      },
      emptyText: {
        fontSize: 8.5,
        italics: true,
        color: COLORS.muted,
      },
    },
    footer: (currentPage: number, pageCount: number): Content => ({
      columns: [
        {
          text: 'The Tiebreaker · Аналітичний звіт',
          fontSize: 8,
          color: COLORS.muted,
        },
        {
          text: `Сторінка ${currentPage} з ${pageCount}`,
          fontSize: 8,
          color: COLORS.muted,
          alignment: 'right',
        },
      ],
      margin: [40, 14, 40, 0],
    }),
    content,
  };
}

let pdfMakeVfsInitialized = false;

interface PdfMakeRuntime {
  createPdf: (docDefinition: TDocumentDefinitions) => {
    getBlob: () => Promise<Blob>;
  };
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  vfs?: Record<string, string>;
}

export async function exportDecisionToPdf(
  decision: DecisionRecord,
): Promise<string> {
  const [pdfMakeModule, vfsFontsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);

  const pdfMake = (
    'default' in pdfMakeModule && pdfMakeModule.default
      ? pdfMakeModule.default
      : pdfMakeModule
  ) as unknown as PdfMakeRuntime;

  if (!pdfMakeVfsInitialized) {
    const rawVfs = vfsFontsModule as unknown as {
      default?: Record<string, string>;
      pdfMake?: { vfs?: Record<string, string> };
    } & Record<string, string>;

    const vfs = rawVfs.default ?? rawVfs.pdfMake?.vfs ?? rawVfs;

    if (typeof pdfMake.addVirtualFileSystem === 'function') {
      pdfMake.addVirtualFileSystem(vfs);
    } else {
      pdfMake.vfs = vfs;
    }
    pdfMakeVfsInitialized = true;
  }

  const docDefinition = buildDecisionPdfDefinition(decision, new Date());
  const filename = buildPdfFilename(decision.title);

  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1500);
  }

  return filename;
}
