import ChatPanel from "@/components/ChatPanel";
import RiskDashboard from "@/components/RiskDashboard";
import CodeScanner from "@/components/CodeScanner";
import KnowledgeManager from "@/components/KnowledgeManager";
import RemediationPanel from "@/components/RemediationPanel";

export default function HomePage() {
  return (
    <main>
      <section className="header card">
        <h1 className="title">ThreatLens Copilot</h1>
        <p className="subtitle">
          <span className="award-badge">🏆 2nd Runner Up - GDGOC SAU 2026</span>
          Intelligent Cloud-Native Security Operations. Analyze risks and protect your codebase with real-time AI guidance.
        </p>
      </section>

      <section className="app-shell">
        {/* Top Row: Chat + Dashboard */}
        <div className="top-row">
          <ChatPanel />
          <RiskDashboard />
        </div>
        
        {/* Middle Row: Full Width Scanner */}
        <div className="bottom-row">
          <CodeScanner />
        </div>

        {/* Bottom Row: Knowledge & Policy */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <KnowledgeManager />
          <RemediationPanel />
        </div>
      </section>
    </main>
  );
}
