import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import packageInfo from '../../package.json';

const tabs = [
  { id: 'system', label: 'Система' },
  { id: 'guide', label: 'Інструкція' },
];

const guideTabs = [
  { id: 'overview', label: 'Про виріб' },
  { id: 'antibag', label: 'Antibag' },
  { id: 'startup', label: 'Перше ввімкнення' },
  { id: 'contents', label: 'Комплектація' },
  { id: 'web', label: 'Web UI' },
  { id: 'additional', label: 'Додатково' },
];

const FIELD_LABELS = {
  MODEL: 'Модель',
  SERIAL: 'Серійний номер',
  VERSION: 'Версія ПЗ',
  'BUILD DATE': 'Дата збірки',
  'WEB UI VERSION': 'Версія Web UI',
  'WEB UI BUILD DATE': 'Дата збірки',
  'STM SOFTWARE VERSION': 'Версія ПЗ STM',
  'STM BOARD VERSION': 'Версія плати STM',
  'CAMERA MODULE VERSION': 'Версія ПЗ блоку камер',
  'CAMERA BOARD VERSION': 'Версія плати блоку камер',
};

const INFO_GROUPS = [
  {
    id: 'product',
    title: 'Пристрій та продукт',
    entries: [
      { key: 'MODEL', sources: ['MODEL'] },
      { key: 'SERIAL', sources: ['SERIAL', 'SERIAL NUMBER'] },
    ],
  },
  {
    id: 'software',
    title: 'Версії та програмне забезпечення',
    sections: [
      {
        id: 'application',
        title: 'Основний додаток',
        entries: [
          { key: 'VERSION', sources: ['VERSION', 'ROBOT VERSION', 'SOFTWARE VERSION'] },
          { key: 'BUILD DATE', sources: ['BUILD DATE', 'ROBOT BUILD DATE'] },
        ],
      },
      {
        id: 'web-ui',
        title: 'Web UI',
        entries: [
          { key: 'WEB UI VERSION', value: packageInfo.version },
          { key: 'WEB UI BUILD DATE', valueFrom: 'web_ui_build_date' },
        ],
      },
      {
        id: 'stm',
        title: 'STM',
        entries: [
          { key: 'STM SOFTWARE VERSION', sources: ['STM SOFTWARE VERSION', 'STM VERSION'] },
          { key: 'STM BOARD VERSION', sources: ['STM BOARD VERSION', 'STM HARDWARE VERSION', 'BOARD STM VERSION'] },
        ],
      },
      {
        id: 'camera',
        title: 'Блок камер',
        entries: [
          { key: 'CAMERA MODULE VERSION', sources: ['CAMERA MODULE VERSION', 'CAMERA SOFTWARE VERSION', 'CAMERA VERSION'] },
          { key: 'CAMERA BOARD VERSION', sources: ['CAMERA BOARD VERSION', 'CAMERA HARDWARE VERSION', 'CAMERA PCB VERSION', 'CAMERA BOARD REVISION'] },
        ],
      },
    ],
  },
];

function InfoCards({ fields, webUi }) {
  const normalize = (key) => key.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  const available = new Map(
    Object.entries(fields)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => [normalize(key), value])
  );
  const resolveEntries = (entries) => entries.map(({ key, sources, value, valueFrom }) => {
    const sourceValue = sources?.map(normalize).map((source) => available.get(source))
      .find((candidate) => candidate != null && candidate !== '');
    const resolvedValue = valueFrom === 'web_ui_build_date'
      ? webUi?.build_date
      : value ?? sourceValue;
    return [key, resolvedValue || 'Немає даних'];
  });
  const groups = INFO_GROUPS.map(({ id, title, entries, sections }) => ({
    id,
    title,
    entries: entries ? resolveEntries(entries) : null,
    sections: sections?.map((section) => ({
      ...section,
      entries: resolveEntries(section.entries),
    })),
  }));
  return <div className="info-groups">{groups.map(({ id, title, entries, sections }) =>
    <section className="info-group" key={id}>
      <h3>{title}</h3>
      {entries && <div className="cards">{entries.map(([key, value]) =>
        <div key={key}><label>{FIELD_LABELS[key] || key}</label><strong>{value}</strong></div>
      )}</div>}
      {sections?.map(({ id: sectionId, title: sectionTitle, entries: sectionEntries }) =>
        <section className="info-subgroup" key={sectionId}>
          <h4>{sectionTitle}</h4>
          <div className="cards">{sectionEntries.map(([key, value]) =>
            <div key={key}><label>{FIELD_LABELS[key] || key}</label><strong>{value}</strong></div>
          )}</div>
        </section>
      )}
    </section>
  )}</div>;
}

export function InfoPage() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('system');
  const [guideTab, setGuideTab] = useState('overview');

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
    <div className="line panel-heading">
      <div><div className="tag">ІНФОРМАЦІЯ ПРО ПРИСТРІЙ</div><h2>Паспорт системи</h2></div>
      <div className="actions">
        <button onClick={refresh}>Оновити</button>
        <button type="button" disabled title="Функція незабаром">Копіювати</button>
        <button type="button" disabled title="Функція незабаром">Звіт</button>
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
      <InfoCards fields={info.fields || {}} webUi={info.web_ui} />
    </>}
    {tab === 'guide' && <>
      <div className="tab-strip" role="tablist" aria-label="Інструкції">
        {guideTabs.map(({ id, label }) =>
          <button
            key={id}
            className={`tab-button ${guideTab === id ? 'active' : ''}`}
            role="tab"
            aria-selected={guideTab === id}
            onClick={() => setGuideTab(id)}
          >{label}</button>
        )}
      </div>
      <div className="guide">
        {guideTab === 'overview' && <>
          <h3>Про виріб</h3>
          <p>Система складається з основного додатку, вузлів пристрою та окремого операторського застосунку. Поточну доступність додатку й підключення оператора показано в «Діагностика» → «Огляд».</p>
          <p className="muted">Затвердженого опису виробу та його призначення в цьому пакеті документації немає.</p>
        </>}
        {guideTab === 'antibag' && <>
          <h3>Операторський застосунок Antibag</h3>
          <p>Antibag є окремим операторським застосунком. Web UI показує лише факт підключення оператора та діагностичний стан системи.</p>
          <p className="muted">Інструкцію керування та безпечної експлуатації Antibag потрібно отримати з затвердженого керівництва оператора.</p>
        </>}
        {guideTab === 'startup' && <>
          <h3>Перше ввімкнення</h3>
          <p>Дотримуйтеся затвердженої процедури запуску для конкретної моделі пристрою.</p>
          <p>Після запуску Web UI можна використовувати для перевірки стану основного додатку, підключення оператора, режимів, сенсорів і журналу.</p>
          <p className="muted">Послідовність підключення живлення та запуску вузлів тут не наведена: потрібна затверджена інструкція виробу.</p>
        </>}
        {guideTab === 'contents' && <>
          <h3>Комплектація</h3>
          <p className="muted">Перелік комплектації залежить від моделі й не визначений у доступній документації. Перевіряйте комплект за паспортом і пакувальним листом конкретного виробу.</p>
        </>}
        {guideTab === 'web' && <>
          <h3>Сервісний Web UI</h3>
          <ul>
            <li>«Огляд» показує активність основного додатку, підключення оператора, поточні режими, осі та сенсори.</li>
            <li>«Графіки» показують доступну телеметрію з частотою 5 Гц; можна змінювати діапазон і ставити графіки на паузу.</li>
            <li>«Журнал» підтримує вибір періоду, пошук, фільтр рівня, паузу оновлення й автопрокрутку.</li>
            <li>Web UI призначений для локального моніторингу та діагностики; він не замінює керівництво оператора.</li>
          </ul>
        </>}
        {guideTab === 'additional' && <>
          <h3>Інтеграції, підтримка та зовнішні модулі</h3>
          <p>Склад зовнішніх модулів визначається конфігурацією та комплектацією пристрою. У Web UI доступні лише ті стани, для яких надходять діагностичні дані.</p>
          <p className="muted">Підтвердженого переліку інтеграцій, контактів підтримки та правил обслуговування в цьому пакеті документації немає.</p>
        </>}
      </div>
    </>}
  </section>;
}
