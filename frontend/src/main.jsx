import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { DiagnosticsPage } from './pages/DiagnosticsPage.jsx';
import { InfoPage } from './pages/InfoPage.jsx';
import { ControlPage } from './pages/ControlPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import './style.css';

const pages = [
  { id: 'Info', label: 'Інформація' },
  { id: 'Diagnostics', label: 'Діагностика' },
  { id: 'Settings', label: 'Налаштування' },
  { id: 'Control', label: 'Керування' },
];

const pageLabels = Object.fromEntries(pages.map(({ id, label }) => [id, label]));

function App() {
  const [page, setPage] = useState('Diagnostics');
  const [auth, setAuth] = useState('loading');

  useEffect(() => {
    let active = true;
    api('auth/session').then(data => { if (active) setAuth(data.authenticated ? 'yes' : 'no'); })
      .catch(() => { if (active) setAuth('no'); });
    const expired = () => setAuth('no');
    window.addEventListener('turret-auth-expired', expired);
    return () => { active = false; window.removeEventListener('turret-auth-expired', expired); };
  }, []);

  async function logout() {
    try { await api('auth/logout', { method: 'POST' }); } finally { setAuth('no'); }
  }
  const [mock, setMock] = useState(false);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    if (auth !== 'yes') return;
    api('health')
      .then(({ mode }) => {
        setMock(mode === 'mock');
        setHealthError('');
      })
      .catch((reason) => setHealthError(reason.message));
  }, [auth]);

  if (auth === 'loading') return <div className="auth-screen">Перевірка сесії…</div>;
  if (auth !== 'yes') return <LoginPage onLogin={() => setAuth('yes')} />;

  return <div className="shell">
    <aside className="nav">
      <div className="brand">ROBOT <span>UI</span></div>
      <div className="sub">ЛОКАЛЬНЕ ОБСЛУГОВУВАННЯ · v0.5</div>
      <nav aria-label="Головна навігація">{pages.map(({ id, label }) =>
        <button
          className={id === page ? 'selected' : ''}
          key={id}
          onClick={() => setPage(id)}
          aria-current={id === page ? 'page' : undefined}
        >
          {label}
          {id === 'Settings' && <small>Extended</small>}
        </button>
      )}</nav>
      <div className="bottom">Basic · лише читання · localhost</div>
    </aside>
    <main>
      <header>
        <div><div className="eyebrow">КОНСОЛЬ ОБСЛУГОВУВАННЯ</div><h1>{pageLabels[page]}</h1></div>
        <div className="meta">Basic · лише читання <button onClick={logout}>Вийти</button></div>
      </header>
      <div className="page-content">
        {mock && <div className="mock-banner" role="status">РЕЖИМ MOCK — синтетичні дані для розробки, не телеметрія робота</div>}
        {healthError && <p className="error" role="alert">Помилка перевірки backend: {healthError}</p>}
        {page === 'Info' && <InfoPage />}
        {page === 'Diagnostics' && <DiagnosticsPage />}
        {page === 'Control' && <ControlPage />}
        {page === 'Settings' && <section className="panel">
          <div className="tag">РОЗШИРЕНА ВЕРСІЯ</div>
          <h2>{pageLabels[page]} — недоступно у Basic</h2>
          <p>Ця сторінка недоступна в поточній версії.</p>
        </section>}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
