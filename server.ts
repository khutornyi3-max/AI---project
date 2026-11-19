import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  Type,
  type LiveServerMessage,
} from '@google/genai';
import type { Request, Response } from 'express';
import {
  extractGroundingSources,
  extractSearchQueries,
  parseGroundedFactCheck,
} from './src/utils/grounding.ts';
import {
  extractMapsGroundingPlaces,
  sanitizeLatLng,
} from './src/utils/mapsGrounding.ts';
import {
  requireAuth,
  type AuthenticatedRequest,
} from './src/middleware/auth.ts';
import { isSqlConfigured } from './src/db/index.ts';
import {
  deleteDecisionSql,
  listUserDecisionsSql,
  upsertDecisionSql,
} from './src/db/decisions.ts';
import type { DecisionRecord } from './src/types/decision.ts';

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';
const LIVE_MODEL_NAME = 'gemini-3.8-live';
const ALLOWED_LIVE_VOICES = new Set(['Zephyr', 'Kore', 'Fenrir', 'Puck', 'Charon']);

function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error(
        'API-ключ Gemini не налаштовано. Перевірте ключ у панелі Налаштування > Секрети (Settings > Secrets).',
      ),
      { statusCode: 400 },
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status?: number }).status)
          : 0;
      // Never retry auth, invalid request, or quota errors
      if (status === 400 || status === 401 || status === 403 || status === 404 || status === 429) {
        throw error;
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError;
}

function mapGeminiError(error: unknown): { status: number; message: string } {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const custom = error as { statusCode?: number; message?: string };
    return {
      status: custom.statusCode || 500,
      message: custom.message || 'Не вдалося виконати аналіз рішення.',
    };
  }

  const rawMessage =
    error instanceof Error ? error.message : String(error ?? 'Невідома помилка');
  let parsedMessage = rawMessage;
  let status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: number }).status)
      : 0;

  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error?.message) {
        parsedMessage = parsed.error.message;
      }
      if (!status && parsed?.error?.code) {
        status = Number(parsed.error.code);
      }
    } catch {
      // Keep rawMessage
    }
  }

  if (status === 403 || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Помилка автентифікації Gemini API. Перевірте API-ключ у панелі Settings > Secrets.',
    };
  }
  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Перевищено ліміт запитів або квоту API. Зачекайте трохи та спробуйте знову.',
    };
  }
  if (status === 503 || rawMessage.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message:
        'ШІ-модель тимчасово перевантажена. Спробуйте ще раз за кілька секунд.',
    };
  }
  if (status === 404 || rawMessage.includes('NOT_FOUND')) {
    return {
      status: 502,
      message: `Модель ${MODEL_NAME} тимчасово недоступна. Спробуйте повторити запит пізніше.`,
    };
  }

  return {
    status: 500,
    message: parsedMessage || 'Виникла непередбачена помилка під час аналізу рішення.',
  };
}

interface RawAiAnalysis {
  options: Array<{
    name: string;
    summary: string;
    keyConsiderations: string[];
  }>;
  prosCons: Array<{
    optionIndex: number;
    pros: Array<{ text: string; rationale: string; weight: number }>;
    cons: Array<{ text: string; rationale: string; weight: number }>;
  }>;
  comparisonCriteria: Array<{
    name: string;
    description: string;
    weight: number;
    optionScores: Array<{ optionIndex: number; score: number; note: string }>;
  }>;
  swot: Array<{
    optionIndex: number;
    strengths: Array<{ text: string; critical: boolean }>;
    weaknesses: Array<{ text: string; critical: boolean }>;
    opportunities: Array<{ text: string; critical: boolean }>;
    threats: Array<{ text: string; critical: boolean }>;
  }>;
  aiTakeaway: string;
  tiebreakerQuestion: string;
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    options: {
      type: Type.ARRAY,
      description: 'At least 3 (and up to 4) concrete decision options being weighed.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Short clear option title (2 to 6 words).' },
          summary: { type: Type.STRING, description: 'One concise sentence summarizing this path.' },
          keyConsiderations: {
            type: Type.ARRAY,
            description: '2 to 3 key considerations (cost, timeline, risk, reversibility, prerequisites) specific to this option.',
            items: { type: Type.STRING },
          },
        },
        required: ['name', 'summary', 'keyConsiderations'],
      },
    },
    prosCons: {
      type: Type.ARRAY,
      description: 'Weighted pros and cons list for each option (aligned by optionIndex).',
      items: {
        type: Type.OBJECT,
        properties: {
          optionIndex: { type: Type.INTEGER, description: 'Zero-based index matching options array.' },
          pros: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: 'Concise pro headline.' },
                rationale: { type: Type.STRING, description: 'Specific practical reason or impact in 1 sentence.' },
                weight: { type: Type.INTEGER, description: 'Importance weight from 1 (minor) to 5 (major).' },
              },
              required: ['text', 'rationale', 'weight'],
            },
          },
          cons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: 'Concise con headline.' },
                rationale: { type: Type.STRING, description: 'Specific practical risk or drawback in 1 sentence.' },
                weight: { type: Type.INTEGER, description: 'Importance weight from 1 (minor) to 5 (major).' },
              },
              required: ['text', 'rationale', 'weight'],
            },
          },
        },
        required: ['optionIndex', 'pros', 'cons'],
      },
    },
    comparisonCriteria: {
      type: Type.ARRAY,
      description: '4 to 6 high-signal comparison criteria scored 1-10 for every option.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Criterion title (2 to 4 words).' },
          description: { type: Type.STRING, description: 'What this criterion measures in 1 short phrase.' },
          weight: { type: Type.INTEGER, description: 'Relative importance from 1 to 5.' },
          optionScores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                optionIndex: { type: Type.INTEGER },
                score: { type: Type.INTEGER, description: 'Score from 1 (poor) to 10 (excellent).' },
                note: { type: Type.STRING, description: 'Short 4-9 word explanation of the score.' },
              },
              required: ['optionIndex', 'score', 'note'],
            },
          },
        },
        required: ['name', 'description', 'weight', 'optionScores'],
      },
    },
    swot: {
      type: Type.ARRAY,
      description: 'SWOT analysis per option (Strengths, Weaknesses, Opportunities, Threats).',
      items: {
        type: Type.OBJECT,
        properties: {
          optionIndex: { type: Type.INTEGER },
          strengths: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                critical: { type: Type.BOOLEAN },
              },
              required: ['text', 'critical'],
            },
          },
          weaknesses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                critical: { type: Type.BOOLEAN },
              },
              required: ['text', 'critical'],
            },
          },
          opportunities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                critical: { type: Type.BOOLEAN },
              },
              required: ['text', 'critical'],
            },
          },
          threats: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                critical: { type: Type.BOOLEAN },
              },
              required: ['text', 'critical'],
            },
          },
        },
        required: ['optionIndex', 'strengths', 'weaknesses', 'opportunities', 'threats'],
      },
    },
    aiTakeaway: {
      type: Type.STRING,
      description: '2-3 crisp sentences synthesizing the core trade-off and what decides the outcome.',
    },
    tiebreakerQuestion: {
      type: Type.STRING,
      description: 'One sharp, decisive gut-check question that breaks a deadlock between options.',
    },
  },
  required: [
    'options',
    'prosCons',
    'comparisonCriteria',
    'swot',
    'aiTakeaway',
    'tiebreakerQuestion',
  ],
};

const CHALLENGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    heading: {
      type: Type.STRING,
      description: 'Short, sharp title summarizing this challenge or stress-test.',
    },
    points: {
      type: Type.ARRAY,
      description: '3 to 4 concrete, specific counter-arguments, blind spots, or second-order effects.',
      items: { type: Type.STRING },
    },
    tiebreakerQuestion: {
      type: Type.STRING,
      description: 'One decisive follow-up question to resolve the tension raised above.',
    },
  },
  required: ['heading', 'points', 'tiebreakerQuestion'],
};

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, Math.round(val)));
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: MODEL_NAME, liveModel: LIVE_MODEL_NAME });
  });

  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        title?: string;
        options?: string[];
        context?: string;
        preferredFramework?: 'pros-cons' | 'comparison' | 'swot';
        useGoogleSearch?: boolean;
        initialCriteria?: Array<{
          name?: string;
          description?: string;
          weight?: number;
        }>;
      };

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const context = typeof body.context === 'string' ? body.context.trim() : '';
      const useGoogleSearch = Boolean(body.useGoogleSearch);
      const rawOptions = Array.isArray(body.options)
        ? body.options
            .filter((o): o is string => typeof o === 'string')
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 4)
        : [];
      const preferredFramework =
        body.preferredFramework === 'comparison' ||
        body.preferredFramework === 'swot' ||
        body.preferredFramework === 'pros-cons'
          ? body.preferredFramework
          : 'pros-cons';

      const seenCritNames = new Set<string>();
      const initialCriteria: Array<{
        name: string;
        description: string;
        weight: number;
      }> = [];
      if (Array.isArray(body.initialCriteria)) {
        for (const item of body.initialCriteria) {
          const name = typeof item?.name === 'string' ? item.name.trim() : '';
          if (!name) continue;
          const key = name.toLowerCase();
          if (seenCritNames.has(key)) continue;
          seenCritNames.add(key);
          initialCriteria.push({
            name,
            description:
              typeof item?.description === 'string' ? item.description.trim() : '',
            weight: clampInt(Number(item?.weight ?? 3), 1, 5),
          });
          if (initialCriteria.length >= 6) break;
        }
      }

      if (title.length < 6) {
        res.status(400).json({
          error: 'Введіть опис рішення довжиною щонайменше 6 символів.',
        });
        return;
      }

      const ai = createAiClient();

      const optionsInstruction =
        rawOptions.length >= 3
          ? `Використай ТОЧНО ці ${rawOptions.length} варіанти в такому порядку: ${rawOptions.map((o, i) => `${i}: "${o}"`).join(', ')}.`
          : rawOptions.length === 2
            ? `Включи 2 варіанти користувача (${rawOptions.map((o, i) => `${i}: "${o}"`).join(', ')}) ПЛЮС розумний 3-й альтернативний або компромісний варіант (індекс 2), щоб у порівняльній таблиці було щонайменше 3 варіанти.`
            : rawOptions.length === 1
              ? `Включи варіант користувача (0: "${rawOptions[0]}") ПЛЮС 2 реалістичні альтернативи (індекси 1 та 2, наприклад статус-кво і гібридний/компромісний шлях), щоб було щонайменше 3 конкретні варіанти.`
              : 'Згенеруй щонайменше 3 чіткі, конкретні потенційні варіанти для цього рішення (наприклад, два основні шляхи та прагматичний третій або компромісний варіант).';

      const criteriaInstruction =
        initialCriteria.length > 0
          ? `ОБОВʼЯЗКОВО використай ТОЧНО ці ${initialCriteria.length} початкові критерії у comparisonCriteria у тому самому порядку, зберігши їхні назви та ваги, та виставивши оцінки 1–10 з короткими примітками для КОЖНОГО варіанту: ${initialCriteria
              .map(
                (c, i) =>
                  `${i + 1}) "${c.name}" (вага ${c.weight}/5${c.description ? `, опис: ${c.description}` : ''})`,
              )
              .join('; ')}.`
          : 'Запропонуй 4–5 критеріїв для зваженої порівняльної матриці з оцінками 1–10 для КОЖНОГО варіанту і короткими примітками.';

      let groundingBrief = '';
      let groundingSources: Array<{ title: string; uri: string }> = [];
      let groundingQueries: string[] = [];

      if (useGoogleSearch) {
        const researchPrompt = [
          `Знайди актуальні, перевірені дані через Google Пошук для обґрунтованого аналізу рішення: "${title}".`,
          rawOptions.length > 0 ? `Варіанти, що розглядаються: ${rawOptions.join(' | ')}.` : '',
          context ? `Контекст користувача: ${context}` : '',
          'Сформуй стислу довідку українською мовою (5–7 конкретних фактів: актуальні ціни, ставки, ринкові тренди, обмеження або свіжі події).',
        ]
          .filter(Boolean)
          .join('\n');

        const searchResponse = await withRetry(() =>
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: researchPrompt,
            config: {
              systemInstruction:
                'Ти — аналітик-дослідник The Tiebreaker. Використовуй Google Пошук, щоб зібрати свіжі, перевірені факти для прийняття рішення. Пиши українською мовою, лаконічно і по суті.',
              tools: [{ googleSearch: {} }],
            },
          }),
        );

        groundingBrief = (searchResponse.text ?? '').trim().slice(0, 3500);
        const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
        groundingSources = extractGroundingSources(groundingMetadata, 8);
        groundingQueries = extractSearchQueries(groundingMetadata, 5);
      }

      const prompt = [
        `Рішення для аналізу: "${title}"`,
        context ? `Контекст та пріоритети користувача: "${context}"` : 'Контекст користувача: не вказано; виходь зі збалансованих прагматичних пріоритетів.',
        groundingBrief
          ? `Актуальна довідка з Google Пошуку (обовʼязково врахуй ці свіжі факти, цифри й умови в оцінках і аргументах):\n${groundingBrief}`
          : '',
        optionsInstruction,
        'Усі тексти у відповіді ОБОВʼЯЗКОВО напиши природною, грамотною українською мовою.',
        'Надай змістовні, конкретні, практичні аргументи без шаблонних фраз:',
        '- Для кожного варіанту вкажи 2–3 ключові міркування (keyConsiderations: бюджет, терміни, залежності, зворотність або пороги ризику).',
        '- Сформуй повний список плюсів і мінусів: по 4–5 плюсів і 4–5 мінусів для кожного варіанту з конкретним поясненням в 1 реченні та реалістичною вагою від 1 до 5.',
        `- ${criteriaInstruction}`,
        '- Побудуй повний SWOT-аналіз (по 2–3 пункти на квадрант) для КОЖНОГО варіанту, позначивши 1–2 найважливіші фактори як critical: true.',
        '- Напиши чіткий неупереджений підсумок (aiTakeaway) та одне гостре вирішальне запитання (tiebreakerQuestion).',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              'Ти — The Tiebreaker, проникливий і неупереджений аналітик рішень. Відповідай виключно українською мовою. Давай конкретні, практичні плюси, мінуси, критерії порівняння та SWOT-аналіз без води. Завжди повертай валідний JSON строго за схемою.',
            responseMimeType: 'application/json',
            responseSchema: ANALYSIS_SCHEMA,
          },
        }),
      );

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Отримано порожню відповідь від Gemini.');
      }

      const parsed = JSON.parse(text) as RawAiAnalysis;
      if (!Array.isArray(parsed.options) || parsed.options.length === 0) {
        throw new Error('Модель повернула неповну структуру аналізу.');
      }

      const options = parsed.options.slice(0, 4).map((opt, idx) => ({
        id: makeId(`opt${idx}`),
        name: (rawOptions[idx] || opt.name || `Варіант ${idx + 1}`).trim(),
        summary: (opt.summary || '').trim(),
        keyConsiderations: Array.isArray(opt.keyConsiderations)
          ? opt.keyConsiderations.map((k) => String(k).trim()).filter(Boolean)
          : [],
      }));

      const prosCons = options.map((opt, idx) => {
        const matched =
          parsed.prosCons?.find((entry) => entry.optionIndex === idx) ??
          parsed.prosCons?.[idx];

        const pros = (matched?.pros ?? []).map((p) => ({
          id: makeId('pro'),
          text: String(p.text || '').trim(),
          rationale: String(p.rationale || '').trim(),
          weight: clampInt(Number(p.weight), 1, 5),
          type: 'pro' as const,
          source: 'ai' as const,
        })).filter((i) => i.text);

        const cons = (matched?.cons ?? []).map((c) => ({
          id: makeId('con'),
          text: String(c.text || '').trim(),
          rationale: String(c.rationale || '').trim(),
          weight: clampInt(Number(c.weight), 1, 5),
          type: 'con' as const,
          source: 'ai' as const,
        })).filter((i) => i.text);

        return {
          optionId: opt.id,
          items: [...pros, ...cons],
        };
      });

      const aiCriteria = Array.isArray(parsed.comparisonCriteria)
        ? parsed.comparisonCriteria
        : [];

      const comparisonCriteria =
        initialCriteria.length > 0
          ? initialCriteria.map((reqCrit, critIdx) => {
              const matchedAi =
                aiCriteria.find(
                  (c) =>
                    String(c.name || '').trim().toLowerCase() ===
                    reqCrit.name.toLowerCase(),
                ) ?? aiCriteria[critIdx];
              const scores: Record<string, { score: number; note: string }> = {};
              options.forEach((opt, idx) => {
                const found =
                  matchedAi?.optionScores?.find((s) => s.optionIndex === idx) ??
                  matchedAi?.optionScores?.[idx];
                scores[opt.id] = {
                  score: clampInt(Number(found?.score ?? 5), 1, 10),
                  note: String(found?.note ?? 'Збалансований показник').trim(),
                };
              });
              return {
                id: makeId('crit'),
                name: reqCrit.name,
                description:
                  reqCrit.description || String(matchedAi?.description || '').trim(),
                weight: reqCrit.weight,
                scores,
              };
            })
          : aiCriteria.map((crit) => {
              const scores: Record<string, { score: number; note: string }> = {};
              options.forEach((opt, idx) => {
                const found =
                  crit.optionScores?.find((s) => s.optionIndex === idx) ??
                  crit.optionScores?.[idx];
                scores[opt.id] = {
                  score: clampInt(Number(found?.score ?? 5), 1, 10),
                  note: String(found?.note ?? 'Збалансований показник').trim(),
                };
              });

              return {
                id: makeId('crit'),
                name: String(crit.name || 'Критерій').trim(),
                description: String(crit.description || '').trim(),
                weight: clampInt(Number(crit.weight), 1, 5),
                scores,
              };
            });

      const swot = options.map((opt, idx) => {
        const matched =
          parsed.swot?.find((s) => s.optionIndex === idx) ?? parsed.swot?.[idx];

        const mapList = (
          list: Array<{ text: string; critical: boolean }> | undefined,
          prefix: string,
        ) =>
          (list ?? [])
            .map((item) => ({
              id: makeId(prefix),
              text: String(item.text || '').trim(),
              critical: Boolean(item.critical),
              source: 'ai' as const,
            }))
            .filter((i) => i.text);

        return {
          optionId: opt.id,
          strengths: mapList(matched?.strengths, 'str'),
          weaknesses: mapList(matched?.weaknesses, 'wk'),
          opportunities: mapList(matched?.opportunities, 'opp'),
          threats: mapList(matched?.threats, 'thr'),
        };
      });

      const now = new Date().toISOString();
      const record = {
        id: makeId('dec'),
        title,
        context,
        options,
        prosCons,
        comparisonCriteria,
        swot,
        aiTakeaway: String(parsed.aiTakeaway || '').trim(),
        tiebreakerQuestion: String(parsed.tiebreakerQuestion || '').trim(),
        challenges: [],
        chosenOptionId: null,
        activeFramework: preferredFramework,
        createdAt: now,
        updatedAt: now,
        ...(groundingSources.length > 0 ? { groundingSources } : {}),
        ...(groundingQueries.length > 0 ? { groundingQueries } : {}),
      };

      res.json(record);
    } catch (error: unknown) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/challenge', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        decisionTitle?: string;
        options?: string[];
        context?: string;
        mode?:
          | 'devils-advocate'
          | 'blind-spots'
          | 'tiebreaker-question'
          | 'fact-check'
          | 'custom';
        customQuestion?: string;
        currentSummary?: string;
        useGoogleSearch?: boolean;
      };

      const decisionTitle = typeof body.decisionTitle === 'string' ? body.decisionTitle.trim() : '';
      if (!decisionTitle) {
        res.status(400).json({ error: 'Потрібна назва рішення для запуску перевірки.' });
        return;
      }

      const mode = body.mode ?? 'blind-spots';
      const customQuestion = typeof body.customQuestion === 'string' ? body.customQuestion.trim() : '';
      if (mode === 'custom' && customQuestion.length < 4) {
        res.status(400).json({ error: 'Введіть конкретний сценарій або запитання для перевірки.' });
        return;
      }

      const useGoogleSearch = mode === 'fact-check' || Boolean(body.useGoogleSearch);
      const ai = createAiClient();
      const optionsText = Array.isArray(body.options) ? body.options.join(' / ') : '';

      if (useGoogleSearch) {
        const promptLabel =
          mode === 'custom'
            ? `Перевірка в Google · ${customQuestion}`
            : 'Перевірка фактів у Google';

        const groundedPrompt = [
          `Рішення: "${decisionTitle}"`,
          optionsText ? `Варіанти: ${optionsText}` : '',
          body.context ? `Контекст: ${body.context}` : '',
          body.currentSummary ? `Поточний підсумок аналізу: ${body.currentSummary}` : '',
          mode === 'custom'
            ? `Перевір у Google Пошуку актуальні факти щодо сценарію: "${customQuestion}".`
            : 'Використай Google Пошук, щоб перевірити ключові припущення, актуальні ціни, ставки, ринкові умови чи свіжі факти для цього рішення.',
          'Оформи відповідь українською мовою СТРОГО у такому форматі:',
          'Заголовок: <короткий чіткий заголовок до 12 слів>',
          '- <конкретний актуальний факт 1 із цифрами або умовами та його вплив на вибір>',
          '- <конкретний актуальний факт 2>',
          '- <конкретний актуальний факт 3>',
          '- <конкретний актуальний факт 4 (за потреби)>',
          'Питання на подумати: <одне гостре запитання для прийняття рішення на основі цих даних>',
        ]
          .filter(Boolean)
          .join('\n');

        const response = await withRetry(() =>
          ai.models.generateContent({
            model: MODEL_NAME,
            contents: groundedPrompt,
            config: {
              systemInstruction:
                'Ти — The Tiebreaker, аналітик-фактчекер рішень. Спирайся на актуальні дані з Google Пошуку. Відповідай виключно українською мовою, точно, без вигаданих цифр.',
              tools: [{ googleSearch: {} }],
            },
          }),
        );

        const text = (response.text ?? '').trim();
        if (!text) {
          throw new Error('Отримано порожню відповідь від Gemini.');
        }

        const parsed = parseGroundedFactCheck(text, promptLabel);
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        const sources = extractGroundingSources(groundingMetadata, 6);
        const searchQueries = extractSearchQueries(groundingMetadata, 4);

        res.json({
          id: makeId('chl'),
          mode,
          promptLabel,
          heading: parsed.heading,
          points: parsed.points,
          tiebreakerQuestion: parsed.tiebreakerQuestion,
          usedSearch: true,
          sources,
          searchQueries,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const modeDirective: Record<string, { label: string; instruction: string }> = {
        'devils-advocate': {
          label: 'Адвокат диявола',
          instruction:
            'Наведи сильні контраргументи проти поточного варіанту-лідера та розкрий приховані припущення, через які користувач може пошкодувати про цей вибір.',
        },
        'blind-spots': {
          label: 'Приховані сліпі зони',
          instruction:
            'Вияви 3–4 неочевидні наслідки другого порядку, приховані витрати, асиметрію зворотності або альтернативні підходи, які користувач міг не врахувати.',
        },
        'tiebreaker-question': {
          label: 'Вихід із глухого кута',
          instruction:
            'Переосмисли рішення через мінімізацію жалю (правило 10/10/10), зворотність рішення та альтернативну вартість, щоб допомогти вийти з глухого кута.',
        },
        custom: {
          label: customQuestion,
          instruction: `Прямо розбери такий сценарій або запитання користувача: "${customQuestion}". Покажи, як це змінює баланс між варіантами.`,
        },
      };

      const selected = modeDirective[mode] ?? modeDirective['blind-spots'];

      const prompt = [
        `Рішення: "${decisionTitle}"`,
        optionsText ? `Варіанти: ${optionsText}` : '',
        body.context ? `Контекст: ${body.context}` : '',
        body.currentSummary ? `Поточний підсумок аналізу: ${body.currentSummary}` : '',
        `Завдання: ${selected.instruction}`,
        'Відповідай виключно природною українською мовою.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              'Ти — The Tiebreaker, відвертий стратег із прийняття рішень. Відповідай виключно українською мовою, лаконічно, конкретно і без банальностей.',
            responseMimeType: 'application/json',
            responseSchema: CHALLENGE_SCHEMA,
          },
        }),
      );

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Отримано порожню відповідь від Gemini.');
      }

      const parsed = JSON.parse(text) as {
        heading?: string;
        points?: string[];
        tiebreakerQuestion?: string;
      };

      res.json({
        id: makeId('chl'),
        mode,
        promptLabel: selected.label,
        heading: String(parsed.heading || selected.label).trim(),
        points: Array.isArray(parsed.points)
          ? parsed.points.map((p) => String(p).trim()).filter(Boolean)
          : [],
        tiebreakerQuestion: String(parsed.tiebreakerQuestion || '').trim(),
        createdAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        decisionTitle?: string;
        decisionContext?: string;
        options?: string[];
        currentSummary?: string;
        roleMode?: 'advisor' | 'skeptic' | 'quick';
        useGoogleSearch?: boolean;
        history?: Array<{ role?: string; text?: string }>;
        message?: string;
      };

      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) {
        res.status(400).json({ error: 'Введіть повідомлення для ШІ-консультанта.' });
        return;
      }

      const roleMode =
        body.roleMode === 'skeptic' || body.roleMode === 'quick'
          ? body.roleMode
          : 'advisor';
      const useGoogleSearch = Boolean(body.useGoogleSearch);

      // Use gemini-4-hydrogen for general reasoning and all Google Search grounding;
      // use gemini-3.1-flash-lite for fast concise responses when search grounding is off.
      const chatModel =
        useGoogleSearch || roleMode !== 'quick'
          ? 'gemini-4-hydrogen'
          : 'gemini-3.1-flash-lite';

      const roleInstructions: Record<'advisor' | 'skeptic' | 'quick', string> = {
        advisor:
          'Ти — «Стратег рішень» у додатку The Tiebreaker. Твоя роль — допомагати користувачеві зважено порівнювати варіанти, аналізувати ризики, витрати та довгострокові наслідки. Спирайся на факти й конкретні критерії.',
        skeptic:
          'Ти — «Адвокат диявола» у додатку The Tiebreaker. Твоя роль — ввічливо, але принципово ставити під сумнів припущення користувача, шукати сліпі зони, оптимістичні упередження та приховані витрати.',
        quick:
          'Ти — «Швидкий помічник» у додатку The Tiebreaker. Давай надзвичайно лаконічні, структуровані й практичні відповіді (короткі тези або чекліст до 5–6 пунктів) без зайвих вступів.',
      };

      const decisionTitle =
        typeof body.decisionTitle === 'string' ? body.decisionTitle.trim() : '';
      const decisionContext =
        typeof body.decisionContext === 'string' ? body.decisionContext.trim() : '';
      const optionsList = Array.isArray(body.options)
        ? body.options
            .filter((o): o is string => typeof o === 'string')
            .map((o) => o.trim())
            .filter(Boolean)
        : [];
      const currentSummary =
        typeof body.currentSummary === 'string' ? body.currentSummary.trim() : '';

      const systemInstruction = [
        roleInstructions[roleMode],
        'Відповідай виключно природною, грамотною українською мовою. Пиши структуровано, читабельно, без зайвої води.',
        useGoogleSearch
          ? 'У тебе активовано пошук у Google (Google Search). Використовуй його для перевірки актуальних цін, фактів, статистики, новин і ринкових умов, коли це доречно.'
          : '',
        decisionTitle ? `Активне рішення користувача: "${decisionTitle}".` : '',
        optionsList.length > 0 ? `Варіанти рішення: ${optionsList.join(' | ')}.` : '',
        decisionContext ? `Контекст користувача: ${decisionContext}` : '',
        currentSummary ? `Поточний стан аналізу: ${currentSummary}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const sanitizedHistory = Array.isArray(body.history)
        ? body.history
            .slice(-20)
            .filter(
              (item): item is { role: 'user' | 'model'; text: string } =>
                (item?.role === 'user' || item?.role === 'model') &&
                typeof item?.text === 'string' &&
                item.text.trim().length > 0,
            )
            .map((item) => ({
              role: item.role,
              parts: [{ text: item.text.trim().slice(0, 4000) }],
            }))
        : [];

      const ai = createAiClient();

      const response = await withRetry(async () => {
        const chat = ai.chats.create({
          model: chatModel,
          history: sanitizedHistory,
          config: {
            systemInstruction,
            ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        return chat.sendMessage({ message: message.slice(0, 4000) });
      });

      const reply = (response.text ?? '').trim();
      if (!reply) {
        throw new Error('Отримано порожню відповідь від Gemini.');
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = extractGroundingSources(groundingMetadata, 8);
      const searchQueries = extractSearchQueries(groundingMetadata, 5);

      res.json({
        reply,
        model: chatModel,
        usedSearch: useGoogleSearch,
        sources,
        searchQueries,
      });
    } catch (error: unknown) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/maps-grounding', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        query?: string;
        decisionTitle?: string;
        options?: string[];
        latLng?: { latitude?: number; longitude?: number };
      };

      const query = typeof body.query === 'string' ? body.query.trim() : '';
      if (query.length < 3) {
        res.status(400).json({
          error: 'Введіть запит про місця, райони або заклади (щонайменше 3 символи).',
        });
        return;
      }

      const decisionTitle =
        typeof body.decisionTitle === 'string' ? body.decisionTitle.trim() : '';
      const optionsList = Array.isArray(body.options)
        ? body.options
            .filter((o): o is string => typeof o === 'string')
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 4)
        : [];
      const latLng = sanitizeLatLng(body.latLng);

      const prompt = [
        `Запит користувача щодо локацій і місць: "${query}"`,
        decisionTitle ? `Контекст рішення: "${decisionTitle}".` : '',
        optionsList.length > 0 ? `Варіанти, які порівнюються: ${optionsList.join(' | ')}.` : '',
        'Використай Google Maps, щоб навести конкретні реальні місця, їхні ключові переваги, особливості розташування, інфраструктуру або відгуки відвідувачів, які допоможуть прийняти рішення. Відповідай природною українською мовою, структуровано й лаконічно.',
      ]
        .filter(Boolean)
        .join('\n');

      const ai = createAiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              'Ти — The Tiebreaker, аналітик рішень із доступом до Google Maps. Спирайся виключно на реальні дані Google Maps, не вигадуй неіснуючі адреси чи координати. Відповідай українською мовою.',
            tools: [{ googleMaps: {} }],
            ...(latLng
              ? {
                  toolConfig: {
                    retrievalConfig: {
                      latLng,
                    },
                  },
                }
              : {}),
          },
        }),
      );

      const answer = (response.text ?? '').trim();
      if (!answer) {
        throw new Error('Не вдалося отримати відповідь із даними Google Maps.');
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const places = extractMapsGroundingPlaces(groundingMetadata, 12);
      const webSources = extractGroundingSources(groundingMetadata, 6);

      res.json({
        answer,
        places,
        webSources,
      });
    } catch (error: unknown) {
      const mapped = mapGeminiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.get(
    '/api/sql/decisions',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!isSqlConfigured()) {
        res.status(503).json({ error: 'Сховище рішень тимчасово недоступне.' });
        return;
      }
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Потрібна авторизація.' });
        return;
      }
      try {
        const items = await listUserDecisionsSql(uid);
        res.json({ decisions: items });
      } catch (error: unknown) {
        console.error('GET /api/sql/decisions error:', error);
        res.status(500).json({ error: 'Не вдалося завантажити збережені рішення.' });
      }
    },
  );

  app.put(
    '/api/sql/decisions/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!isSqlConfigured()) {
        res.status(503).json({ error: 'Сховище рішень тимчасово недоступне.' });
        return;
      }
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Потрібна авторизація.' });
        return;
      }

      const body = req.body as Partial<DecisionRecord> | undefined;
      const decisionId = String(req.params.id || body?.id || '').trim();
      if (!decisionId || !body || typeof body.title !== 'string' || !body.title.trim()) {
        res.status(400).json({ error: 'Некоректні дані рішення для збереження.' });
        return;
      }

      const record: DecisionRecord = {
        ...(body as DecisionRecord),
        id: decisionId,
      };

      try {
        await upsertDecisionSql(
          {
            uid,
            email: req.user?.email ?? null,
            displayName: typeof req.user?.name === 'string' ? req.user.name : null,
          },
          record,
        );
        res.json({ ok: true, id: decisionId });
      } catch (error: unknown) {
        console.error('PUT /api/sql/decisions/:id error:', error);
        res.status(500).json({ error: 'Не вдалося зберегти рішення.' });
      }
    },
  );

  app.delete(
    '/api/sql/decisions/:id',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      if (!isSqlConfigured()) {
        res.status(503).json({ error: 'Сховище рішень тимчасово недоступне.' });
        return;
      }
      const uid = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'Потрібна авторизація.' });
        return;
      }

      const decisionId = String(req.params.id || '').trim();
      if (!decisionId) {
        res.status(400).json({ error: 'Не вказано ідентифікатор рішення.' });
        return;
      }

      try {
        await deleteDecisionSql(uid, decisionId);
        res.json({ ok: true });
      } catch (error: unknown) {
        console.error('DELETE /api/sql/decisions/:id error:', error);
        res.status(500).json({ error: 'Не вдалося видалити рішення.' });
      }
    },
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const httpServer = http.createServer(app);
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      if (parsedUrl.pathname !== '/api/live-voice') {
        return;
      }
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  liveWss.on('connection', (clientWs: WebSocket) => {
    type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;
    let sessionPromise: Promise<LiveSession> | null = null;
    let activeSession: LiveSession | null = null;
    let isClosing = false;

    const sendClientJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeLiveSession = () => {
      if (isClosing) return;
      isClosing = true;
      if (activeSession) {
        try {
          activeSession.close();
        } catch {
          // Ignore close error on already closed upstream session
        }
        activeSession = null;
      } else if (sessionPromise) {
        void sessionPromise
          .then((session) => {
            try {
              session.close();
            } catch {
              // Ignore
            }
          })
          .catch(() => {
            // Ignore
          });
      }
      sessionPromise = null;
    };

    clientWs.on('message', (rawData) => {
      let msg: {
        type?: string;
        data?: string;
        text?: string;
        decisionTitle?: string;
        decisionContext?: string;
        options?: string[];
        currentSummary?: string;
        roleMode?: 'advisor' | 'skeptic';
        voiceName?: string;
      };

      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        sendClientJson({ type: 'error', message: 'Некоректний формат повідомлення голосової сесії.' });
        return;
      }

      if (msg.type === 'start') {
        if (sessionPromise) return;

        const decisionTitle =
          typeof msg.decisionTitle === 'string' ? msg.decisionTitle.trim() : '';
        const decisionContext =
          typeof msg.decisionContext === 'string' ? msg.decisionContext.trim() : '';
        const optionsList = Array.isArray(msg.options)
          ? msg.options
              .filter((o): o is string => typeof o === 'string')
              .map((o) => o.trim())
              .filter(Boolean)
          : [];
        const currentSummary =
          typeof msg.currentSummary === 'string' ? msg.currentSummary.trim() : '';
        const roleMode = msg.roleMode === 'skeptic' ? 'skeptic' : 'advisor';
        const voiceName =
          typeof msg.voiceName === 'string' && ALLOWED_LIVE_VOICES.has(msg.voiceName)
            ? msg.voiceName
            : 'Zephyr';

        const rolePrompt =
          roleMode === 'skeptic'
            ? 'Ти — голосовий «Адвокат диявола» у додатку The Tiebreaker. Став точні критичні запитання, підсвічуй приховані ризики та слабкі припущення, але залишайся конструктивним і доброзичливим.'
            : 'Ти — голосовий «Стратег рішень» у додатку The Tiebreaker. Допомагай користувачеві зважено обговорити варіанти вголос, прояснити пріоритети та дійти впевненого рішення.';

        const systemInstruction = [
          rolePrompt,
          'Спілкуйся виключно природною розмовною українською мовою. Відповідай лаконічно (2–4 речення за репліку), жваво і по суті, як у реальному діалозі з консультантом. Не читай довгі списки — став одне влучне уточнювальне питання в кінці, коли це доречно.',
          decisionTitle ? `Активне рішення: "${decisionTitle}".` : '',
          optionsList.length > 0 ? `Варіанти: ${optionsList.join(' | ')}.` : '',
          decisionContext ? `Контекст користувача: ${decisionContext}` : '',
          currentSummary ? `Поточний стан аналізу: ${currentSummary}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        let ai: GoogleGenAI;
        try {
          ai = createAiClient();
        } catch (error: unknown) {
          const mapped = mapGeminiError(error);
          sendClientJson({ type: 'error', message: mapped.message });
          clientWs.close();
          return;
        }

        sessionPromise = ai.live
          .connect({
            model: LIVE_MODEL_NAME,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                sendClientJson({
                  type: 'ready',
                  model: LIVE_MODEL_NAME,
                  voiceName,
                });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendClientJson({
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  });
                }
                if (content?.outputTranscription?.text) {
                  sendClientJson({
                    type: 'outputTranscript',
                    text: content.outputTranscription.text,
                  });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendClientJson({
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }
                if (content?.interrupted) {
                  sendClientJson({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  sendClientJson({ type: 'turnComplete' });
                }
              },
              onerror: (err: unknown) => {
                const mapped = mapGeminiError(err);
                sendClientJson({ type: 'error', message: mapped.message });
              },
              onclose: () => {
                if (!isClosing) {
                  sendClientJson({ type: 'closed' });
                }
              },
            },
          })
          .then((session) => {
            if (isClosing) {
              try {
                session.close();
              } catch {
                // Ignore
              }
              return session;
            }
            activeSession = session;
            return session;
          });

        sessionPromise.catch((err: unknown) => {
          const mapped = mapGeminiError(err);
          sendClientJson({ type: 'error', message: mapped.message });
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.close();
          }
        });
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && sessionPromise) {
        const audioData = msg.data;
        void sessionPromise
          .then((session) => {
            if (isClosing) return;
            session.sendRealtimeInput({
              audio: {
                data: audioData,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          })
          .catch(() => {
            // Connection error is already reported to client
          });
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string' && sessionPromise) {
        const promptText = msg.text.trim().slice(0, 1000);
        if (!promptText) return;
        void sessionPromise
          .then((session) => {
            if (isClosing) return;
            session.sendRealtimeInput({ text: promptText });
          })
          .catch(() => {
            // Connection error is already reported to client
          });
        return;
      }

      if (msg.type === 'stop') {
        closeLiveSession();
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.close();
        }
      }
    });

    clientWs.on('close', () => {
      closeLiveSession();
    });

    clientWs.on('error', () => {
      closeLiveSession();
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`The Tiebreaker server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
