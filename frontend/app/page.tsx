import ChatPanel from "@/components/ChatPanel";
import RiskDashboard from "@/components/RiskDashboard";

export default function HomePage() {
  return (
    <main>
      <section className="header card">
        <h1 className="title">ThreatLens Security Copilot</h1>
        <p className="subtitle">
          Chatbot for security guidance and a real-time styled dashboard for risk visibility across your projects.
        </p>
      </section>

      <section className="app-shell">
        <ChatPanel />
        <RiskDashboard />
      </section>
    </main>
  );
}
