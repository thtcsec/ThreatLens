export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface RiskCategory {
  category: string;
  score: number;
  findings: number;
  level: RiskLevel;
}

export interface RiskTrendPoint {
  day: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RiskDistribution {
  name: string;
  value: number;
}

export interface FrameworkCheck {
  id: string;
  severity: RiskLevel;
  owasp?: string | null;
  cwe?: string | null;
  title: string;
  evidence: string;
  recommendation: string;
}

export interface RiskReport {
  generatedAt: string;
  totalFindings: number;
  projectsScanned: number;
  riskIndex: number;
  selectedProject?: string | null;
  availableProjects?: string[];
  recentlyIngestedData?: boolean;
  freshnessNote?: string | null;
  categories: RiskCategory[];
  trend: RiskTrendPoint[];
  distribution: RiskDistribution[];
}

export interface ChatHistoryItem {
  id: number;
  createdAt: string;
  question: string;
  answer: string;
  riskLevel: RiskLevel;
  source: string;
  retrievedCount: number;
}

export interface ChatHistoryResponse {
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  sort: "newest" | "oldest";
  count: number;
  items: ChatHistoryItem[];
}

export interface ChatHistoryQueryOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
  sort?: "newest" | "oldest";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  securityMetadata?: ChatSecurityMetadata;
}

export interface ChatSecurityMetadata {
  riskLevel: RiskLevel;
  tags: string[];
  recommendations: string[];
  frameworkChecks: FrameworkCheck[];
  citations: ChatCitation[];
  confidenceScore: number;
  needsHumanReview: boolean;
  verificationNotes: string[];
}

export interface ChatCitation {
  id: string;
  score: number;
  source: string;
  project: string;
  category: string;
  cveId?: string | null;
  cweIds: string[];
  reference?: string | null;
  publishedAt?: string | null;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  id: string;
  reply: string;
  riskLevel: RiskLevel;
  tags: string[];
  recommendations: string[];
  frameworkChecks: FrameworkCheck[];
  citations: ChatCitation[];
  confidenceScore: number;
  needsHumanReview: boolean;
  verificationNotes: string[];
  createdAt: string;
}

export interface ChatStreamMeta {
  createdAt: string;
  riskLevel: RiskLevel;
  tags: string[];
  recommendations: string[];
  frameworkChecks: FrameworkCheck[];
  citations: ChatCitation[];
  retrievedCount: number;
}

export interface TrustedFeedIngestHealthResponse {
  hasRun: boolean;
  lastIngestAt?: string | null;
  totalFetched: number;
  totalUpserted: number;
  bySource: Record<string, number>;
  errors: string[];
}

export interface TrustedFeedIngestResponse {
  totalFetched: number;
  totalUpserted: number;
  bySource: Record<string, number>;
  errors: string[];
}

export interface PolicyEvaluateResponse {
  project: string;
  passed: boolean;
  summary: Record<string, number>;
  violations: string[];
  suggestedActions: string[];
  generatedAt: string;
}

export interface RemediationTask {
  id: string;
  title: string;
  severity: RiskLevel;
  recommendation: string;
  owner: string;
  status: "open" | "in_progress" | "done";
}

export interface RemediationTicketResponse {
  ticketId: string;
  project: string;
  priority: "P0" | "P1" | "P2" | "P3";
  title: string;
  summary: string;
  tasks: RemediationTask[];
  generatedAt: string;
}
