import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { DiagnosticsPage } from './pages/DiagnosticsPage.jsx';
import { InfoPage } from './pages/InfoPage.jsx';
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
  const [mock, setMock] = useState(false);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    api('health')
      .then(({ mode }) => {
        setMock(mode === 'mock');
        setHealthError('');
      })
      .catch((reason) => setHealthError(reason.message));
  }, []);

  return <div className="shell">
    <aside className="nav">
      <div className="brand">ROBOT <span>UI</span></div>
      <div className="sub">ЛОКАЛЬНЕ ОБСЛУГОВУВАННЯ · v0.4</div>
      <nav aria-label="Головна навігація">{pages.map(({ id, label }) =>
        <button
          className={id === page ? 'selected' : ''}
          key={id}
          onClick={() => setPage(id)}
          aria-current={id === page ? 'page' : undefined}
        >
          {label}
          {(id === 'Settings' || id === 'Control') && <small>Extended</small>}
        </button>
      )}</nav>
      <div className="bottom">Basic · лише читання · localhost</div>
    </aside>
    <main>
      <header>
        <div><div className="eyebrow">КОНСОЛЬ ОБСЛУГОВУВАННЯ</div><h1>{pageLabels[page]}</h1></div>
        <div className="meta">Basic · лише читання</div>
      </header>
      {mock && <div className="mock-banner" role="status">РЕЖИМ MOCK — синтетичні дані для розробки, не телеметрія робота</div>}
      {healthError && <p className="error" role="alert">Помилка перевірки backend: {healthError}</p>}
      {page === 'Info' && <InfoPage />}
      {page === 'Diagnostics' && <DiagnosticsPage />}
      {(page === 'Settings' || page === 'Control') && <section className="panel">
        <div className="tag">РОЗШИРЕНА ВЕРСІЯ</div>
        <h2>{pageLabels[page]} — недоступно у Basic</h2>
        <p>Ця сторінка недоступна в поточній версії.</p>
      </section>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
