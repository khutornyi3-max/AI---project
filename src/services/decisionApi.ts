import type {
  AnalyzeDecisionRequest,
  ChallengeDecisionRequest,
  ChallengeInsight,
  DecisionChatRequest,
  DecisionChatResponse,
  DecisionRecord,
  MapsGroundingRequest,
  MapsGroundingResponse,
} from '../types/decision';

interface ApiErrorPayload {
  error?: string;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as ApiErrorPayload;
    if (data?.error) return data.error;
  } catch {
    // Fall back to HTTP status text
  }
  return `Помилка запиту (статус ${response.status})`;
}

export async function analyzeDecisionWithAI(
  payload: AnalyzeDecisionRequest,
): Promise<DecisionRecord> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as DecisionRecord;
}

export async function challengeDecisionWithAI(
  payload: ChallengeDecisionRequest,
): Promise<ChallengeInsight> {
  const response = await fetch('/api/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as ChallengeInsight;
}

export async function sendDecisionChatMessage(
  payload: DecisionChatRequest,
): Promise<DecisionChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as DecisionChatResponse;
}

export async function queryMapsGrounding(
  payload: MapsGroundingRequest,
): Promise<MapsGroundingResponse> {
  const response = await fetch('/api/maps-grounding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as MapsGroundingResponse;
}

export async function fetchSqlDecisions(
  idToken: string,
): Promise<DecisionRecord[]> {
  const response = await fetch('/api/sql/decisions', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json()) as { decisions?: DecisionRecord[] };
  return Array.isArray(data.decisions) ? data.decisions : [];
}

export async function saveDecisionToSql(
  decision: DecisionRecord,
  idToken: string,
): Promise<void> {
  const response = await fetch(
    `/api/sql/decisions/${encodeURIComponent(decision.id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(decision),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function deleteDecisionFromSql(
  decisionId: string,
  idToken: string,
): Promise<void> {
  const response = await fetch(
    `/api/sql/decisions/${encodeURIComponent(decisionId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}
