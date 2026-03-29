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
  createdAt: string;
}

export interface ChatStreamMeta {
  createdAt: string;
  riskLevel: RiskLevel;
  tags: string[];
  recommendations: string[];
  frameworkChecks: FrameworkCheck[];
  retrievedCount: number;
}
