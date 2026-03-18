import { RiskReport } from "@/types";

export const MOCK_REPORT: RiskReport = {
  generatedAt: "2026-03-18T09:30:00.000Z",
  totalFindings: 87,
  projectsScanned: 14,
  riskIndex: 72,
  categories: [
    { category: "Injection", score: 81, findings: 18, level: "critical" },
    { category: "Broken Access Control", score: 74, findings: 15, level: "high" },
    { category: "Cryptographic Failures", score: 63, findings: 12, level: "high" },
    { category: "Security Misconfiguration", score: 56, findings: 17, level: "medium" },
    { category: "Vulnerable Components", score: 43, findings: 9, level: "medium" },
    { category: "Insufficient Logging", score: 28, findings: 16, level: "low" }
  ],
  trend: [
    { day: "Mon", critical: 7, high: 10, medium: 14, low: 8 },
    { day: "Tue", critical: 8, high: 9, medium: 13, low: 9 },
    { day: "Wed", critical: 5, high: 11, medium: 12, low: 10 },
    { day: "Thu", critical: 6, high: 12, medium: 9, low: 13 },
    { day: "Fri", critical: 4, high: 8, medium: 11, low: 12 },
    { day: "Sat", critical: 3, high: 6, medium: 10, low: 11 },
    { day: "Sun", critical: 2, high: 5, medium: 8, low: 10 }
  ],
  distribution: [
    { name: "Critical", value: 19 },
    { name: "High", value: 31 },
    { name: "Medium", value: 29 },
    { name: "Low", value: 21 }
  ]
};
