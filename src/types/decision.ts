export type FrameworkType =
  | 'pros-cons'
  | 'comparison'
  | 'swot'
  | 'chat'
  | 'voice'
  | 'maps';

export type ChallengeMode =
  | 'devils-advocate'
  | 'blind-spots'
  | 'tiebreaker-question'
  | 'fact-check'
  | 'custom';

export type ChatRoleMode = 'advisor' | 'skeptic' | 'quick';

export type LiveVoiceRole = 'advisor' | 'skeptic';

export type LiveVoiceName = 'Zephyr' | 'Kore' | 'Fenrir' | 'Puck' | 'Charon';

export interface LiveTranscriptEntry {
  id: string;
  speaker: 'user' | 'model';
  text: string;
  createdAt: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MapsReviewSnippet {
  uri: string;
  title?: string;
  text?: string;
}

export interface MapsGroundingPlace {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: MapsReviewSnippet[];
}

export interface PinnedDecisionPlace {
  id: string;
  placeId?: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  optionId: string | null;
  notes: string;
  mapsUri?: string;
  rating?: number | null;
  createdAt: string;
}

export interface MapsGroundingRequest {
  query: string;
  decisionTitle?: string;
  options?: string[];
  latLng?: {
    latitude: number;
    longitude: number;
  };
}

export interface MapsGroundingResponse {
  answer: string;
  places: MapsGroundingPlace[];
  webSources: GroundingSource[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
  roleMode?: ChatRoleMode;
  usedSearch?: boolean;
  sources?: GroundingSource[];
  searchQueries?: string[];
}

export interface DecisionOption {
  id: string;
  name: string;
  summary: string;
  keyConsiderations: string[];
}

export interface ProConItem {
  id: string;
  text: string;
  rationale: string;
  weight: number; // 1 to 5
  type: 'pro' | 'con';
  source: 'ai' | 'user';
}

export interface OptionProsCons {
  optionId: string;
  items: ProConItem[];
}

export interface CriterionScore {
  score: number; // 1 to 10
  note: string;
}

export interface ComparisonCriterion {
  id: string;
  name: string;
  description: string;
  weight: number; // 1 to 5
  scores: Record<string, CriterionScore>;
}

export interface SwotItem {
  id: string;
  text: string;
  critical: boolean;
  source: 'ai' | 'user';
}

export type SwotQuadrantKey =
  | 'strengths'
  | 'weaknesses'
  | 'opportunities'
  | 'threats';

export interface OptionSwot {
  optionId: string;
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

export interface ChallengeInsight {
  id: string;
  mode: ChallengeMode;
  promptLabel: string;
  heading: string;
  points: string[];
  tiebreakerQuestion: string;
  createdAt: string;
  usedSearch?: boolean;
  sources?: GroundingSource[];
  searchQueries?: string[];
}

export interface DecisionRecord {
  id: string;
  title: string;
  context: string;
  options: DecisionOption[];
  prosCons: OptionProsCons[];
  comparisonCriteria: ComparisonCriterion[];
  swot: OptionSwot[];
  aiTakeaway: string;
  tiebreakerQuestion: string;
  challenges: ChallengeInsight[];
  chosenOptionId: string | null;
  activeFramework: FrameworkType;
  createdAt: string;
  updatedAt: string;
  isSeed?: boolean;
  groundingSources?: GroundingSource[];
  groundingQueries?: string[];
  pinnedPlaces?: PinnedDecisionPlace[];
}

export interface InitialCriterionInput {
  id: string;
  name: string;
  description: string;
  weight: number; // 1 to 5
}

export interface DecisionTemplate {
  id: string;
  name: string;
  category: string;
  summary: string;
  title: string;
  options: string[];
  context: string;
  preferredFramework: Exclude<FrameworkType, 'chat' | 'voice' | 'maps'>;
  initialCriteria: InitialCriterionInput[];
}

export interface AnalyzeDecisionRequest {
  title: string;
  options: string[];
  context: string;
  preferredFramework: FrameworkType;
  useGoogleSearch?: boolean;
  initialCriteria?: Array<{
    name: string;
    description: string;
    weight: number;
  }>;
}

export interface ChallengeDecisionRequest {
  decisionTitle: string;
  options: string[];
  context: string;
  mode: ChallengeMode;
  customQuestion?: string;
  currentSummary: string;
  useGoogleSearch?: boolean;
}

export interface DecisionChatRequest {
  decisionTitle: string;
  decisionContext: string;
  options: string[];
  currentSummary: string;
  roleMode: ChatRoleMode;
  useGoogleSearch: boolean;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
}

export interface DecisionChatResponse {
  reply: string;
  model: string;
  usedSearch: boolean;
  sources: GroundingSource[];
  searchQueries: string[];
}
