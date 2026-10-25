import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const tabs = [
  { id: 'system', label: 'Система' },
  { id: 'guide', label: 'Інструкція' },
];

const FIELD_LABELS = {
  VERSION: 'Версія ПЗ',
  MODEL: 'Модель',
  'BUILD DATE': 'Дата збірки',
  SERIAL: 'Серійний номер',
  'MAC ETH0': 'MAC-адреса Ethernet',
  'ROBOT SERVICE': 'Стан robot runtime',
  PACKAGE: 'Пакет',
  'PKG STATUS': 'Стан пакета',
};

function InfoCards({ fields }) {
  const entries = Object.entries(fields).map(([label, value]) => [
    FIELD_LABELS[label] || label,
    value,
  ]);
  if (!entries.length) {
    return <p className="muted">Команда turret-info не повернула даних.</p>;
  }
  return <div className="cards">{entries.map(([label, value]) =>
    <div key={label}><label>{label}</label><strong>{value ?? 'Невідомо'}</strong></div>
  )}</div>;
}

export function InfoPage() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('system');

  async function refresh() {
    try {
      setInfo(await api('info'));
      setError('');
    } catch (reason) {
      setError(reason.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  return <section className="panel info-panel">
    <div className="line">
      <div><div className="tag">ІНФОРМАЦІЯ ПРО ПРИСТРІЙ</div><h2>Паспорт системи</h2></div>
      <button onClick={refresh}>Оновити</button>
    </div>
    <div className="tab-strip" role="tablist" aria-label="Розділи інформації">
      {tabs.map(({ id, label }) =>
        <button
          key={id}
          className={`tab-button ${tab === id ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
        >{label}</button>
      )}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {!info && !error && <p className="muted">Завантаження інформації…</p>}
    {info && tab === 'system' && <>
      <InfoCards fields={info.fields} />
      <p className="muted">Джерело: {info.source}. Показано доступні дані, надані системою.</p>
    </>}
    {tab === 'guide' && <div className="guide">
      <h3>Коротка інструкція</h3>
      <ol>
        <li>У вкладці <b>Діагностика</b> перевірте стан robot runtime і доступність телеметрії.</li>
        <li>На вкладці <b>Графіки</b> перегляньте позиції осей і показники струму. Якщо дані застарілі або недоступні, перевірте сервіс і з’єднання.</li>
        <li>На вкладці <b>Логи</b> перегляньте останні записи журналу та оновіть їх перед створенням звіту.</li>
        <li>На вкладці <b>Сервіс</b> доступні команди Start, Stop і Restart. Кожна потребує підтвердження; Stop зупиняє robot runtime.</li>
        <li>Щоб передати діагностику, завантажте JSON-звіт. Перед надсиланням перевірте його: він містить ідентифікатори пристрою та останні журнали.</li>
      </ol>
      <p className="muted">Web UI працює окремо від robot runtime і доступний лише локально. Налаштування приводів та керування роботом у Basic недоступні.</p>
    </div>}
  </section>;
}
