import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ValueChart } from '../components/ValueChart.jsx';

const SAMPLE_INTERVAL_MS = 200;
const MAX_SAMPLES = 300;
const tabs = [
  { id: 'service', label: 'Сервіс' },
  { id: 'charts', label: 'Графіки' },
  { id: 'logs', label: 'Журнал' },
];

function axisLabel(name) {
  if (name.includes('camera/x_axis') || name.includes('camera_yaw')) return 'Камера · X';
  if (name.includes('camera/y_axis') || name.includes('camera_pitch')) return 'Камера · Y';
  if (name.includes('x_axis') || name.includes('yaw')) return 'Ось X';
  if (name.includes('y_axis') || name.includes('pitch')) return 'Ось Y';
  return 'Ось';
}

function appendSample(previous, name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return previous;
  const values = [...(previous[name] || []), { at: Date.now(), value }].slice(-MAX_SAMPLES);
  return { ...previous, [name]: values };
}

function makeSeries(samples, names) {
  return names.map(({ key, label }) => ({ name: label, values: samples[key] || [] }));
}

function isFresh(item) {
  return item && item.age_seconds <= 2;
}

const stateLabels = {
  UNKNOWN: 'Невідомо',
  DISABLED: 'Вимкнено',
  HOLD: 'Утримання',
  MANUAL: 'Ручний режим',
  POINTING: 'Наведення',
  PROCEDURE: 'Процедура',
  UNARMED: 'Не зведено',
  ARMING: 'Зведення',
  ARMED: 'Зведено',
  FIRING: 'Постріл',
  FIRING_ROUND_COMPLETE: 'Постріл завершено',
  ERROR: 'Помилка',
  SERVICE: 'Обслуговування',
  NONE: 'Немає',
  HOMING: 'Калібрування осей',
  RECHARGING: 'Перезаряджання',
  CALIBRATING: 'Калібрування',
  IDLE: 'Очікування',
  RUNNING: 'Виконується',
  PAUSED: 'Призупинено',
  STOPPED: 'Зупинено',
  FINISHED: 'Завершено',
  COMPLETED: 'Завершено',
  FAILED: 'Не вдалося',
};

function stateLabel(value) {
  return stateLabels[value] || value || 'Невідомо';
}

function StatusCard({ label, value, fresh }) {
  return <div className="status-card">
    <label>{label}</label>
    <strong>{value ?? 'Недоступно'}</strong>
    <span className={`freshness ${fresh ? 'fresh' : ''}`}>{fresh ? 'Актуальні дані' : 'Немає актуальних даних'}</span>
  </div>;
}

export function DiagnosticsPage() {
  const [tab, setTab] = useState('service');
  const [diagnostics, setDiagnostics] = useState(null);
  const [samples, setSamples] = useState({});
  const [status, setStatus] = useState('');
  const [logs, setLogs] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [logSource, setLogSource] = useState('');
  const [mockMode, setMockMode] = useState(false);

  useEffect(() => {
    api('health')
      .then(({ mode }) => setMockMode(mode === 'mock'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;
    async function poll() {
      if (stopped) return;
      const started = Date.now();
      try {
        const data = await api('diagnostics');
        if (!stopped) {
          setDiagnostics(data.ros);
          setErrors((previous) => ({ ...previous, ros: '' }));
          setSamples((previous) => {
            let next = previous;
            for (const [name, item] of Object.entries(data.ros.motors || {})) {
              next = appendSample(next, `motor:${name}`, item.current);
            }
            for (const [name, item] of Object.entries(data.ros.joints || {})) {
              next = appendSample(next, `joint:${name}`, item.position);
            }
            return next;
          });
        }
      } catch (reason) {
        if (!stopped) setErrors((previous) => ({ ...previous, ros: reason.message }));
      }
      if (!stopped) {
        timer = window.setTimeout(poll, Math.max(0, SAMPLE_INTERVAL_MS - (Date.now() - started)));
      }
    }
    poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    async function refreshStatus() {
      try {
        const data = await api('status');
        if (!stopped) {
          setStatus(data.text);
          setErrors((previous) => ({ ...previous, status: '' }));
        }
      } catch (reason) {
        if (!stopped) setErrors((previous) => ({ ...previous, status: reason.message }));
      }
    }
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  async function refreshLogs() {
    try {
      const data = await api('logs');
      setLogs(data.text || '(Журнал порожній)');
      setLogSource(data.source);
      setErrors((previous) => ({ ...previous, logs: '' }));
    } catch (reason) {
      setErrors((previous) => ({ ...previous, logs: reason.message }));
    }
  }

  useEffect(() => {
    if (tab !== 'logs') return undefined;
    refreshLogs();
    const timer = window.setInterval(refreshLogs, 5000);
    return () => window.clearInterval(timer);
  }, [tab]);

  async function serviceAction(action) {
    const confirmations = {
      start: 'Запустити robot runtime?',
      stop: 'Зупинити robot runtime? Робот припинить роботу.',
      restart: 'Перезапустити robot runtime? Під час перезапуску керування роботом буде недоступне.',
    };
    if (!window.confirm(confirmations[action])) return;
    setBusy(action);
    setActionMessage('');
    try {
      await api(action, { method: 'POST' });
      const messages = {
        start: 'Команду запуску прийнято.',
        stop: 'Команду зупинки прийнято.',
        restart: 'Команду перезапуску прийнято.',
      };
      setActionMessage(messages[action]);
      window.setTimeout(() => {
        api('status').then((data) => setStatus(data.text)).catch((reason) =>
          setErrors((previous) => ({ ...previous, status: reason.message }))
        );
      }, 1500);
    } catch (reason) {
      setActionMessage('');
      setErrors((previous) => ({ ...previous, action: reason.message }));
    } finally {
      setBusy('');
    }
  }

  const motorSeries = Object.keys(diagnostics?.motors || {}).map((name) => ({
    key: `motor:${name}`,
    label: axisLabel(name),
  }));
  const jointSeries = Object.keys(diagnostics?.joints || {}).map((name) => ({
    key: `joint:${name}`,
    label: axisLabel(name),
  }));
  const hasTelemetry = diagnostics &&
    (Object.keys(diagnostics.motors || {}).length ||
      Object.keys(diagnostics.joints || {}).length ||
      Object.keys(diagnostics.modes || {}).length ||
      diagnostics.connection?.received_at ||
      diagnostics.gimbal);

  return <section className="panel diagnostics-panel">
    <div className="line diagnostics-heading">
      <div><div className="tag">СТАН СИСТЕМИ</div><h2>Діагностика</h2></div>
      <a className="download" href="/api/diagnostics/export">Завантажити звіт</a>
    </div>
    <div className="tab-strip" role="tablist" aria-label="Вкладки діагностики">
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

    {tab === 'service' && <>
      <div className="line service-title">
        <div><div className="tag">ROBOT RUNTIME</div><h3>turret.service</h3></div>
        <div className="service-actions">
          <button className="danger" disabled={Boolean(busy) || mockMode} onClick={() => serviceAction('stop')}>
            {busy === 'stop' ? 'Зупинка…' : 'Stop'}
          </button>
          <button className="primary" disabled={Boolean(busy) || mockMode} onClick={() => serviceAction('start')}>
            {busy === 'start' ? 'Запуск…' : 'Start'}
          </button>
          <button className="primary" disabled={Boolean(busy) || mockMode} onClick={() => serviceAction('restart')}>
            {busy === 'restart' ? 'Перезапуск…' : 'Restart'}
          </button>
        </div>
      </div>
      <p className="muted">Команди керують лише `turret.service`; кожна потребує підтвердження.</p>
      {mockMode && <p className="muted">У режимі розробки керування реальним сервісом вимкнено.</p>}
      {actionMessage && <p className="success" role="status">{actionMessage}</p>}
      {errors.action && <p className="error" role="alert">{errors.action}</p>}
      {errors.status && <p className="error" role="alert">{errors.status}</p>}
      <pre className="status-output">{status || 'Завантаження стану сервісу…'}</pre>
      <div className="line telemetry-title">
        <div><div className="tag">ROS 2</div><h3>Поточний стан</h3></div>
        <span className="muted">Оновлення: 5 Гц</span>
      </div>
      {errors.ros && <p className="error" role="alert">{errors.ros}</p>}
      {!diagnostics?.available && !errors.ros &&
        <p className="muted">{diagnostics?.error || 'Очікування ROS 2…'}</p>}
      {diagnostics && <div className="status-grid">
        <StatusCard
          label="З’єднання керування"
          value={isFresh(diagnostics.connection)
            ? diagnostics.connection.connected ? 'Активне' : 'Неактивне'
            : 'Немає даних'}
          fresh={isFresh(diagnostics.connection)}
        />
        <StatusCard
          label="Режим башти"
          value={isFresh(diagnostics.gimbal) ? stateLabel(diagnostics.gimbal.mode) : 'Немає даних'}
          fresh={isFresh(diagnostics.gimbal)}
        />
        <StatusCard
          label="Операція башти"
          value={isFresh(diagnostics.gimbal)
            ? `${stateLabel(diagnostics.gimbal.operation_type)} · ${stateLabel(diagnostics.gimbal.operation_state)}`
            : 'Немає даних'}
          fresh={isFresh(diagnostics.gimbal)}
        />
        {Object.entries(diagnostics.motors || {}).map(([name, item]) =>
          <StatusCard key={name} label={`${axisLabel(name)} · струм`} value={isFresh(item) ? item.current ?? '—' : 'Застарілі дані'} fresh={isFresh(item)} />
        )}
        {Object.entries(diagnostics.joints || {}).map(([name, item]) =>
          <StatusCard key={name} label={`${axisLabel(name)} · позиція`} value={isFresh(item) ? `${Number(item.position).toFixed(3)} рад` : 'Застарілі дані'} fresh={isFresh(item)} />
        )}
        {Object.entries(diagnostics.modes || {}).map(([name, item]) =>
          <StatusCard
            key={name}
            label={name === 'weapon' ? 'Режим зброї' : 'Режим руху'}
            value={isFresh(item)
              ? `${stateLabel(item.mode)}${item.operation_type && item.operation_type !== 'NONE'
                ? ` · ${stateLabel(item.operation_type)}: ${stateLabel(item.operation_state)}`
                : ''}`
              : 'Застарілі дані'}
            fresh={isFresh(item)}
          />
        )}
        {!hasTelemetry && <p className="muted">Дані ще не надходять.</p>}
      </div>}
      {diagnostics?.gimbal_error && <p className="muted">{diagnostics.gimbal_error}</p>}
    </>}

    {tab === 'charts' && <>
      <div className="chart-intro">
        <div className="tag">ТЕЛЕМЕТРІЯ · ОСТАННІ 60 СЕКУНД</div>
        <p className="muted">Дані оновлюються з частотою 5 Гц. Показано лише доступні осі.</p>
      </div>
      {errors.ros && <p className="error" role="alert">{errors.ros}</p>}
      {!diagnostics?.available && <p className="muted">{diagnostics?.error || 'Очікування ROS 2…'}</p>}
      <ValueChart title="Струм моторів" unit="raw CANopen" series={makeSeries(samples, motorSeries)} />
      <ValueChart title="Позиції осей" unit="рад" series={makeSeries(samples, jointSeries)} />
      {diagnostics?.available && !motorSeries.length && !jointSeries.length &&
        <p className="muted">Немає даних осей для графіків.</p>}
    </>}

    {tab === 'logs' && <>
      <div className="line">
        <div><div className="tag">ЖУРНАЛ СЕРВІСУ · {logSource || 'TURRET-LOGS'}</div><h3>Останні записи</h3></div>
        <button onClick={refreshLogs}>Оновити</button>
      </div>
      <p className="muted">Останні 100 рядків · оновлення кожні 5 секунд</p>
      {errors.logs && <p className="error" role="alert">{errors.logs}</p>}
      <pre className="logs">{logs || (errors.logs ? '' : 'Завантаження журналу…')}</pre>
    </>}
  </section>;
}
