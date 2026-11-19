import type { MapsGroundingPlace, MapsReviewSnippet } from '../types/decision';

interface RawReviewSnippet {
  uri?: unknown;
  title?: unknown;
  text?: unknown;
  snippet?: unknown;
}

interface RawMapsChunk {
  uri?: unknown;
  title?: unknown;
  placeId?: unknown;
  placeAnswerSources?: {
    reviewSnippets?: RawReviewSnippet[];
  };
}

interface RawMapsGroundingMetadata {
  groundingChunks?: Array<{
    maps?: RawMapsChunk;
  }>;
}

export interface ValidatedLatLng {
  latitude: number;
  longitude: number;
}

/**
 * Validates optional user coordinates for Google Maps Grounding retrievalConfig.
 */
export function sanitizeLatLng(input: unknown): ValidatedLatLng | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as { latitude?: unknown; longitude?: unknown };
  const lat = Number(candidate.latitude);
  const lng = Number(candidate.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Extracts deduplicated Google Maps places (title, uri, placeId, and reviewSnippets)
 * from Gemini groundingMetadata returned by the googleMaps tool.
 */
export function extractMapsGroundingPlaces(
  metadata: RawMapsGroundingMetadata | null | undefined,
  maxPlaces = 12,
): MapsGroundingPlace[] {
  const chunks = Array.isArray(metadata?.groundingChunks)
    ? metadata.groundingChunks
    : [];

  const seenUris = new Set<string>();
  const places: MapsGroundingPlace[] = [];

  for (const chunk of chunks) {
    const maps = chunk?.maps;
    if (!maps || typeof maps.uri !== 'string') continue;

    const uri = maps.uri.trim();
    if (!uri || !/^https?:\/\//i.test(uri) || seenUris.has(uri)) continue;
    seenUris.add(uri);

    const title =
      typeof maps.title === 'string' && maps.title.trim().length > 0
        ? maps.title.trim()
        : 'Місце в Google Maps';

    const placeId =
      typeof maps.placeId === 'string' && maps.placeId.trim().length > 0
        ? maps.placeId.trim()
        : undefined;

    const rawSnippets = Array.isArray(maps.placeAnswerSources?.reviewSnippets)
      ? maps.placeAnswerSources.reviewSnippets
      : [];

    const seenSnippetUris = new Set<string>();
    const reviewSnippets: MapsReviewSnippet[] = [];

    for (const rawSnippet of rawSnippets) {
      const snippetUri =
        typeof rawSnippet?.uri === 'string' ? rawSnippet.uri.trim() : '';
      if (!snippetUri || !/^https?:\/\//i.test(snippetUri) || seenSnippetUris.has(snippetUri)) {
        continue;
      }
      seenSnippetUris.add(snippetUri);

      const snippetTitle =
        typeof rawSnippet?.title === 'string' && rawSnippet.title.trim().length > 0
          ? rawSnippet.title.trim()
          : undefined;
      const snippetText =
        typeof rawSnippet?.text === 'string' && rawSnippet.text.trim().length > 0
          ? rawSnippet.text.trim()
          : typeof rawSnippet?.snippet === 'string' && rawSnippet.snippet.trim().length > 0
            ? rawSnippet.snippet.trim()
            : undefined;

      reviewSnippets.push({
        uri: snippetUri,
        title: snippetTitle,
        text: snippetText,
      });
    }

    places.push({
      title,
      uri,
      placeId,
      reviewSnippets,
    });

    if (places.length >= maxPlaces) break;
  }

  return places;
}
