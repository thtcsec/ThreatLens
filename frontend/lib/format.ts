import { RiskLevel } from "@/types";

export function levelLabel(level: RiskLevel): string {
  switch (level) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Unknown";
  }
}

export function levelClass(level: RiskLevel): string {
  switch (level) {
    case "critical":
      return "risk-dot critical";
    case "high":
      return "risk-dot high";
    case "medium":
      return "risk-dot medium";
    case "low":
      return "risk-dot low";
    default:
      return "risk-dot";
  }
}

export function formatDate(input: string): string {
  const date = new Date(input);

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
