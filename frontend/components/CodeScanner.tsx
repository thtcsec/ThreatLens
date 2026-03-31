"use client";

import { useState } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";

import { sendChatMessage } from "@/lib/backend";
import { ChatResponse } from "@/types";

type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "go"
  | "c"
  | "cpp"
  | "csharp"
  | "sql";

const DEFAULT_SNIPPETS: Record<SupportedLanguage, string> = {
  javascript: `// JavaScript sample
function authenticateUser(req, res) {
  const { username, password } = req.body;
  const query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
  db.execute(query);
}`,
  typescript: `// TypeScript sample
type LoginInput = { username: string; password: string };

async function login(input: LoginInput) {
  const query = \`SELECT * FROM users WHERE username = '\${input.username}' AND password = '\${input.password}'\`;
  return db.raw(query);
}`,
  python: `# Python sample
def authenticate_user(conn, username, password):
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
    cursor = conn.cursor()
    cursor.execute(query)
    return cursor.fetchall()
`,
  java: `// Java sample
public User login(Connection conn, String username, String password) throws Exception {
    String sql = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
    Statement stmt = conn.createStatement();
    ResultSet rs = stmt.executeQuery(sql);
    return mapUser(rs);
}`,
  go: `// Go sample
func login(db *sql.DB, username string, password string) (*User, error) {
  query := "SELECT id, username FROM users WHERE username = '" + username + "' AND password = '" + password + "'"
  row := db.QueryRow(query)
  var u User
  err := row.Scan(&u.ID, &u.Username)
  return &u, err
}`,
  c: `// C sample
void build_query(char *out, const char *username, const char *password) {
    sprintf(out, "SELECT * FROM users WHERE username='%s' AND password='%s'", username, password);
}`,
  cpp: `// C++ sample
std::string buildQuery(const std::string& username, const std::string& password) {
    return "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'";
}`,
  csharp: `// C# sample
public User Login(string username, string password)
{
    var sql = "SELECT * FROM Users WHERE Username = '" + username + "' AND Password = '" + password + "'";
    using var cmd = new SqlCommand(sql, _conn);
    using var reader = cmd.ExecuteReader();
    return MapUser(reader);
}`,
  sql: `-- SQL sample
SELECT *
FROM users
WHERE email = '$userEmail'
  AND password = '$userPassword';`,
};

export default function CodeScanner() {
  const [language, setLanguage] = useState<SupportedLanguage>("javascript");
  const [code, setCode] = useState(DEFAULT_SNIPPETS.javascript);
  const [isScanning, setIsScanning] = useState(false);
  const [report, setReport] = useState<ChatResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLanguageChange = (nextLanguage: SupportedLanguage) => {
    setLanguage(nextLanguage);
    setCode(DEFAULT_SNIPPETS[nextLanguage]);
    setReport(null);
    setErrorMsg(null);
  };

  const handleScan = async () => {
    if (!code.trim()) return;
    
    setIsScanning(true);
    setReport(null);
    setErrorMsg(null);

    const prompt = `Perform static application security testing (SAST) on the following ${language} code snippet. 
Identify any critical vulnerabilities (like Injection, XSS, Broken Auth, etc.) and return your expert findings.

Code:
\`\`\`${language}
${code}
\`\`\`
`;

    try {
      const payload = await sendChatMessage(prompt);
      setReport(payload);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to scan code. Please check backend connection.");
    } finally {
      setIsScanning(false);
    }
  };

  const highlightWithPrism = (codeStr: string) => {
    const grammer = Prism.languages[language] || Prism.languages.javascript;
    return Prism.highlight(codeStr, grammer, language);
  };

  return (
    <div className="card panel scanner-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 className="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="m9 15 2 2 4-4"/>
            </svg>
            Advanced Code Scanner (Powered by Gemini)
          </h3>
          <small style={{ color: 'var(--text-muted)' }}>Identify security gaps with GenAI-powered semantic analysis.</small>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            value={language} 
            onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
            style={{ 
              background: 'var(--bg-secondary)', 
              color: 'var(--text-main)', 
              border: '1px solid var(--line)', 
              borderRadius: '6px', 
              padding: '6px 12px',
              fontFamily: 'inherit',
              outline: 'none'
            }}
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="go">Go (Golang)</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
            <option value="csharp">C#</option>
            <option value="sql">SQL</option>
          </select>
          <button 
            className="btn-primary" 
            onClick={handleScan}
            disabled={isScanning || !code.trim()}
            style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {isScanning ? (
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
                Analyzing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Scan with AI
              </>
            )}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: report ? '1.2fr 0.8fr' : '1fr', gap: '20px', alignItems: 'start' }}>
        {/* Editor Area */}
        <div style={{
          border: '1px solid var(--line)',
          borderRadius: '8px',
          background: '#1d1f21', // Darker background for editor
          minHeight: '400px',
          maxHeight: '600px',
          overflow: 'auto',
          boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
        }}>
          <Editor
            value={code}
            onValueChange={code => setCode(code)}
            highlight={highlightWithPrism}
            padding={20}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
              fontSize: 14,
              minHeight: '100%',
              outline: 'none',
              lineHeight: 1.6
            }}
          />
        </div>

        {/* Results Area */}
        {errorMsg && (
          <div className="risk-alert critical fade-in">
            <p style={{margin: 0, fontWeight: 500}}>Scan Failed</p>
            <p className="risk-desc">{errorMsg}</p>
          </div>
        )}

        {report && (
          <div className="scanner-results fade-in" style={{ marginTop: 0, height: '100%', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--line)' }}>
              <h4 style={{ margin: 0, fontSize: '1.05rem' }}>AI Scan Report</h4>
              <span className={`risk-badge ${report.riskLevel}`}>
                Level: {report.riskLevel.toUpperCase()}
              </span>
            </div>
            
            <div style={{ fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-main)', marginBottom: '20px' }}>
              {report.reply}
            </div>

            {report.tags && report.tags.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <strong style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>VULNERABILITY TAGS</strong>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {report.tags.map((tag: string, i: number) => (
                    <span key={i} style={{ background: 'rgba(255,148,77,0.15)', color: '#fdba74', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report.recommendations && report.recommendations.length > 0 && (
              <div>
                <strong style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>RECOMMENDATIONS</strong>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#a1a1aa' }}>
                  {report.recommendations.map((rec: string, idx: number) => (
                    <li key={idx} style={{ marginBottom: '6px' }}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {report.frameworkChecks && report.frameworkChecks.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <strong style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>OWASP CHECKS</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {report.frameworkChecks.map((chk, idx: number) => (
                     <div key={idx} className={`risk-alert ${chk.severity}`}>
                        <div className="risk-alert-header">
                          <span style={{fontSize: '0.8rem'}}>{chk.title}</span>
                        </div>
                        <p className="risk-desc" style={{fontSize: '0.75rem'}}>{chk.recommendation}</p>
                     </div>
                  ))}
                </div>
              </div>
            )}

            {(typeof report.confidenceScore === "number" || typeof report.needsHumanReview === "boolean") && (
              <div style={{ marginTop: "20px" }}>
                <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  VERIFICATION
                </strong>
                <div style={{ fontSize: "0.82rem", lineHeight: 1.6, color: "#c4c4cb" }}>
                  {typeof report.confidenceScore === "number" ? (
                    <p style={{ margin: "0 0 6px" }}>Confidence Score: {report.confidenceScore.toFixed(2)}</p>
                  ) : null}
                  {typeof report.needsHumanReview === "boolean" ? (
                    <p style={{ margin: 0 }}>Needs Human Review: {report.needsHumanReview ? "Yes" : "No"}</p>
                  ) : null}
                </div>
              </div>
            )}

            {report.citations && report.citations.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  CITATIONS
                </strong>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.8rem", color: "#a1a1aa" }}>
                  {report.citations.map((citation) => (
                    <li key={citation.id} style={{ marginBottom: "4px" }}>
                      {citation.source} - {citation.category}
                      {citation.cveId ? ` (${citation.cveId})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .spinning { animation: spin 2s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
