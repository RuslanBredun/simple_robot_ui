import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const pages = ['Info', 'Diagnostics', 'Settings', 'Control'];
async function api(path, options) {
  const response = await fetch('/api/' + path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function App() {
  const [page, setPage] = useState('Diagnostics');
  const [state, setState] = useState('checking');
  const [logs, setLogs] = useState('Loading logs...');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const [status, journal] = await Promise.all([api('status'), api('logs')]);
      setState(status.state);
      setLogs(journal.logs || '(No journal entries)');
      setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => {
    if (page !== 'Diagnostics') return;
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [page]);
  async function action(name) {
    if (!confirm('Execute ' + name + ' on turret.service?')) return;
    setBusy(true);
    try {
      await api(name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="shell">
    <aside className="nav"><div className="brand">ROBOT <span>UI</span></div><div className="sub">LOCAL MAINTENANCE · v0.2</div>
      <nav>{pages.map(p => <button className={p === page ? 'selected' : ''} key={p} onClick={() => setPage(p)}>{p}{(p === 'Settings' || p === 'Control') && <small>Extended</small>}</button>)}</nav>
      <div className="bottom">Offline-first · localhost only</div>
    </aside>
    <main><header><div><div className="eyebrow">MAINTENANCE CONSOLE</div><h1>{page}</h1></div><div className="meta">turret.service <span className={state === 'active' ? 'dot ok' : 'dot'}></span> {state}</div></header>
      {page === 'Info' && <section className="panel"><div className="tag">PRODUCT OVERVIEW · PLACEHOLDER</div><h2>Robot service interface</h2><p>This is a local maintenance application for product identification, service documentation, software and module firmware inventories, and diagnostics.</p><div className="cards"><div><label>PRODUCT</label><strong>Robot / Turret platform</strong></div><div><label>UI VERSION</label><strong>0.2.0 (MVP)</strong></div><div><label>BACKEND</label><strong>Python · standard library</strong></div><div><label>RUNTIME</label><strong>turret.service</strong></div></div><p className="muted">Actual model, serial number, hardware composition and firmware versions will be connected via existing QA tools.</p></section>}
      {page === 'Diagnostics' && <><section className="panel toolbar"><div><div className="tag">SYSTEM SERVICE</div><h2>turret.service</h2><p>Current state: <b>{state}</b></p></div><div className="actions"><button disabled={busy} onClick={() => action('stop')}>Stop</button><button className="primary" disabled={busy} onClick={() => action('restart')}>Restart</button></div></section><section className="panel"><div className="line"><div><div className="tag">JOURNALCTL</div><h2>Recent logs</h2></div><button onClick={refresh}>Refresh</button></div><p className="muted">Last 200 lines · refresh every 2.5 s</p><pre className="logs">{logs}</pre></section>{error && <p className="error">{error}</p>}</>}
      {(page === 'Settings' || page === 'Control') && <section className="panel"><div className="tag">EXTENDED EDITION</div><h2>{page} — planned</h2><p>This page is a placeholder. No parameter editing or operating controls have been enabled in this MVP.</p></section>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
