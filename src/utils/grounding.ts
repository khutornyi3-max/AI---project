import type { GroundingSource } from '../types/decision';

interface RawGroundingChunk {
  web?: {
    uri?: unknown;
    title?: unknown;
  };
}

interface RawGroundingMetadata {
  groundingChunks?: RawGroundingChunk[];
  webSearchQueries?: unknown[];
}

/**
 * Extracts and deduplicates web grounding sources from Gemini response metadata.
 */
export function extractGroundingSources(
  metadata: RawGroundingMetadata | null | undefined,
  maxSources = 8,
): GroundingSource[] {
  const chunks = Array.isArray(metadata?.groundingChunks)
    ? metadata.groundingChunks
    : [];
  const seenUris = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const chunk of chunks) {
    const rawUri = chunk?.web?.uri;
    if (typeof rawUri !== 'string') continue;
    const uri = rawUri.trim();
    if (!uri || !/^https?:\/\//i.test(uri) || seenUris.has(uri)) continue;

    seenUris.add(uri);
    const rawTitle = chunk?.web?.title;
    const fallbackHost = uri.replace(/^https?:\/\//i, '').split('/')[0] || uri;
    const title =
      typeof rawTitle === 'string' && rawTitle.trim().length > 0
        ? rawTitle.trim()
        : fallbackHost;

    sources.push({ title, uri });
    if (sources.length >= maxSources) break;
  }

  return sources;
}

/**
 * Extracts sanitized Google Search queries performed by Gemini Search Grounding.
 */
export function extractSearchQueries(
  metadata: RawGroundingMetadata | null | undefined,
  maxQueries = 5,
): string[] {
  if (!Array.isArray(metadata?.webSearchQueries)) return [];
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const item of metadata.webSearchQueries) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(cleaned);
    if (queries.length >= maxQueries) break;
  }

  return queries;
}

export interface ParsedFactCheckResult {
  heading: string;
  points: string[];
  tiebreakerQuestion: string;
}

/**
 * Parses a structured Ukrainian markdown response from a Google Search grounded
 * fact-check call (without responseSchema) into ChallengeInsight fields.
 */
export function parseGroundedFactCheck(
  rawText: string,
  fallbackHeading = 'Перевірка актуальних фактів у Google',
): ParsedFactCheckResult {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let heading = '';
  const points: string[] = [];
  let tiebreakerQuestion = '';

  for (const line of lines) {
    const cleanLine = line.replace(/\*\*/g, '').trim();

    if (/^заголовок\s*:/i.test(cleanLine)) {
      heading = cleanLine.replace(/^заголовок\s*:/i, '').trim();
      continue;
    }

    if (/^питання(\s+на\s+подумати|\s+для\s+вирішення)?\s*:/i.test(cleanLine)) {
      tiebreakerQuestion = cleanLine
        .replace(/^питання(\s+на\s+подумати|\s+для\s+вирішення)?\s*:/i, '')
        .trim();
      continue;
    }

    if (/^#+\s+/.test(line) && !heading) {
      heading = cleanLine.replace(/^#+\s+/, '').trim();
      continue;
    }

    const bulletMatch = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      const point = bulletMatch[1].replace(/\*\*/g, '').trim();
      if (point.length > 0) {
        points.push(point);
      }
      continue;
    }

    if (!heading && points.length === 0 && cleanLine.length <= 120) {
      heading = cleanLine;
    } else if (points.length < 6) {
      points.push(cleanLine);
    }
  }

  if (points.length === 0 && rawText.trim()) {
    points.push(rawText.replace(/\*\*/g, '').trim().slice(0, 600));
  }

  return {
    heading: heading || fallbackHeading,
    points: points.slice(0, 5),
    tiebreakerQuestion:
      tiebreakerQuestion ||
      'Який із перевірених актуальних фактів найбільше змінює вашу оцінку ризиків або витрат?',
  };
}
