"use client";

import { useEffect, useState } from "react";
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
import { RiskReport } from "@/types";

const PIE_COLORS = ["#ff5f5f", "#ff944d", "#f6c54a", "#4ccf8c"];

export default function RiskDashboard() {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState("");
  const [knownProjects, setKnownProjects] = useState<string[]>([]);

  useEffect(() => {
    async function loadReport() {
      try {
        const payload = await getRiskReport(selectedProject || undefined);
        setReport(payload);
        if (payload.availableProjects && payload.availableProjects.length > 0) {
          setKnownProjects((prev) => {
            const merged = new Set([...prev, ...payload.availableProjects!]);
            return Array.from(merged).sort();
          });
        }
        setError(null);
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Unknown error while loading dashboard");
      } finally {
        setLoading(false);
      }
    }

    void loadReport();
  }, [selectedProject]);

  const displayReport = report;
  const noRealData = !displayReport || displayReport.totalFindings === 0;

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
      <article className="card panel filter-bar">
        <h2 className="section-title">
          <svg className="tab-icon" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          Project Filter
        </h2>
        <div className="project-filter-controls" style={{ marginBottom: "12px" }}>
          <select
            className="history-sort"
            style={{ width: "100%" }}
            value={selectedProject}
            onChange={(event) => setSelectedProject(event.target.value)}
            aria-label="project filter"
          >
            <option value="">All projects</option>
            {knownProjects.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </div>
        <small>
          Active project: <strong style={{color:"var(--text-main)"}}>{displayReport.selectedProject || "All projects"}</strong>
        </small>
        {knownProjects.length > 0 ? (
          <small> | Available: {knownProjects.join(", ")}</small>
        ) : null}
      </article>

      <article className="card panel explanation-panel">
        <h2 className="section-title">Metric Explanations</h2>
        <p><strong>Risk Index:</strong> Weighted average risk score (critical=100, high=75, medium=45, low=20).</p>
        <p><strong>Total Findings:</strong> Total number of findings retrieved from the vector database for the active filter.</p>
        <p><strong>Risk Trend:</strong> Day-by-day finding counts over the last 7 days grouped by severity.</p>
        <p><strong>Risk Distribution:</strong> Severity split of all current findings (Critical/High/Medium/Low).</p>
        <p><strong>Category Breakdown:</strong> Findings grouped by category with score, count, and dominant severity.</p>
      </article>

      <div className="kpi-grid kpi-grid-2">
        <article className="card kpi-card">
          <span className="kpi-label">Risk Index</span>
          <strong className="kpi-value">{displayReport.riskIndex}/100</strong>
        </article>
        <article className="card kpi-card">
          <span className="kpi-label">Total Findings</span>
          <strong className="kpi-value">{displayReport.totalFindings}</strong>
        </article>
      </div>

      <article className="card panel">
        <h2 className="section-title">Risk Trend (7 days)</h2>
        <small>Last generated: {formatDate(displayReport.generatedAt)}</small>
        {displayReport.recentlyIngestedData && displayReport.freshnessNote ? (
          <small className="freshness-note"> {displayReport.freshnessNote}</small>
        ) : null}
        {noRealData ? <small> No real findings in the database yet.</small> : null}
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
            {displayReport.categories.length > 0 ? (
              displayReport.categories.map((item) => (
                <tr key={item.category}>
                  <td>{item.category}</td>
                  <td>{item.score}</td>
                  <td>{item.findings}</td>
                  <td>
                    <span className={levelClass(item.level)} />
                    {levelLabel(item.level)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No category data available from vector DB.</td>
              </tr>
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
