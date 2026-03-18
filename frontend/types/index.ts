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

export interface RiskReport {
  generatedAt: string;
  totalFindings: number;
  projectsScanned: number;
  riskIndex: number;
  categories: RiskCategory[];
  trend: RiskTrendPoint[];
  distribution: RiskDistribution[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
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
  createdAt: string;
}

export interface ChatStreamMeta {
  createdAt: string;
  riskLevel: RiskLevel;
  tags: string[];
  recommendations: string[];
  retrievedCount: number;
}
