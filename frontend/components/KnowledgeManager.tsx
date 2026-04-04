"use client";

import { useEffect, useState } from "react";
import { getKnowledgeHealth, triggerKnowledgeIngest } from "@/lib/backend";
import { TrustedFeedIngestHealthResponse, TrustedFeedIngestResponse } from "@/types";

export default function KnowledgeManager() {
  const [health, setHealth] = useState<TrustedFeedIngestHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<TrustedFeedIngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [includeNvd, setIncludeNvd] = useState(true);
  const [includeCisaKev, setIncludeCisaKev] = useState(true);
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(50);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const data = await getKnowledgeHealth();
      setHealth(data);
    } catch (err: any) {
      console.error(err);
      // Fail silently for health check, or show minor warning
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleIngest = async () => {
    try {
      setIngesting(true);
      setError(null);
      setResult(null);
      const res = await triggerKnowledgeIngest({
        includeNvd,
        includeCisaKev,
        days,
        limitPerFeed: limit,
        project: "global-feed"
      });
      setResult(res);
      await fetchHealth(); // Refresh health after ingest
    } catch (err: any) {
      setError(err.message || "Failed to trigger ingestion.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="card panel knowledge-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 className="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
            </svg>
            Knowledge Management
          </h3>
          <small style={{ color: 'var(--text-muted)' }}>Sync with NVD & CISA KEV feeds</small>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={includeNvd} onChange={e => setIncludeNvd(e.target.checked)} />
            Include NVD (CVEs)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={includeCisaKev} onChange={e => setIncludeCisaKev(e.target.checked)} />
            Include CISA KEV
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
            Days Back:
            <input type="number" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: '60px', background: 'transparent', border: '1px solid var(--line)', color: 'white', padding: '4px 8px', borderRadius: '4px' }} min={1} max={60} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
            Limit per feed:
            <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ width: '60px', background: 'transparent', border: '1px solid var(--line)', color: 'white', padding: '4px 8px', borderRadius: '4px' }} min={1} max={300} />
          </label>
        </div>
        
        <button 
          className="btn-primary" 
          onClick={handleIngest} 
          disabled={ingesting || (!includeNvd && !includeCisaKev)}
          style={{ width: '100%', padding: '10px', display: 'flex', justifyContent: 'center', gap: '8px' }}
        >
          {ingesting ? (
             <>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning">
                 <line x1="12" y1="2" x2="12" y2="6"></line>
                 <line x1="12" y1="18" x2="12" y2="22"></line>
                 <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                 <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                 <line x1="2" y1="12" x2="6" y2="12"></line>
                 <line x1="18" y1="12" x2="22" y2="12"></line>
                 <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                 <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
               </svg>
               Syncing Feeds...
             </>
          ) : "Sync Trusted Feeds"}
        </button>
      </div>

      {error && (
        <div className="risk-alert critical fade-in" style={{ padding: '12px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="risk-alert low fade-in" style={{ padding: '12px' }}>
          <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Ingestion Successful</strong>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Fetched {result.totalFetched} items, Upserted {result.totalUpserted} items.</p>
        </div>
      )}

      {health && (
        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--line)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Last Sync: {health.lastIngestAt ? new Date(health.lastIngestAt).toLocaleString() : 'Never'}</span>
            <span>Total DB Docs: {health.totalUpserted}</span>
          </div>
        </div>
      )}

      <style jsx>{`
        .spinning { animation: spin 2s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
