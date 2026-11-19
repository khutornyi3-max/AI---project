import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  DecisionRecord,
  LiveTranscriptEntry,
  LiveVoiceName,
  LiveVoiceRole,
} from '../types/decision';
import { computeOverallLeaning } from '../utils/decisionMath';
import {
  appendLiveTranscriptChunk,
  buildLiveWebSocketUrl,
  computeRmsLevel,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
  resampleFloat32,
} from '../utils/liveAudio';

interface LiveVoicePanelProps {
  decision: DecisionRecord;
}

type VoiceSessionStatus = 'idle' | 'connecting' | 'connected';

const VOICE_ROLES: Array<{
  id: LiveVoiceRole;
  label: string;
  description: string;
}> = [
  {
    id: 'advisor',
    label: 'Стратег рішень',
    description: 'Зважений діалог про пріоритети, критерії й наслідки',
  },
  {
    id: 'skeptic',
    label: 'Адвокат диявола',
    description: 'Конструктивна критика припущень і пошук сліпих зон',
  },
];

const VOICE_OPTIONS: Array<{ id: LiveVoiceName; label: string }> = [
  { id: 'Zephyr', label: 'Zephyr · Спокійний' },
  { id: 'Kore', label: 'Kore · Чіткий' },
  { id: 'Fenrir', label: 'Fenrir · Впевнений' },
  { id: 'Puck', label: 'Puck · Жвавий' },
  { id: 'Charon', label: 'Charon · Глибокий' },
];

const BAR_WEIGHTS = [0.42, 0.65, 0.85, 0.96, 1.0, 0.88, 0.94, 1.0, 0.86, 0.72, 0.56, 0.4];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function mapMediaError(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: string }).name)
      : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Доступ до мікрофона відхилено. Дозвольте використання мікрофона в налаштуваннях браузера та спробуйте знову.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Мікрофон не знайдено. Підключіть аудіопристрій і повторіть спробу.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Не вдалося отримати доступ до мікрофона — можливо, його використовує інша програма.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Не вдалося ініціалізувати голосову сесію. Перевірте доступ до мікрофона.';
}

export function LiveVoicePanel({ decision }: LiveVoicePanelProps) {
  const [status, setStatus] = useState<VoiceSessionStatus>('idle');
  const [roleMode, setRoleMode] = useState<LiveVoiceRole>('advisor');
  const [voiceName, setVoiceName] = useState<LiveVoiceName>('Zephyr');
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transcript, setTranscript] = useState<LiveTranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs used inside audio and WebSocket callbacks to prevent stale closures
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);
  const statusRef = useRef<VoiceSessionStatus>('idle');
  const transcriptSeqRef = useRef<number>(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const leaning = useMemo(() => computeOverallLeaning(decision), [decision]);

  const quickPrompts = useMemo(() => {
    const firstOpt = decision.options[0]?.name ?? 'перший варіант';
    const secondOpt = decision.options[1]?.name ?? 'другий варіант';
    return [
      `Порівняй головні ризики між «${firstOpt}» та «${secondOpt}»`,
      'Які приховані витрати я міг пропустити у цьому рішенні?',
      'Постав мені 2 гострі питання, щоб швидко вийти з глухого кута',
    ];
  }, [decision.options]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status !== 'connected') {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (transcript.length > 0) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [transcript]);

  const clearScheduledPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Already stopped
      }
    }
    activeSourcesRef.current.clear();
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsModelSpeaking(false);
    setOutputLevel(0);
  }, []);

  const stopSession = useCallback(
    (preserveError = false) => {
      clearScheduledPlayback();

      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'stop' }));
          }
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {
          // Ignore close error
        }
        wsRef.current = null;
      }

      if (processorRef.current) {
        try {
          processorRef.current.onaudioprocess = null;
          processorRef.current.disconnect();
        } catch {
          // Ignore
        }
        processorRef.current = null;
      }

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {
          // Ignore
        }
        sourceNodeRef.current = null;
      }

      if (muteGainRef.current) {
        try {
          muteGainRef.current.disconnect();
        } catch {
          // Ignore
        }
        muteGainRef.current = null;
      }

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }

      if (inputAudioCtxRef.current) {
        void inputAudioCtxRef.current.close().catch(() => {});
        inputAudioCtxRef.current = null;
      }

      if (outputAudioCtxRef.current) {
        void outputAudioCtxRef.current.close().catch(() => {});
        outputAudioCtxRef.current = null;
      }

      statusRef.current = 'idle';
      setStatus('idle');
      setIsMuted(false);
      isMutedRef.current = false;
      setInputLevel(0);
      setOutputLevel(0);
      setIsModelSpeaking(false);
      if (!preserveError) {
        setError(null);
      }
    },
    [clearScheduledPlayback],
  );

  useEffect(() => {
    return () => {
      stopSession(true);
    };
  }, [stopSession]);

  const playPcmChunk = useCallback((base64Audio: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx || outCtx.state === 'closed') return;
    if (outCtx.state === 'suspended') {
      void outCtx.resume();
    }

    const samples = pcm16Base64ToFloat32(base64Audio);
    if (samples.length === 0) return;

    const buffer = outCtx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = outCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(outCtx.destination);

    const startTime = Math.max(outCtx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    setIsModelSpeaking(true);
    setOutputLevel(computeRmsLevel(samples));

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
        setOutputLevel(0);
      }
    };
  }, []);

  const handleStartSession = async () => {
    if (status !== 'idle') return;
    setError(null);
    setStatus('connecting');
    statusRef.current = 'connecting';

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        throw new Error(
          'Ваш браузер не підтримує захоплення мікрофона для голосового режиму.',
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API недоступний у цьому браузері.');
      }

      const inputAudioCtx = new AudioCtx({ sampleRate: 16000 });
      const outputAudioCtx = new AudioCtx({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputAudioCtx;
      outputAudioCtxRef.current = outputAudioCtx;
      nextStartTimeRef.current = outputAudioCtx.currentTime;

      if (inputAudioCtx.state === 'suspended') {
        await inputAudioCtx.resume();
      }
      if (outputAudioCtx.state === 'suspended') {
        await outputAudioCtx.resume();
      }

      const wsUrl = buildLiveWebSocketUrl(
        window.location.protocol,
        window.location.host,
        '/api/live-voice',
      );
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            decisionTitle: decision.title,
            decisionContext: decision.context,
            options: decision.options.map((o) => o.name),
            currentSummary: `${leaning.basisLabel}. ${decision.aiTakeaway}`,
            roleMode,
            voiceName,
          }),
        );
      };

      ws.onmessage = (event) => {
        let msg: {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          statusRef.current = 'connected';
          setStatus('connected');

          // Attach microphone streaming pipeline once Live API session is ready
          const source = inputAudioCtx.createMediaStreamSource(stream);
          const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
          const zeroGain = inputAudioCtx.createGain();
          zeroGain.gain.value = 0;

          sourceNodeRef.current = source;
          processorRef.current = processor;
          muteGainRef.current = zeroGain;

          source.connect(processor);
          processor.connect(zeroGain);
          zeroGain.connect(inputAudioCtx.destination);

          processor.onaudioprocess = (audioEvent) => {
            if (
              isMutedRef.current ||
              statusRef.current !== 'connected' ||
              !wsRef.current ||
              wsRef.current.readyState !== WebSocket.OPEN
            ) {
              setInputLevel(0);
              return;
            }

            const rawSamples = audioEvent.inputBuffer.getChannelData(0);
            setInputLevel(computeRmsLevel(rawSamples));
            const pcm16k = resampleFloat32(
              rawSamples,
              inputAudioCtx.sampleRate,
              16000,
            );
            const base64 = float32ToPcm16Base64(pcm16k);
            wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
          };
          return;
        }

        if (msg.type === 'audio' && typeof msg.data === 'string') {
          playPcmChunk(msg.data);
          return;
        }

        if (msg.type === 'inputTranscript' && typeof msg.text === 'string') {
          const chunk = msg.text;
          setTranscript((prev) =>
            appendLiveTranscriptChunk(
              prev,
              'user',
              chunk,
              () => `tr-${++transcriptSeqRef.current}`,
              new Date().toISOString(),
            ),
          );
          return;
        }

        if (msg.type === 'outputTranscript' && typeof msg.text === 'string') {
          const chunk = msg.text;
          setTranscript((prev) =>
            appendLiveTranscriptChunk(
              prev,
              'model',
              chunk,
              () => `tr-${++transcriptSeqRef.current}`,
              new Date().toISOString(),
            ),
          );
          return;
        }

        if (msg.type === 'interrupted') {
          clearScheduledPlayback();
          return;
        }

        if (msg.type === 'error') {
          setError(
            msg.message ||
              'Виникла помилка під час голосової розмови з Gemini Live.',
          );
          stopSession(true);
          return;
        }

        if (msg.type === 'closed') {
          stopSession(true);
        }
      };

      ws.onerror = () => {
        setError(
          'Не вдалося встановити WebSocket-з’єднання для голосової розмови. Спробуйте ще раз.',
        );
        stopSession(true);
      };

      ws.onclose = () => {
        if (statusRef.current !== 'idle') {
          stopSession(true);
        }
      };
    } catch (err: unknown) {
      setError(mapMediaError(err));
      stopSession(true);
    }
  };

  const handleSendTopicNudge = (promptText: string) => {
    if (
      status !== 'connected' ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'text', text: promptText }));
    setTranscript((prev) =>
      appendLiveTranscriptChunk(
        prev,
        'user',
        promptText,
        () => `tr-${++transcriptSeqRef.current}`,
        new Date().toISOString(),
      ),
    );
  };

  const activeEnergy =
    status === 'connected'
      ? isModelSpeaking
        ? Math.max(0.25, outputLevel)
        : isMuted
          ? 0
          : Math.max(0.08, inputLevel)
      : 0;

  return (
    <section
      aria-label="Голосовий діалог із ШІ-консультантом"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Голосовий ШІ-консультант
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
              Обговоріть варіанти вголос у реальному часі — консультант знає всі ваші аргументи, критерії та поточний баланс рішення.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs font-mono tabular-nums text-slate-600">
            <span>
              {status === 'connected'
                ? isModelSpeaking
                  ? 'ШІ відповідає'
                  : isMuted
                    ? 'Мікрофон вимкнено'
                    : 'Слухаю вас'
                : status === 'connecting'
                  ? 'Підключення...'
                  : 'Готово до розмови'}
            </span>
            {status === 'connected' && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatDuration(elapsedSeconds)}</span>
              </>
            )}
          </div>
        </div>

        {/* Persona & Voice Selection */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div
            role="group"
            aria-label="Роль голосового консультанта"
            className="flex flex-wrap items-center gap-1.5"
          >
            {VOICE_ROLES.map((role) => {
              const active = roleMode === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  disabled={status !== 'idle'}
                  onClick={() => setRoleMode(role.id)}
                  aria-pressed={active}
                  title={role.description}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {role.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor="live-voice-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Голос:
            </label>
            <select
              id="live-voice-select"
              value={voiceName}
              disabled={status !== 'idle'}
              onChange={(e) => setVoiceName(e.target.value as LiveVoiceName)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              {VOICE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live Audio Console */}
      <div className="p-6 sm:p-8 bg-slate-50/50 border-b border-slate-200 flex flex-col items-center text-center space-y-5">
        {/* Acoustic Bar Meter */}
        <div
          aria-hidden="true"
          className="h-14 flex items-center justify-center gap-1.5"
        >
          {BAR_WEIGHTS.map((weight, idx) => {
            const heightPct =
              status === 'connected'
                ? Math.max(14, Math.min(100, Math.round(activeEnergy * weight * 100)))
                : 14;
            const barColor =
              status !== 'connected'
                ? 'bg-slate-300'
                : isModelSpeaking
                  ? 'bg-blue-700'
                  : isMuted
                    ? 'bg-slate-300'
                    : 'bg-emerald-600';
            return (
              <span
                key={idx}
                style={{ height: `${heightPct}%` }}
                className={`w-1.5 rounded-full transition-[height,background-color] duration-100 ${barColor}`}
              />
            );
          })}
        </div>

        <div className="space-y-1 max-w-lg">
          <p className="text-sm font-semibold text-slate-900">
            {status === 'idle'
              ? 'Натисніть кнопку нижче та поговоріть про ваше рішення'
              : status === 'connecting'
                ? 'Підключаємо мікрофон і голосову модель...'
                : isModelSpeaking
                  ? 'Консультант відповідає — ви можете перебити його в будь-який момент'
                  : isMuted
                    ? 'Мікрофон вимкнено — увімкніть його, щоб продовжити розмову'
                    : 'Говоріть природно українською — консультант слухає вас у реальному часі'}
          </p>
          <p className="text-xs text-slate-500">
            Поточний фокус: «{decision.title}» ({decision.options.length} варіанти)
          </p>
        </div>

        {/* Primary Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {status === 'idle' ? (
            <button
              type="button"
              onClick={() => void handleStartSession()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600"
            >
              <Mic className="w-4 h-4 shrink-0" />
              Почати голосову розмову
            </button>
          ) : status === 'connecting' ? (
            <button
              type="button"
              onClick={() => stopSession(false)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Loader2 className="w-4 h-4 animate-spin text-blue-700 shrink-0" />
              Скасувати підключення
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-pressed={isMuted}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isMuted
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-4 h-4 shrink-0" />
                    Увімкнути мікрофон
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 shrink-0 text-emerald-700" />
                    Вимкнути мікрофон
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => stopSession(false)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600"
              >
                <PhoneOff className="w-4 h-4 shrink-0" />
                Завершити розмову
              </button>
            </>
          )}
        </div>

        {/* Topic Prompts */}
        <div className="w-full max-w-2xl pt-1">
          <div className="text-[11px] font-semibold text-slate-500 mb-2">
            {status === 'connected'
              ? 'Натисніть, щоб швидко скерувати розмову:'
              : 'Приклади запитань, які можна поставити вголос:'}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {quickPrompts.map((promptText) =>
              status === 'connected' ? (
                <button
                  key={promptText}
                  type="button"
                  onClick={() => handleSendTopicNudge(promptText)}
                  className="text-left text-xs text-slate-700 bg-white hover:bg-blue-50/70 hover:text-blue-800 border border-slate-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {promptText}
                </button>
              ) : (
                <span
                  key={promptText}
                  className="text-left text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5"
                >
                  «{promptText}»
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mx-5 sm:mx-6 mt-5 flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-700 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Live Transcript Log */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Volume2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Стенограма голосової розмови</span>
          </div>
          {transcript.length > 0 && (
            <button
              type="button"
              onClick={() => setTranscript([])}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              Очистити
            </button>
          )}
        </div>

        {transcript.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
            Після початку голосової сесії тут у реальному часі з’являтимуться ваші репліки та відповіді ШІ-консультанта.
          </p>
        ) : (
          <div
            aria-live="polite"
            className="max-h-72 overflow-y-auto space-y-2.5 pr-1"
          >
            {transcript.map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-lg text-sm leading-relaxed ${
                  entry.speaker === 'user'
                    ? 'bg-blue-50/70 border border-blue-100 text-slate-900 ml-8'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 mr-8'
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-500 mb-1">
                  {entry.speaker === 'user' ? 'Ви' : 'ШІ-консультант'}
                </div>
                <p className="whitespace-pre-wrap break-words">{entry.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>
    </section>
  );
}
