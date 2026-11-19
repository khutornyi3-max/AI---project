import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Plus, RotateCcw } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { SEED_DECISIONS } from './data/seedDecisions';
import {
  analyzeDecisionWithAI,
  challengeDecisionWithAI,
  deleteDecisionFromSql,
  fetchSqlDecisions,
  saveDecisionToSql,
  sendDecisionChatMessage,
} from './services/decisionApi';
import {
  auth,
  deleteDecisionFromCloud,
  saveDecisionToCloud,
  subscribeUserDecisions,
  syncUserPrivateProfile,
} from './firebase';
import type {
  AnalyzeDecisionRequest,
  ChallengeMode,
  ChatMessage,
  ChatRoleMode,
  DecisionRecord,
  FrameworkType,
  PinnedDecisionPlace,
  SwotQuadrantKey,
} from './types/decision';
import {
  computeOverallLeaning,
  formatDecisionMarkdown,
} from './utils/decisionMath';
import { exportDecisionToPdf } from './utils/pdfReport';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DecisionComposer } from './components/DecisionComposer';
import { ProsConsView } from './components/ProsConsView';
import { ComparisonTableView } from './components/ComparisonTableView';
import { SwotView } from './components/SwotView';
import { DecisionChatPanel } from './components/DecisionChatPanel';
import { LiveVoicePanel } from './components/LiveVoicePanel';
import { DecisionMapsPanel } from './components/DecisionMapsPanel';
import { Decision3DStudio } from './components/Decision3DStudio';
import { VerdictPanel } from './components/VerdictPanel';
import { AuthModal } from './components/AuthModal';

const STORAGE_KEY = 'the_tiebreaker_decisions_uk_v2';
const LEGACY_STORAGE_KEY = 'the_tiebreaker_decisions_v1';

const FRAMEWORK_TABS: Array<{ id: FrameworkType; label: string }> = [
  { id: 'pros-cons', label: 'Плюси і мінуси' },
  { id: 'comparison', label: 'Порівняльна таблиця' },
  { id: 'swot', label: 'SWOT-аналіз' },
  { id: 'chat', label: 'ШІ-чат і пошук' },
  { id: 'voice', label: 'Голосовий діалог' },
  { id: 'maps', label: 'Карта і місця' },
];

function normalizeDecisions(list: DecisionRecord[]): DecisionRecord[] {
  return list.map((d) => ({
    ...d,
    options: Array.isArray(d.options)
      ? d.options.map((o) => ({
          ...o,
          keyConsiderations: Array.isArray(o.keyConsiderations)
            ? o.keyConsiderations
            : [],
        }))
      : [],
  }));
}

function loadInitialDecisions(): DecisionRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DecisionRecord[];
      if (Array.isArray(parsed)) {
        return normalizeDecisions(parsed);
      }
    }

    // Preserve any user-created non-seed decisions from the earlier storage key
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw) as DecisionRecord[];
      if (Array.isArray(legacyParsed)) {
        const userCreated = normalizeDecisions(
          legacyParsed.filter((d) => !d.isSeed),
        );
        return [...userCreated, ...SEED_DECISIONS];
      }
    }
  } catch {
    // Fall back to deterministic Ukrainian seeds if storage is unavailable
  }
  return SEED_DECISIONS;
}

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatOptionsCount(count: number): string {
  if (count === 1) return '1 варіант';
  if (count >= 2 && count <= 4) return `${count} варіанти`;
  return `${count} варіантів`;
}

export default function App() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>(loadInitialDecisions);
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(
    () => loadInitialDecisions()[0]?.id ?? null,
  );
  const [isComposing, setIsComposing] = useState<boolean>(
    () => loadInitialDecisions().length === 0,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [isChallenging, setIsChallenging] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [cloudDecisionsCount, setCloudDecisionsCount] = useState(0);

  const [chatHistoryByDecision, setChatHistoryByDecision] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [studio3DOpen, setStudio3DOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const saveTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified) {
      setCloudDecisionsCount(0);
      return;
    }

    void syncUserPrivateProfile(authUser).catch((err) => {
      console.error('Profile sync failed:', err);
    });

    // Load relational Cloud SQL decisions silently in the background when authenticated
    void authUser
      .getIdToken()
      .then((token) => fetchSqlDecisions(token))
      .then((sqlRecords) => {
        if (sqlRecords.length > 0) {
          setDecisions((prev) => {
            const byId = new Map<string, DecisionRecord>();
            for (const item of prev) byId.set(item.id, item);
            for (const item of sqlRecords) {
              const existing = byId.get(item.id);
              if (!existing || item.updatedAt >= existing.updatedAt) {
                byId.set(item.id, item);
              }
            }
            return Array.from(byId.values()).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            );
          });
        }
      })
      .catch(() => {
        // Keep workspace resilient if SQL store has no rows yet
      });

    const unsubscribe = subscribeUserDecisions(
      authUser.uid,
      (cloudRecords) => {
        setCloudDecisionsCount(cloudRecords.length);
        if (cloudRecords.length > 0) {
          setDecisions(cloudRecords);
          setActiveDecisionId((prev) =>
            prev && cloudRecords.some((d) => d.id === prev)
              ? prev
              : cloudRecords[0].id,
          );
        }
      },
      (err) => {
        console.error('Cloud decisions subscription error:', err);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [authReady, authUser]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch {
      // Ignore storage quota errors
    }
  }, [decisions]);

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  function scheduleCloudSave(record: DecisionRecord) {
    if (!authReady || !authUser || !authUser.emailVerified || record.isSeed) {
      return;
    }
    const existingTimer = saveTimersRef.current.get(record.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const timerId = window.setTimeout(() => {
      saveTimersRef.current.delete(record.id);
      void saveDecisionToCloud(record, authUser.uid).catch((err) => {
        console.error('Failed to save decision to Firestore:', err);
      });
      void authUser
        .getIdToken()
        .then((token) => saveDecisionToSql(record, token))
        .catch(() => {
          // Non-blocking background sync
        });
    }, 350);
    saveTimersRef.current.set(record.id, timerId);
  }

  const activeDecision = useMemo(
    () => decisions.find((d) => d.id === activeDecisionId) ?? null,
    [decisions, activeDecisionId],
  );

  function updateActiveDecision(
    updater: (current: DecisionRecord) => DecisionRecord,
  ) {
    if (!activeDecisionId) return;
    setDecisions((prev) =>
      prev.map((d) => {
        if (d.id !== activeDecisionId) return d;
        const updated: DecisionRecord = {
          ...updater(d),
          isSeed: authUser ? false : d.isSeed,
          updatedAt: new Date().toISOString(),
        };
        scheduleCloudSave(updated);
        return updated;
      }),
    );
  }

  async function handleAnalyzeNewDecision(payload: AnalyzeDecisionRequest) {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const created = await analyzeDecisionWithAI(payload);
      setDecisions((prev) => [created, ...prev]);
      setActiveDecisionId(created.id);
      setIsComposing(false);
      setChallengeError(null);
      setChatError(null);
      scheduleCloudSave(created);
      window.scrollTo({ top: 0 });
    } catch (error: unknown) {
      setAnalyzeError(
        error instanceof Error
          ? error.message
          : 'Зараз не вдалося проаналізувати це рішення.',
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleDeleteDecision(id: string) {
    if (authReady && authUser && authUser.emailVerified) {
      const target = decisions.find((d) => d.id === id);
      if (target && !target.isSeed) {
        void deleteDecisionFromCloud(id).catch((err) => {
          console.error('Failed to delete decision from Firestore:', err);
        });
        void authUser
          .getIdToken()
          .then((token) => deleteDecisionFromSql(id, token))
          .catch(() => {
            // Non-blocking background delete
          });
      }
    }
    setDecisions((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (activeDecisionId === id) {
        setActiveDecisionId(next[0]?.id ?? null);
        if (next.length === 0) {
          setIsComposing(false);
        }
      }
      return next;
    });
  }

  function handleRestoreExamples() {
    setDecisions(SEED_DECISIONS);
    setActiveDecisionId(SEED_DECISIONS[0].id);
    setIsComposing(false);
  }

  async function handleCopyMarkdown() {
    if (!activeDecision) return;
    const md = formatDecisionMarkdown(activeDecision);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = md;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleExportPdf() {
    if (!activeDecision || isExportingPdf) return;
    setIsExportingPdf(true);
    setPdfExportError(null);
    try {
      await exportDecisionToPdf(activeDecision);
      setPdfExported(true);
      window.setTimeout(() => setPdfExported(false), 2500);
    } catch (error: unknown) {
      setPdfExportError(
        error instanceof Error
          ? `Не вдалося сформувати PDF-звіт: ${error.message}`
          : 'Не вдалося сформувати PDF-звіт. Спробуйте ще раз.',
      );
    } finally {
      setIsExportingPdf(false);
    }
  }

  function handleSwitchFramework(framework: FrameworkType) {
    updateActiveDecision((d) => ({ ...d, activeFramework: framework }));
  }

  function handleUpdateProConWeight(
    optionId: string,
    itemId: string,
    weight: number,
  ) {
    updateActiveDecision((d) => ({
      ...d,
      prosCons: d.prosCons.map((entry) =>
        entry.optionId === optionId
          ? {
              ...entry,
              items: entry.items.map((item) =>
                item.id === itemId ? { ...item, weight } : item,
              ),
            }
          : entry,
      ),
    }));
  }

  function handleAddProConItem(
    optionId: string,
    type: 'pro' | 'con',
    text: string,
    rationale: string,
    weight: number,
  ) {
    const newItem = {
      id: makeLocalId(type),
      text,
      rationale,
      weight,
      type,
      source: 'user' as const,
    };

    updateActiveDecision((d) => {
      const exists = d.prosCons.some((entry) => entry.optionId === optionId);
      return {
        ...d,
        prosCons: exists
          ? d.prosCons.map((entry) =>
              entry.optionId === optionId
                ? { ...entry, items: [newItem, ...entry.items] }
                : entry,
            )
          : [...d.prosCons, { optionId, items: [newItem] }],
      };
    });
  }

  function handleRemoveProConItem(optionId: string, itemId: string) {
    updateActiveDecision((d) => ({
      ...d,
      prosCons: d.prosCons.map((entry) =>
        entry.optionId === optionId
          ? { ...entry, items: entry.items.filter((i) => i.id !== itemId) }
          : entry,
      ),
    }));
  }

  function handleUpdateCriterionWeight(criterionId: string, weight: number) {
    updateActiveDecision((d) => ({
      ...d,
      comparisonCriteria: d.comparisonCriteria.map((c) =>
        c.id === criterionId ? { ...c, weight } : c,
      ),
    }));
  }

  function handleUpdateCriterionScore(
    criterionId: string,
    optionId: string,
    score: number,
  ) {
    updateActiveDecision((d) => ({
      ...d,
      comparisonCriteria: d.comparisonCriteria.map((c) =>
        c.id === criterionId
          ? {
              ...c,
              scores: {
                ...c.scores,
                [optionId]: {
                  score,
                  note: c.scores[optionId]?.note ?? 'Змінено вами',
                },
              },
            }
          : c,
      ),
    }));
  }

  function handleAddCriterion(name: string, description: string, weight: number) {
    updateActiveDecision((d) => {
      const scores: Record<string, { score: number; note: string }> = {};
      for (const opt of d.options) {
        scores[opt.id] = { score: 5, note: 'Вкажіть оцінку' };
      }
      return {
        ...d,
        comparisonCriteria: [
          ...d.comparisonCriteria,
          {
            id: makeLocalId('crit'),
            name,
            description,
            weight,
            scores,
          },
        ],
      };
    });
  }

  function handleRemoveCriterion(criterionId: string) {
    updateActiveDecision((d) => ({
      ...d,
      comparisonCriteria: d.comparisonCriteria.filter(
        (c) => c.id !== criterionId,
      ),
    }));
  }

  function handleAddSwotItem(
    optionId: string,
    quadrant: SwotQuadrantKey,
    text: string,
    critical: boolean,
  ) {
    const newItem = {
      id: makeLocalId('swot'),
      text,
      critical,
      source: 'user' as const,
    };

    updateActiveDecision((d) => {
      const exists = d.swot.some((s) => s.optionId === optionId);
      if (!exists) {
        const blank = {
          optionId,
          strengths: [],
          weaknesses: [],
          opportunities: [],
          threats: [],
          [quadrant]: [newItem],
        };
        return { ...d, swot: [...d.swot, blank] };
      }
      return {
        ...d,
        swot: d.swot.map((s) =>
          s.optionId === optionId
            ? { ...s, [quadrant]: [newItem, ...s[quadrant]] }
            : s,
        ),
      };
    });
  }

  function handleToggleSwotCritical(
    optionId: string,
    quadrant: SwotQuadrantKey,
    itemId: string,
  ) {
    updateActiveDecision((d) => ({
      ...d,
      swot: d.swot.map((s) =>
        s.optionId === optionId
          ? {
              ...s,
              [quadrant]: s[quadrant].map((item) =>
                item.id === itemId
                  ? { ...item, critical: !item.critical }
                  : item,
              ),
            }
          : s,
      ),
    }));
  }

  function handleRemoveSwotItem(
    optionId: string,
    quadrant: SwotQuadrantKey,
    itemId: string,
  ) {
    updateActiveDecision((d) => ({
      ...d,
      swot: d.swot.map((s) =>
        s.optionId === optionId
          ? {
              ...s,
              [quadrant]: s[quadrant].filter((item) => item.id !== itemId),
            }
          : s,
      ),
    }));
  }

  async function handleRunChallenge(
    mode: ChallengeMode,
    customQuestion?: string,
    useGoogleSearch?: boolean,
  ) {
    if (!activeDecision) return;
    setIsChallenging(true);
    setChallengeError(null);
    try {
      const leaning = computeOverallLeaning(activeDecision);
      const insight = await challengeDecisionWithAI({
        decisionTitle: activeDecision.title,
        options: activeDecision.options.map((o) => o.name),
        context: activeDecision.context,
        mode,
        customQuestion,
        useGoogleSearch,
        currentSummary: `${leaning.basisLabel}. ${activeDecision.aiTakeaway}`,
      });
      updateActiveDecision((d) => ({
        ...d,
        challenges: [insight, ...d.challenges],
      }));
    } catch (error: unknown) {
      setChallengeError(
        error instanceof Error
          ? error.message
          : 'Зараз не вдалося виконати ШІ-перевірку.',
      );
    } finally {
      setIsChallenging(false);
    }
  }

  function handleRemoveChallenge(challengeId: string) {
    updateActiveDecision((d) => ({
      ...d,
      challenges: d.challenges.filter((c) => c.id !== challengeId),
    }));
  }

  async function handleSendChatMessage(
    text: string,
    roleMode: ChatRoleMode,
    useGoogleSearch: boolean,
  ) {
    if (!activeDecision) return;
    const decisionId = activeDecision.id;
    const priorMessages = chatHistoryByDecision[decisionId] ?? [];

    const userMsg: ChatMessage = {
      id: makeLocalId('msg'),
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };

    setChatHistoryByDecision((prev) => ({
      ...prev,
      [decisionId]: [...(prev[decisionId] ?? []), userMsg],
    }));
    setIsChatSending(true);
    setChatError(null);

    try {
      const leaning = computeOverallLeaning(activeDecision);
      const response = await sendDecisionChatMessage({
        decisionTitle: activeDecision.title,
        decisionContext: activeDecision.context,
        options: activeDecision.options.map((o) => o.name),
        currentSummary: `${leaning.basisLabel}. ${activeDecision.aiTakeaway}`,
        roleMode,
        useGoogleSearch,
        history: priorMessages.map((m) => ({ role: m.role, text: m.text })),
        message: text,
      });

      const modelMsg: ChatMessage = {
        id: makeLocalId('msg'),
        role: 'model',
        text: response.reply,
        createdAt: new Date().toISOString(),
        roleMode,
        usedSearch: response.usedSearch,
        sources: response.sources,
        searchQueries: response.searchQueries,
      };

      setChatHistoryByDecision((prev) => ({
        ...prev,
        [decisionId]: [...(prev[decisionId] ?? []), modelMsg],
      }));
    } catch (error: unknown) {
      setChatError(
        error instanceof Error
          ? error.message
          : 'Не вдалося отримати відповідь від ШІ-консультанта.',
      );
    } finally {
      setIsChatSending(false);
    }
  }

  function handleClearChat() {
    if (!activeDecisionId) return;
    setChatHistoryByDecision((prev) => ({
      ...prev,
      [activeDecisionId]: [],
    }));
    setChatError(null);
  }

  function handleAddPinnedPlace(
    place: Omit<PinnedDecisionPlace, 'id' | 'createdAt'>,
  ) {
    const newPlace: PinnedDecisionPlace = {
      ...place,
      id: makeLocalId('place'),
      createdAt: new Date().toISOString(),
    };
    updateActiveDecision((d) => ({
      ...d,
      pinnedPlaces: [newPlace, ...(d.pinnedPlaces ?? [])].slice(0, 20),
    }));
  }

  function handleRemovePinnedPlace(placeId: string) {
    updateActiveDecision((d) => ({
      ...d,
      pinnedPlaces: (d.pinnedPlaces ?? []).filter((p) => p.id !== placeId),
    }));
  }

  function handleUpdatePinnedPlaceOption(
    placeId: string,
    optionId: string | null,
  ) {
    updateActiveDecision((d) => ({
      ...d,
      pinnedPlaces: (d.pinnedPlaces ?? []).map((p) =>
        p.id === placeId ? { ...p, optionId } : p,
      ),
    }));
  }

  const breadcrumbLabel = isComposing
    ? 'Нове рішення'
    : activeDecision?.title ?? 'Порожній робочий простір';

  return (
    <div className="min-h-screen flex bg-[#F6F7F9] text-slate-900">
      <Sidebar
        decisions={decisions}
        activeDecisionId={activeDecisionId}
        isComposing={isComposing}
        mobileOpen={mobileMenuOpen}
        user={authUser}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectDecision={(id) => {
          setActiveDecisionId(id);
          setIsComposing(false);
          setChallengeError(null);
          setChatError(null);
          setPdfExportError(null);
          window.scrollTo({ top: 0 });
        }}
        onStartNew={() => {
          setIsComposing(true);
          setAnalyzeError(null);
          setPdfExportError(null);
          window.scrollTo({ top: 0 });
        }}
        onDeleteDecision={handleDeleteDecision}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          breadcrumbLabel={breadcrumbLabel}
          isComposing={isComposing}
          hasDecisions={decisions.length > 0}
          hasActiveDecision={Boolean(activeDecision)}
          copied={copied}
          isExportingPdf={isExportingPdf}
          pdfExported={pdfExported}
          user={authUser}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onCopyMarkdown={handleCopyMarkdown}
          onExportPdf={handleExportPdf}
          onCancelCompose={() => {
            if (decisions[0]) {
              setActiveDecisionId(activeDecisionId ?? decisions[0].id);
              setIsComposing(false);
            }
          }}
          onOpenAuth={() => setAuthModalOpen(true)}
        />

        {quotaExceeded && (
          <div
            role="alert"
            className="sticky top-16 z-50 w-full bg-amber-100 border-b border-amber-300 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-4"
          >
            <span>
              <strong>Google Maps Demo Quota Reached:</strong> The free AI Studio
              demo allowance for this key has been used up. Map features may be
              limited or unavailable until you switch to your own Google Cloud
              API key.{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Learn how to switch to your own API key
              </a>
            </span>
          </div>
        )}

        <main className="flex-1">
          {isComposing ? (
            <DecisionComposer
              isSubmitting={isAnalyzing}
              apiError={analyzeError}
              onSubmit={handleAnalyzeNewDecision}
            />
          ) : activeDecision ? (
            <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
              {/* Decision Title & Context */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono tabular-nums">
                    {formatOptionsCount(activeDecision.options.length)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activeDecision.chosenOptionId
                      ? 'Рішення зафіксовано'
                      : 'Відкритий аналіз'}
                  </span>
                  {activeDecision.isSeed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Приклад</span>
                    </>
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 text-balance">
                  {activeDecision.title}
                </h1>

                {activeDecision.context && (
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">
                    {activeDecision.context}
                  </p>
                )}
              </div>

              {/* Framework Switcher Tabs + 3D Studio Launch */}
              <div className="border-b border-slate-200 flex items-center justify-between gap-4">
                <div
                  role="tablist"
                  aria-label="Формати аналізу рішення"
                  className="flex items-center gap-5 overflow-x-auto"
                >
                  {FRAMEWORK_TABS.map((tab) => {
                    const isActive = activeDecision.activeFramework === tab.id;
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        id={`tab-${tab.id}`}
                        aria-selected={isActive}
                        aria-controls={`panel-${tab.id}`}
                        type="button"
                        onClick={() => handleSwitchFramework(tab.id)}
                        className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          isActive
                            ? 'border-blue-700 text-blue-700'
                            : 'border-transparent text-slate-600 hover:text-slate-950'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setStudio3DOpen(true)}
                  className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Box className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  3D-баланс
                </button>
              </div>

              {/* Active Analytical Framework Panel */}
              <div
                role="tabpanel"
                id={`panel-${activeDecision.activeFramework}`}
                aria-labelledby={`tab-${activeDecision.activeFramework}`}
              >
                {activeDecision.activeFramework === 'pros-cons' && (
                  <ProsConsView
                    key={`${activeDecision.id}-pc`}
                    options={activeDecision.options}
                    prosCons={activeDecision.prosCons}
                    onUpdateWeight={handleUpdateProConWeight}
                    onAddItem={handleAddProConItem}
                    onRemoveItem={handleRemoveProConItem}
                  />
                )}

                {activeDecision.activeFramework === 'comparison' && (
                  <ComparisonTableView
                    key={`${activeDecision.id}-comp`}
                    options={activeDecision.options}
                    prosCons={activeDecision.prosCons}
                    criteria={activeDecision.comparisonCriteria}
                    onUpdateCriterionWeight={handleUpdateCriterionWeight}
                    onUpdateScore={handleUpdateCriterionScore}
                    onAddCriterion={handleAddCriterion}
                    onRemoveCriterion={handleRemoveCriterion}
                  />
                )}

                {activeDecision.activeFramework === 'swot' && (
                  <SwotView
                    key={`${activeDecision.id}-swot`}
                    options={activeDecision.options}
                    swotList={activeDecision.swot}
                    onAddSwotItem={handleAddSwotItem}
                    onToggleCritical={handleToggleSwotCritical}
                    onRemoveSwotItem={handleRemoveSwotItem}
                  />
                )}

                {activeDecision.activeFramework === 'chat' && (
                  <DecisionChatPanel
                    key={`${activeDecision.id}-chat`}
                    decision={activeDecision}
                    messages={chatHistoryByDecision[activeDecision.id] ?? []}
                    isSending={isChatSending}
                    error={chatError}
                    onSendMessage={handleSendChatMessage}
                    onClearChat={handleClearChat}
                  />
                )}

                {activeDecision.activeFramework === 'voice' && (
                  <LiveVoicePanel
                    key={`${activeDecision.id}-voice`}
                    decision={activeDecision}
                  />
                )}

                {activeDecision.activeFramework === 'maps' && (
                  <DecisionMapsPanel
                    key={`${activeDecision.id}-maps`}
                    decision={activeDecision}
                    onAddPinnedPlace={handleAddPinnedPlace}
                    onRemovePinnedPlace={handleRemovePinnedPlace}
                    onUpdatePinnedPlaceOption={handleUpdatePinnedPlaceOption}
                  />
                )}
              </div>

              {/* Verdict, Final Choice & AI Stress-Test */}
              <VerdictPanel
                decision={activeDecision}
                isChallenging={isChallenging}
                challengeError={challengeError}
                isExportingPdf={isExportingPdf}
                pdfExported={pdfExported}
                pdfExportError={pdfExportError}
                onExportPdf={handleExportPdf}
                onSelectChosenOption={(optionId) =>
                  updateActiveDecision((d) => ({
                    ...d,
                    chosenOptionId: optionId,
                  }))
                }
                onRunChallenge={handleRunChallenge}
                onRemoveChallenge={handleRemoveChallenge}
              />
            </div>
          ) : (
            <div className="max-w-lg mx-auto py-20 px-6 text-center space-y-4">
              <h1 className="font-display text-2xl font-bold text-slate-950">
                Ваш журнал рішень порожній
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Створіть нове рішення, щоб отримати ШІ-аналіз плюсів і мінусів, порівняльну таблицю варіантів та SWOT-матрицю — або завантажте готові приклади.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsComposing(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Plus className="w-4 h-4" />
                  Нове рішення
                </button>
                <button
                  type="button"
                  onClick={handleRestoreExamples}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <RotateCcw className="w-4 h-4" />
                  Завантажити приклади
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <AuthModal
        open={authModalOpen}
        user={authUser}
        cloudSyncCount={cloudDecisionsCount}
        onClose={() => setAuthModalOpen(false)}
      />

      {activeDecision && (
        <Decision3DStudio
          open={studio3DOpen}
          decision={activeDecision}
          onClose={() => setStudio3DOpen(false)}
        />
      )}
    </div>
  );
}
