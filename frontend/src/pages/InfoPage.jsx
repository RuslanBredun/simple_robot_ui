import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import packageInfo from '../../package.json';

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
  'WEB UI VERSION': 'Версія Web UI',
  HOSTNAME: 'Ім’я пристрою',
  'OPERATING SYSTEM': 'Операційна система',
  ARCHITECTURE: 'Архітектура процесора',
  NETWORK: 'Мережа',
  'NETWORK INTERFACES': 'IP-адреси та інтерфейси',
  OS_NAME: 'Операційна система',
};

function InfoCards({ fields }) {
  const entries = Object.entries(fields).filter(([, value]) => value != null && value !== '').map(([label, value]) => [
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
      <div className="actions">
        <button onClick={refresh}>Оновити</button>
        <button type="button" disabled title="Функція ще не реалізована">Копіювати — незабаром</button>
        <button type="button" disabled title="Функція ще не реалізована">Звіт — незабаром</button>
      </div>
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
      <InfoCards fields={{
        ...info.fields,
        'WEB UI VERSION': packageInfo.version,
        HOSTNAME: info.host?.hostname,
        'OPERATING SYSTEM': info.host?.os_name,
        ARCHITECTURE: info.host?.architecture,
        'NETWORK INTERFACES': info.host?.network_interfaces
          ?.map(({ name, ipv4_address }) => `${name}: ${ipv4_address}`)
          .join(', '),
      }} />
      {info.host?.errors && Object.entries(info.host.errors).map(([field, message]) =>
        <p className="muted" key={field}>{FIELD_LABELS[field.toUpperCase()] || field}: {message}</p>
      )}
      <p className="muted">Джерело: {info.source}. Показано доступні дані, надані системою.</p>
    </>}
    {tab === 'guide' && <div className="guide">
      <h3>Про систему</h3>
      <p>Операторський застосунок є окремою частиною системи. Його підключення можна перевірити у вкладці «Діагностика» → «Огляд».</p>
      <p>STM-юніт є частиною системи, а не операторським застосунком. Його точні функції та процедури першого запуску тут не описані, бо для цього потрібна підтверджена документація.</p>
      <h3>Сервісний Web UI</h3>
      <ol>
        <li>У вкладці <b>Діагностика</b> → <b>Огляд</b> перевірте стан robot runtime, підключення операторського застосунку та доступність телеметрії.</li>
        <li>В Огляді також доступні статуси приводів і сенсорів та системні показники комп’ютера: CPU, RAM, температура, накопичувач і час роботи.</li>
        <li>У вкладці <b>Графіки</b> перегляньте позиції, швидкість осей, струм моторів і системні показники. Значення струму показуються в амперах; графіки оновлюються 5 разів на секунду.</li>
        <li>На графіках можна вибрати часовий діапазон, призупинити прокручування та навести курсор для точного значення й часу.</li>
        <li>У вкладці <b>Журнал</b> шукайте записи, фільтруйте їх за рівнем, призупиняйте автооновлення та керуйте автопрокруткою.</li>
        <li>У розділі <b>Огляд</b> доступні команди Start, Stop і Restart для robot runtime. Кожна потребує підтвердження; Stop зупиняє програму, а не є аварійним вимкненням пристрою.</li>
      </ol>
      <p className="muted">Web UI працює окремо від robot runtime і доступний лише локально. Налаштування приводів та керування роботом у Basic недоступні. Інструкції з першого ввімкнення самого виробу потрібно доповнити за його офіційною документацією.</p>
      <p className="muted">Попередження Web UI: оцінений заряд батареї ≤20 %, температура CPU ≥80 °C, або вільно &lt;10 % системного диска. Пороги CPU та диска є локальними значеннями UI, а не лімітами виробника.</p>
    </div>}
  </section>;
}
