"use client";

import { useState } from "react";
import { evaluateSecurityPolicy, createRemediationTicket } from "@/lib/backend";
import { FrameworkCheck, PolicyEvaluateResponse, RemediationTicketResponse } from "@/types";

const MOCK_FINDING: FrameworkCheck = {
  id: "owasp-test-1",
  severity: "high",
  title: "Broken Access Control Detected",
  evidence: "JWT token validation missing on /api/admin",
  recommendation: "Ensure secret is validated and roles are enforced."
};

export default function RemediationPanel() {
  const [evaluating, setEvaluating] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyEvaluateResponse | null>(null);
  
  const [ticketing, setTicketing] = useState(false);
  const [ticketResult, setTicketResult] = useState<RemediationTicketResponse | null>(null);

  const [error, setError] = useState<string | null>(null);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      setError(null);
      
      const res = await evaluateSecurityPolicy({
        project: "threatlens-demo",
        failOn: ["critical", "high"],
        maxHigh: 0,
        maxMedium: 3,
        maxLow: 10,
        findings: [MOCK_FINDING]
      });
      
      setPolicyResult(res);
    } catch (err: any) {
      setError(err.message || "Policy evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleCreateTicket = async () => {
    try {
      setTicketing(true);
      setError(null);
      
      const res = await createRemediationTicket({
        project: "threatlens-demo",
        owner: "security-team",
        findings: [MOCK_FINDING],
        context: "Triggered from Demo Panel"
      });
      
      setTicketResult(res);
    } catch (err: any) {
      setError(err.message || "Ticket creation failed.");
    } finally {
      setTicketing(false);
    }
  };

  return (
    <div className="card panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 className="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Policy & Remediation
          </h3>
          <small style={{ color: 'var(--text-muted)' }}>Automate policy checks & ticketing</small>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
         <button 
          className="btn-primary" 
          onClick={handleEvaluate} 
          disabled={evaluating}
          style={{ flex: 1, padding: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--line)', color: 'var(--text-main)' }}
        >
          {evaluating ? "Evaluating..." : "Evaluate Policy (Mock)"}
        </button>

        <button 
          className="btn-primary" 
          onClick={handleCreateTicket} 
          disabled={ticketing}
          style={{ flex: 1, padding: '10px' }}
        >
          {ticketing ? "Creating..." : "Create Ticket (Mock)"}
        </button>
      </div>

      {error && (
        <div className="risk-alert critical fade-in" style={{ padding: '12px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {policyResult && (
        <div className={`risk-alert ${policyResult.passed ? 'low' : 'high'} fade-in`} style={{ padding: '12px' }}>
          <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>
            Policy Status: {policyResult.passed ? "PASSED" : "FAILED"}
          </strong>
          {policyResult.violations.length > 0 && (
             <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem' }}>
                {policyResult.violations.map((v, i) => <li key={i}>{v}</li>)}
             </ul>
          )}
        </div>
      )}

      {ticketResult && (
        <div className="risk-alert medium fade-in" style={{ padding: '12px' }}>
          <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>
            Ticket Created: {ticketResult.ticketId}
          </strong>
          <div style={{ fontSize: '0.85rem' }}>
            <span className={`risk-badge ${ticketResult.priority === 'P0' ? 'critical' : ticketResult.priority === 'P1' ? 'high' : 'medium'}`}>
              {ticketResult.priority}
            </span>
            <span style={{ marginLeft: '8px' }}>{ticketResult.title}</span>
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px', fontSize: '0.85rem' }}>
            {ticketResult.tasks.map((t, i) => <li key={i}>{t.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
