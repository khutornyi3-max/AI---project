import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { queryMapsGrounding } from '../services/decisionApi';
import type {
  DecisionRecord,
  MapsGroundingResponse,
  PinnedDecisionPlace,
} from '../types/decision';

interface DecisionMapsPanelProps {
  decision: DecisionRecord;
  onAddPinnedPlace: (place: Omit<PinnedDecisionPlace, 'id' | 'createdAt'>) => void;
  onRemovePinnedPlace: (placeId: string) => void;
  onUpdatePinnedPlaceOption: (placeId: string, optionId: string | null) => void;
}

const DEFAULT_CENTER = { lat: 50.4501, lng: 30.5234 }; // Kyiv, Ukraine
const DEFAULT_ZOOM = 12;

const OPTION_PIN_PALETTE = [
  { bg: '#1D4ED8', border: '#1E3A8A', glyph: '#FFFFFF' },
  { bg: '#047857', border: '#064E3B', glyph: '#FFFFFF' },
  { bg: '#B45309', border: '#78350F', glyph: '#FFFFFF' },
  { bg: '#6D28D9', border: '#4C1D95', glyph: '#FFFFFF' },
];

interface PlaceMarkerWithInfoProps {
  place: PinnedDecisionPlace;
  optionLabel: string | null;
  optionIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRemove: () => void;
}

function PlaceMarkerWithInfo({
  place,
  optionLabel,
  optionIndex,
  isSelected,
  onSelect,
  onClose,
  onRemove,
}: PlaceMarkerWithInfoProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const palette =
    optionIndex >= 0
      ? OPTION_PIN_PALETTE[optionIndex % OPTION_PIN_PALETTE.length]
      : { bg: '#0F172A', border: '#020617', glyph: '#FFFFFF' };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        title={place.name}
        onClick={onSelect}
      >
        <Pin
          background={palette.bg}
          borderColor={palette.border}
          glyphColor={palette.glyph}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose}>
          <div className="max-w-[240px] space-y-1.5 text-slate-900 p-0.5">
            <p className="text-sm font-semibold leading-snug">{place.name}</p>
            {place.address && (
              <p className="text-xs text-slate-600 leading-relaxed">{place.address}</p>
            )}
            {optionLabel && (
              <p className="text-xs font-medium text-blue-700">
                Варіант: {optionLabel}
              </p>
            )}
            <div className="pt-1 flex items-center justify-between gap-2">
              {place.mapsUri ? (
                <a
                  href={place.mapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  Google Maps
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onRemove}
                className="text-xs font-medium text-rose-700 hover:text-rose-800"
              >
                Видалити
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface PlacesSearchBarProps {
  decision: DecisionRecord;
  selectedOptionId: string | null;
  onSelectOptionId: (optionId: string | null) => void;
  onPlacePinned: (place: Omit<PinnedDecisionPlace, 'id' | 'createdAt'>) => void;
}

function PlacesSearchBar({
  decision,
  selectedOptionId,
  onSelectOptionId,
  onPlacePinned,
}: PlacesSearchBarProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const ensureSessionToken = useCallback(() => {
    if (!placesLib) return null;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, [placesLib]);

  const resetSessionToken = useCallback(() => {
    if (placesLib) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    } else {
      sessionTokenRef.current = null;
    }
  }, [placesLib]);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const token = ensureSessionToken();
        const request: google.maps.places.AutocompleteRequest = {
          input: trimmed,
          ...(token ? { sessionToken: token } : {}),
        };
        const { suggestions: results } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(
            request,
          );
        if (!cancelled) {
          setSuggestions(results ?? []);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSearchError(
            'Не вдалося завантажити підказки місць. Перевірте запит або спробуйте пізніше.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inputValue, placesLib, ensureSessionToken]);

  async function handleSelectSuggestion(
    suggestion: google.maps.places.AutocompleteSuggestion,
  ) {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'googleMapsURI',
          'rating',
        ],
      });

      const loc = place.location;
      if (!loc) {
        setSearchError('Для цього місця не знайдено координат.');
        return;
      }

      const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
      const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);

      onPlacePinned({
        placeId: place.id ?? undefined,
        name:
          place.displayName ||
          prediction.mainText?.text ||
          prediction.text?.text ||
          'Обране місце',
        address: place.formattedAddress || prediction.secondaryText?.text || '',
        lat,
        lng,
        optionId: selectedOptionId,
        notes: '',
        mapsUri: place.googleMapsURI ?? undefined,
        rating: typeof place.rating === 'number' ? place.rating : null,
      });

      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(14);
      }

      setInputValue('');
      setSuggestions([]);
      resetSessionToken();
    } catch {
      setSearchError('Не вдалося отримати деталі обраного місця.');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2.5">
        <div className="relative">
          <label htmlFor="places-autocomplete-input" className="sr-only">
            Пошук реального місця або адреси на Google Maps
          </label>
          <Search
            aria-hidden="true"
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            id="places-autocomplete-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Пошук реальних місць, адрес, районів (Places API)..."
            autoComplete="off"
            className="w-full pl-10 pr-9 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-blue-700 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}

          {suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Підказки місць Google Places"
              className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 max-h-64 overflow-y-auto"
            >
              {suggestions.map((suggestion, index) => {
                const pred = suggestion.placePrediction;
                if (!pred) return null;
                return (
                  <li key={pred.placeId || index}>
                    <button
                      type="button"
                      onClick={() => void handleSelectSuggestion(suggestion)}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-start gap-2.5"
                    >
                      <MapPin className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 truncate">
                          {pred.mainText?.text || pred.text?.text}
                        </span>
                        {pred.secondaryText?.text && (
                          <span className="block text-xs text-slate-500 truncate">
                            {pred.secondaryText.text}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="pin-option-select" className="sr-only">
            Прив&apos;язати місце до варіанту рішення
          </label>
          <select
            id="pin-option-select"
            value={selectedOptionId ?? ''}
            onChange={(e) => onSelectOptionId(e.target.value || null)}
            className="w-full px-3 py-2.5 text-sm text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">Загальна локація</option>
            {decision.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Варіант: {opt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {searchError && (
        <p role="alert" className="text-xs text-rose-700">
          {searchError}
        </p>
      )}
    </div>
  );
}

function MapViewportController({
  focusTarget,
}: {
  focusTarget: { lat: number; lng: number; seq: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo({ lat: focusTarget.lat, lng: focusTarget.lng });
    map.setZoom(14);
  }, [map, focusTarget]);

  return null;
}

export function DecisionMapsPanel({
  decision,
  onAddPinnedPlace,
  onRemovePinnedPlace,
  onUpdatePinnedPlaceOption,
}: DecisionMapsPanelProps) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
  const pinnedPlaces = useMemo(
    () => (Array.isArray(decision.pinnedPlaces) ? decision.pinnedPlaces : []),
    [decision.pinnedPlaces],
  );

  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedOptionForNewPin, setSelectedOptionForNewPin] = useState<
    string | null
  >(decision.options[0]?.id ?? null);
  const [focusTarget, setFocusTarget] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);

  // Google Maps Grounding (Gemini + googleMaps tool) state
  const [groundingQuery, setGroundingQuery] = useState('');
  const [isGroundingLoading, setIsGroundingLoading] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [groundingResult, setGroundingResult] =
    useState<MapsGroundingResponse | null>(null);
  const [userCoords, setUserCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const initialCenter = useMemo(() => {
    if (pinnedPlaces.length > 0) {
      return { lat: pinnedPlaces[0].lat, lng: pinnedPlaces[0].lng };
    }
    return DEFAULT_CENTER;
  }, [pinnedPlaces]);

  const quickQueries = useMemo(() => {
    const firstOpt = decision.options[0]?.name;
    const secondOpt = decision.options[1]?.name;
    return [
      firstOpt && secondOpt
        ? `Порівняй зручні локації та інфраструктуру в Києві для «${firstOpt}» та «${secondOpt}»`
        : 'Найкращі бізнес-райони та коворкінги в центрі Києва з гарним транспортом',
      'Оціни інфраструктуру, паркування та доступність транспорту поруч із Подолом та Печерськом',
      'Порадь перевірені сервіси або заклади з високим рейтингом для цього рішення',
    ];
  }, [decision.options]);

  function handleRequestGeolocation() {
    if (!navigator.geolocation) {
      setGeoMessage('Браузер не підтримує визначення геолокації.');
      return;
    }
    setGeoMessage('Визначаємо ваше розташування...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoords(coords);
        setFocusTarget({
          lat: coords.latitude,
          lng: coords.longitude,
          seq: Date.now(),
        });
        setGeoMessage(
          `Геолокацію додано (${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)})`,
        );
      },
      () => {
        setGeoMessage('Доступ до геолокації не надано — пошук працюватиме за назвою міста.');
      },
      { timeout: 8000 },
    );
  }

  async function handleRunMapsGrounding(customPrompt?: string) {
    const query = (customPrompt ?? groundingQuery).trim();
    if (query.length < 3 || isGroundingLoading) return;
    if (customPrompt) {
      setGroundingQuery(customPrompt);
    }

    setIsGroundingLoading(true);
    setGroundingError(null);
    try {
      const response = await queryMapsGrounding({
        query,
        decisionTitle: decision.title,
        options: decision.options.map((o) => o.name),
        ...(userCoords ? { latLng: userCoords } : {}),
      });
      setGroundingResult(response);
    } catch (error: unknown) {
      setGroundingError(
        error instanceof Error
          ? error.message
          : 'Не вдалося виконати пошук через Google Maps Grounding.',
      );
    } finally {
      setIsGroundingLoading(false);
    }
  }

  const optionIndexMap = useMemo(() => {
    const map = new Map<string, { index: number; name: string }>();
    decision.options.forEach((opt, idx) => {
      map.set(opt.id, { index: idx, name: opt.name });
    });
    return map;
  }, [decision.options]);

  return (
    <div className="space-y-6">
      {/* Interactive Google Maps Platform Section */}
      <section
        aria-label="Інтерактивна карта локацій рішення"
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Інтерактивна карта локацій
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Додавайте реальні адреси, райони або заклади з Google Places та прив&apos;язуйте їх до варіантів рішення.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRequestGeolocation}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Navigation className="w-3.5 h-3.5 text-blue-700" />
            Моє розташування
          </button>
        </div>

        {geoMessage && (
          <p className="text-xs text-slate-600">{geoMessage}</p>
        )}

        {apiKey ? (
          <APIProvider apiKey={apiKey} language="uk" region="UA">
            <PlacesSearchBar
              decision={decision}
              selectedOptionId={selectedOptionForNewPin}
              onSelectOptionId={setSelectedOptionForNewPin}
              onPlacePinned={(place) => {
                onAddPinnedPlace(place);
              }}
            />

            <div className="rounded-xl overflow-hidden border border-slate-200 h-[460px] w-full bg-slate-100">
              <GoogleMap
                defaultCenter={initialCenter}
                defaultZoom={DEFAULT_ZOOM}
                mapId="DEMO_MAP_ID"
                gestureHandling="greedy"
                disableDefaultUI={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                className="w-full h-full"
              >
                <MapViewportController focusTarget={focusTarget} />
                {pinnedPlaces.map((place) => {
                  const optMeta = place.optionId
                    ? optionIndexMap.get(place.optionId)
                    : undefined;
                  return (
                    <PlaceMarkerWithInfo
                      key={place.id}
                      place={place}
                      optionLabel={optMeta?.name ?? null}
                      optionIndex={optMeta?.index ?? -1}
                      isSelected={selectedPinId === place.id}
                      onSelect={() => setSelectedPinId(place.id)}
                      onClose={() => setSelectedPinId(null)}
                      onRemove={() => {
                        setSelectedPinId(null);
                        onRemovePinnedPlace(place.id);
                      }}
                    />
                  );
                })}
              </GoogleMap>
            </div>
          </APIProvider>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 space-y-1.5">
            <p className="font-semibold">
              Карту буде активовано після підключення ключа Google Maps
            </p>
            <p className="text-amber-900">
              Ви все одно можете користуватися ШІ-пошуком реальних місць Google Maps нижче.
            </p>
          </div>
        )}

        {/* Saved / Pinned Locations List */}
        <div className="pt-2 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Закріплені локації ({pinnedPlaces.length})
            </h3>
            {pinnedPlaces.length === 0 && (
              <span className="text-xs text-slate-500">
                Скористайтеся пошуком вище, щоб закріпити першу точку на карті
              </span>
            )}
          </div>

          {pinnedPlaces.length > 0 && (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pinnedPlaces.map((place) => {
                const optMeta = place.optionId
                  ? optionIndexMap.get(place.optionId)
                  : undefined;
                return (
                  <li
                    key={place.id}
                    className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPinId(place.id);
                          setFocusTarget({
                            lat: place.lat,
                            lng: place.lng,
                            seq: Date.now(),
                          });
                        }}
                        className="text-left min-w-0 group"
                      >
                        <p className="text-sm font-semibold text-slate-950 group-hover:text-blue-700 truncate">
                          {place.name}
                        </p>
                        {place.address && (
                          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                            {place.address}
                          </p>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemovePinnedPlace(place.id)}
                        aria-label={`Видалити локацію ${place.name}`}
                        className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md hover:bg-white transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                      <select
                        aria-label={`Варіант для ${place.name}`}
                        value={place.optionId ?? ''}
                        onChange={(e) =>
                          onUpdatePinnedPlaceOption(
                            place.id,
                            e.target.value || null,
                          )
                        }
                        className="text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600 max-w-[190px]"
                      >
                        <option value="">Загальна локація</option>
                        {decision.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-3 text-xs">
                        {optMeta && (
                          <span className="font-mono text-slate-500">
                            #{optMeta.index + 1}
                          </span>
                        )}
                        {place.mapsUri && (
                          <a
                            href={place.mapsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                          >
                            Відкрити
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Google Maps Grounding AI Discovery Section */}
      <section
        aria-label="ШІ-аналіз локацій із Google Maps Grounding"
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-950">
              Дослідження місць із Google Maps Grounding
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Поставте геопросторове запитання щодо вашого рішення — ШІ перевірить реальні місця, відгуки та посилання в Google Maps.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleRunMapsGrounding();
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <label htmlFor="maps-grounding-query" className="sr-only">
            Запит до Google Maps Grounding
          </label>
          <input
            id="maps-grounding-query"
            type="text"
            value={groundingQuery}
            onChange={(e) => setGroundingQuery(e.target.value)}
            placeholder="Наприклад: Які райони чи коворкінги в Києві найкраще підходять для цього варіанту?"
            className="flex-1 px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={isGroundingLoading || groundingQuery.trim().length < 3}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isGroundingLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Пошук у Maps...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Запитати Google Maps
              </>
            )}
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {quickQueries.map((promptText, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isGroundingLoading}
              onClick={() => void handleRunMapsGrounding(promptText)}
              className="text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors text-left"
            >
              {promptText}
            </button>
          ))}
        </div>

        {groundingError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800"
          >
            {groundingError}
          </div>
        )}

        {groundingResult && (
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
              {groundingResult.answer}
            </div>

            {groundingResult.places.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Джерела Google Maps ({groundingResult.places.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groundingResult.places.map((place, idx) => (
                    <div
                      key={`${place.uri}-${idx}`}
                      className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 space-y-2"
                    >
                      <a
                        href={place.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
                      >
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span>{place.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>

                      {place.reviewSnippets.length > 0 && (
                        <ul className="space-y-1.5 pt-1 border-t border-slate-200">
                          {place.reviewSnippets.map((snippet, sIdx) => (
                            <li key={`${snippet.uri}-${sIdx}`} className="text-xs">
                              {snippet.text && (
                                <p className="text-slate-600 italic">
                                  &laquo;{snippet.text}&raquo;
                                </p>
                              )}
                              <a
                                href={snippet.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium mt-0.5"
                              >
                                {snippet.title || 'Переглянути відгук у Google Maps'}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groundingResult.webSources.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Додаткові джерела
                </h3>
                <div className="flex flex-wrap gap-2">
                  {groundingResult.webSources.map((src, idx) => (
                    <a
                      key={`${src.uri}-${idx}`}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md hover:bg-blue-100"
                    >
                      {src.title}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
