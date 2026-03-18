"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getRiskReport } from "@/lib/backend";
import { formatDate, levelClass, levelLabel } from "@/lib/format";
import { MOCK_REPORT } from "@/lib/mockData";
import { RiskReport } from "@/types";

const PIE_COLORS = ["#ff5f5f", "#ff944d", "#f6c54a", "#4ccf8c"];

export default function RiskDashboard() {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      try {
        const payload = await getRiskReport();
        setReport(payload);
        setError(null);
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Unknown error while loading dashboard");
      } finally {
        setLoading(false);
      }
    }

    void loadReport();
  }, []);

  const showingDemoData = !!report && report.totalFindings === 0 && report.categories.length === 0;
  const displayReport = showingDemoData ? MOCK_REPORT : report;

  const topCategory = useMemo(() => {
    if (!displayReport?.categories.length) {
      return "No data";
    }

    return displayReport.categories[0].category;
  }, [displayReport]);

  if (loading) {
    return <section className="dashboard card panel">Loading risk report...</section>;
  }

  if (!displayReport) {
    return (
      <section className="dashboard card panel">
        <p>Cannot load dashboard data.</p>
        {error ? <small>{error}</small> : null}
      </section>
    );
  }

  return (
    <section className="dashboard">
      <div className="kpi-grid">
        <article className="card kpi-card">
          <span className="kpi-label">Risk Index</span>
          <strong className="kpi-value">{displayReport.riskIndex}/100</strong>
        </article>
        <article className="card kpi-card">
          <span className="kpi-label">Total Findings</span>
          <strong className="kpi-value">{displayReport.totalFindings}</strong>
        </article>
        <article className="card kpi-card">
          <span className="kpi-label">Top Risk Family</span>
          <strong className="kpi-value">{topCategory}</strong>
        </article>
      </div>

      <article className="card panel">
        <h2 className="section-title">Risk Trend (7 days)</h2>
        <small>Last generated: {formatDate(displayReport.generatedAt)}</small>
        {showingDemoData ? <small> Demo mode: showing sample telemetry.</small> : null}
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayReport.trend} margin={{ top: 20, right: 12, left: -16, bottom: 2 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.14)" />
              <XAxis dataKey="day" stroke="#9fc7dc" fontSize={12} />
              <YAxis stroke="#9fc7dc" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "rgba(9,19,26,0.95)",
                  border: "1px solid rgba(185,223,244,0.24)",
                  borderRadius: "10px"
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="critical" stroke="#ff5f5f" strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="high" stroke="#ff944d" strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="medium" stroke="#f6c54a" strokeWidth={2.2} dot={false} />
              <Line type="monotone" dataKey="low" stroke="#4ccf8c" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card panel">
        <h2 className="section-title">Risk Distribution</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={displayReport.distribution}
                dataKey="value"
                nameKey="name"
                outerRadius={88}
                innerRadius={56}
                paddingAngle={2}
              >
                {displayReport.distribution.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "rgba(9,19,26,0.95)",
                  border: "1px solid rgba(185,223,244,0.24)",
                  borderRadius: "10px"
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card panel">
        <h2 className="section-title">Category Breakdown</h2>
        <table className="risk-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Score</th>
              <th>Findings</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {displayReport.categories.map((item) => (
              <tr key={item.category}>
                <td>{item.category}</td>
                <td>{item.score}</td>
                <td>{item.findings}</td>
                <td>
                  <span className={levelClass(item.level)} />
                  {levelLabel(item.level)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
