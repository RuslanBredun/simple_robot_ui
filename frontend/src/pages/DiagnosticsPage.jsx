import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ValueChart } from '../components/ValueChart.jsx';
import { appendSample, chartEndAt, isFresh, telemetrySample } from '../diagnostics.js';

const SAMPLE_INTERVAL_MS = 200;
const tabs = [
  { id: 'service', label: 'Огляд' },
  { id: 'charts', label: 'Графіки' },
  { id: 'logs', label: 'Журнал' },
];
const chartTabs = [
  { id: 'axes', label: 'Осі' },
  { id: 'motors', label: 'Приводи' },
  { id: 'system', label: 'Комп’ютер' },
  { id: 'battery', label: 'Батарея' },
];
const logRanges = [
  { value: 'startup', label: 'Від запуску застосунку' },
  { value: '15m', label: '15 хвилин' },
  { value: '1h', label: '1 година' },
  { value: '6h', label: '6 годин' },
  { value: '24h', label: '24 години' },
];

function TabStrip({ items, selected, onSelect, label, className = '' }) {
  return <div className={`tab-strip ${className}`} role="tablist" aria-label={label}>
    {items.map(({ id, label: tabLabel }) =>
      <button
        key={id}
        className={`tab-button ${selected === id ? 'active' : ''}`}
        role="tab"
        aria-selected={selected === id}
        onClick={() => onSelect(id)}
      >{tabLabel}</button>
    )}
  </div>;
}

function axisLabel(name) {
  if (name.includes('camera/x_axis') || name.includes('camera_yaw')) return 'Камера · X';
  if (name.includes('camera/y_axis') || name.includes('camera_pitch')) return 'Камера · Y';
  if (name.includes('x_axis') || name.includes('yaw')) return 'Ось X';
  if (name.includes('y_axis') || name.includes('pitch')) return 'Ось Y';
  return 'Ось';
}

function makeSeries(samples, names) {
  return names.map(({ key, label }) => ({ name: label, values: samples[key] || [] }));
}

function isPercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

const stateLabels = {
  UNKNOWN: 'Невідомо',
  IDLE: 'Очікування',
  BOOTING: 'Запуск',
  CONFIGURING: 'Налаштування',
  READY: 'Готовий',
  FAULT: 'Помилка',
  STOPPED: 'Зупинений',
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
  RUNNING: 'Виконується',
  PAUSED: 'Призупинено',
  FINISHED: 'Завершено',
  COMPLETED: 'Завершено',
  FAILED: 'Не вдалося',
  PRESENT: 'Виявлений',
  HEALTHY: 'Норма',
  DEGRADED: 'Попередження',
}

function stateLabel(value) {
  return stateLabels[value] || value || 'Невідомо';
}


function statusTone(value, fresh) {
  if (!fresh) return 'unknown';
  const state = String(value || '').toUpperCase();
  if (/FAULT|ERROR|FAILED|ПОМИЛКА|НЕ ВДАЛОСЯ/.test(state)) return 'error';
  if (/DEGRADED|WARNING|PAUSED|ПОПЕРЕДЖЕННЯ/.test(state)) return 'warning';
  if (/READY|HEALTHY|COMPLETED|FINISHED|RUNNING|ГОТОВИЙ|НОРМА|ЗАВЕРШЕНО/.test(state)) return 'ok';
  return 'neutral';
}

const stateIcons = {
  UNKNOWN: '？', IDLE: '◷', BOOTING: '↻', CONFIGURING: '⚙',
  READY: '✓', FAULT: '✕', ERROR: '✕', FAILED: '✕',
  STOPPED: '■', DISABLED: '○', HOLD: '▣', MANUAL: '✥',
  POINTING: '⊕', PROCEDURE: '⚙', UNARMED: '◇', ARMING: '↗',
  ARMED: '◆', FIRING: '✦', FIRING_ROUND_COMPLETE: '✓',
  SERVICE: '⚒', NONE: '—', HOMING: '⌖', RECHARGING: '↻',
  CALIBRATING: '⚒', RUNNING: '↻', PAUSED: 'Ⅱ', FINISHED: '✓',
  COMPLETED: '✓', PRESENT: '◉', HEALTHY: '✓', DEGRADED: '!',
};
const stateTones = {
  FAULT: 'error', ERROR: 'error', FAILED: 'error',
  DEGRADED: 'warning', PAUSED: 'warning', CONFIGURING: 'warning',
  READY: 'ok', HEALTHY: 'ok', FINISHED: 'ok', COMPLETED: 'ok',
};
function StatusIcon({ state, fresh }) {
  const key = String(state || 'UNKNOWN').toUpperCase();
  const tone = !fresh ? 'unknown' : (stateTones[key] || 'neutral');
  return <span className={`status-icon status-icon-${tone}`} aria-hidden="true">{stateIcons[key] || '●'}</span>;
}

function BatteryIndicator({ percent, available }) {
  const charge = available ? Math.max(0, Math.min(100, percent)) : 0;
  const tone = !available ? 'unknown' : charge < 30 ? 'error' : charge < 70 ? 'warning' : 'ok';
  return <span className="battery-indicator" role="img"
    aria-label={available ? `Орієнтовний заряд батареї ${Math.round(charge)}%` : 'Заряд батареї недоступний'}>
    <span className="battery-cap" />
    <span className={`battery-body battery-${tone}`}>
      <span className="battery-fill" style={{ height: `${charge}%` }} />
    </span>
  </span>;
}

function StatusCard({ label, value, fresh, detail, state }) {
  return <div className="status-card">
    <label>{label}</label>
    <div className="status-value-row">
      {state !== undefined && <StatusIcon state={state} fresh={fresh} />}
      <strong>{value ?? 'Недоступно'}</strong>
    </div>
    {detail && <span className="metric-detail">{detail}</span>}
    <span className={`freshness ${fresh ? 'fresh' : ''}`}>{fresh ? 'Актуальні дані' : 'Немає актуальних даних'}</span>
  </div>;
}

function sensorLabel(name, index) {
  const normalized = name.toLowerCase();
  if (normalized.includes('imu')) return normalized.includes('base') ? 'IMU основи' : 'IMU';
  if (normalized.includes('inclinometer')) return 'Інклінометр';
  if (normalized.includes('magnetometer')) return 'Магнітометр';
  if (normalized.includes('ultrasonic') || normalized.includes('range')) return 'Далекомір';
  if (normalized.includes('camera')) return 'Камера';
  if (normalized.includes('adc')) return 'Аналоговий датчик';
  return `Датчик ${index + 1}`;
}

export function DiagnosticsPage() {
  const [tab, setTab] = useState('service');
  const [chartTab, setChartTab] = useState('axes');
  const [diagnostics, setDiagnostics] = useState(null);
  const [samples, setSamples] = useState({});
  const [status, setStatus] = useState('');
  const [logs, setLogs] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [mockMode, setMockMode] = useState(false);
  const [deviceModel, setDeviceModel] = useState('');
  const [chartsPaused, setChartsPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState(null);
  const [timeRange, setTimeRange] = useState(60);
  const [cursorRatio, setCursorRatio] = useState(null);
  const [logSearch, setLogSearch] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [logRange, setLogRange] = useState('1h');
  const [logsPaused, setLogsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logViewRef = useRef(null);
  const lastRosSampleAt = useRef({});

  useEffect(() => {
    api('health')
      .then(({ mode }) => setMockMode(mode === 'mock'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let stopped = false;
    api('info')
      .then((data) => {
        if (!stopped) setDeviceModel(data.fields?.MODEL || '');
      })
      .catch((reason) => {
        if (!stopped) setErrors((previous) => ({ ...previous, model: reason.message }));
      });
    return () => { stopped = true; };
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
          const rosSamples = [];
          const queueRosSample = (key, item, value) => {
            const sample = telemetrySample(item, value, lastRosSampleAt.current[key]);
            if (!sample) return;
            lastRosSampleAt.current[key] = sample.at;
            rosSamples.push({ key, ...sample });
          };
          for (const [name, item] of Object.entries(data.ros.motors || {})) {
            queueRosSample(`motor:${name}`, item, item.current);
            queueRosSample(`motor-voltage:${name}`, item, item.voltage);
            queueRosSample(`motor-temperature:${name}`, item, item.temperature);
          }
          for (const [name, item] of Object.entries(data.ros.joints || {})) {
            queueRosSample(`joint:${name}`, item, item.position);
            queueRosSample(
              `velocity:${name}`,
              item,
              Number.isFinite(item.velocity) ? item.velocity * 180 / Math.PI : null
            );
          }
          queueRosSample('system:battery', data.ros.battery, data.ros.battery?.voltage_v);
          queueRosSample(
            'system:battery-percent',
            data.ros.battery,
            data.ros.battery?.is_live && isPercent(data.ros.battery.charge_percent)
              ? data.ros.battery.charge_percent
              : null
          );
          setSamples((previous) => {
            let next = previous;
            for (const sample of rosSamples) {
              next = appendSample(next, sample.key, sample.value, sample.at);
            }
            next = appendSample(next, 'system:cpu', data.system?.cpu_percent);
            next = appendSample(next, 'system:memory', data.system?.memory_percent);
            next = appendSample(next, 'system:temperature', data.system?.cpu_temperature_c);
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
      const data = await api(`logs?range=${encodeURIComponent(logRange)}`);
      setLogs(data.text || '(Журнал порожній)');
      setErrors((previous) => ({ ...previous, logs: '' }));
    } catch (reason) {
      setErrors((previous) => ({ ...previous, logs: reason.message }));
    }
  }

  useEffect(() => {
    if (tab !== 'logs' || logsPaused) return undefined;
    refreshLogs();
    const timer = window.setInterval(refreshLogs, 5000);
    return () => window.clearInterval(timer);
  }, [tab, logsPaused, logRange]);

  useEffect(() => {
    if (autoScroll && logViewRef.current) {
      logViewRef.current.scrollTop = logViewRef.current.scrollHeight;
    }
  }, [logs, logSearch, logLevel, autoScroll]);

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
  const motorVoltageSeries = Object.keys(diagnostics?.motors || {}).map((name) => ({
    key: `motor-voltage:${name}`,
    label: axisLabel(name),
  }));
  const motorTemperatureSeries = Object.keys(diagnostics?.motors || {}).map((name) => ({
    key: `motor-temperature:${name}`,
    label: axisLabel(name),
  }));
  const jointSeries = Object.keys(diagnostics?.joints || {}).map((name) => ({
    key: `joint:${name}`,
    label: axisLabel(name),
  }));
  const velocitySeries = Object.keys(diagnostics?.joints || {}).map((name) => ({
    key: `velocity:${name}`,
    label: axisLabel(name),
  }));
  const motorIssues = Object.entries(diagnostics?.motors || {})
    .filter(([, item]) => isFresh(item) && (item.motor_fault_alarm || item.drive_status === 'FAULT'));
  const batteryPercent = diagnostics?.battery?.charge_percent;
  const batteryPercentAvailable = isFresh(diagnostics?.battery) &&
    diagnostics.battery.is_live && isPercent(batteryPercent);
  const powerIssues = Object.entries(diagnostics?.motors || {})
    .filter(([, item]) => isFresh(item) && item.battery_power_down_alarm);
  const sensorIssues = isFresh(diagnostics?.sensors)
    ? (diagnostics.sensors.items || [])
      .filter((item) => ['DEGRADED', 'FAILED'].includes(item.state))
    : [];
  const motorAxisGroups = new Map();
  for (const [name, item] of Object.entries(diagnostics?.motors || {})) {
    const label = axisLabel(name);
    const key = label === 'Ось' ? name : label;
    const group = motorAxisGroups.get(key) || { label, motor: null, joint: null };
    group.motor = item;
    motorAxisGroups.set(key, group);
  }
  for (const [name, item] of Object.entries(diagnostics?.joints || {})) {
    const label = axisLabel(name);
    const key = label === 'Ось' ? name : label;
    const group = motorAxisGroups.get(key) || { label, motor: null, joint: null };
    group.joint = item;
    motorAxisGroups.set(key, group);
  }
  const overviewIssueCount = motorIssues.length + powerIssues.length + sensorIssues.length;
  const activeStatus = status.match(/^\s*ACTIVE\s*:\s*(\S+)/im)?.[1]?.toLowerCase();
  const hasKnownAppStatus = ['active', 'inactive', 'failed'].includes(activeStatus);
  const appStatusLabel = activeStatus === 'active'
    ? 'Активний'
    : activeStatus === 'inactive' || activeStatus === 'failed'
      ? 'Неактивний'
      : 'Немає даних';
  const visibleLogs = logs.split('\n').filter((line) => {
    const query = logSearch.trim().toLowerCase();
    if (query && !line.toLowerCase().includes(query)) return false;
    if (logLevel === 'all') return true;
    return line.toUpperCase().includes(logLevel);
  }).join('\n');
  const currentChartEndAt = chartEndAt(chartsPaused, pausedAt);
  const chartProps = {
    timeRange,
    endAt: currentChartEndAt,
    cursorRatio,
    onCursorChange: setCursorRatio,
  };

  return <section className="panel diagnostics-panel">
    <div className="line panel-heading diagnostics-heading">
      <div><div className="tag">СТАН СИСТЕМИ</div><h2>Діагностика</h2></div>
      <div className="diagnostics-actions">
        <button className="danger" disabled={Boolean(busy) || mockMode} onClick={() => serviceAction('stop')}>
          {busy === 'stop' ? 'Зупинка…' : 'Stop'}
        </button>
        <button className="primary" disabled={Boolean(busy) || mockMode} onClick={() => serviceAction('start')}>
          {busy === 'start' ? 'Запуск…' : 'Start'}
        </button>
        <button className="primary" disabled={Boolean(busy) || mockMode} onClick={() => serviceAction('restart')}>
          {busy === 'restart' ? 'Перезапуск…' : 'Restart'}
        </button>
        <button className="download" type="button" disabled title="Функція ще не реалізована">
          Звіт
        </button>
      </div>
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
      <section className="overview-group">
        <h3>Стан підключення</h3>
        <div className="status-grid">
          <StatusCard label="Основний додаток" value={appStatusLabel} fresh={hasKnownAppStatus} />
          <StatusCard
            label="Підключення оператора"
            value={isFresh(diagnostics?.connection)
              ? diagnostics.connection.connected ? 'Підключено' : 'Відключено'
              : 'Немає даних'}
            fresh={isFresh(diagnostics?.connection)}
          />
        </div>
        {actionMessage && <p className="success" role="status">{actionMessage}</p>}
        {errors.action && <p className="error" role="alert">{errors.action}</p>}
        {errors.status && <p className="error" role="alert">{errors.status}</p>}
      </section>

      <section className="overview-group">
        <h3>Поточний стан</h3>
        <div className="status-grid">
          <div className="status-card">
            <label>Батарея</label>
            <div className="status-value-row">
              <BatteryIndicator percent={batteryPercent} available={batteryPercentAvailable} />
              <strong>{batteryPercentAvailable ? `${Math.round(batteryPercent)}%` : 'Немає даних'}</strong>
            </div>
            <span className={`freshness ${batteryPercentAvailable ? 'fresh' : ''}`}>{batteryPercentAvailable ? 'Актуальні дані' : 'Немає актуальних даних'}</span>
          </div>
          <StatusCard
            label="Режим турелі"
            state={diagnostics?.gimbal?.mode}
            value={isFresh(diagnostics?.gimbal) ? stateLabel(diagnostics.gimbal.mode) : 'Немає даних'}
            fresh={isFresh(diagnostics?.gimbal)}
          />
          <StatusCard
            label="Операція турелі"
            state={diagnostics?.gimbal?.operation_state || diagnostics?.gimbal?.operation_type}
            value={isFresh(diagnostics?.gimbal)
              ? `${stateLabel(diagnostics.gimbal.operation_type)} · ${stateLabel(diagnostics.gimbal.operation_state)}`
              : 'Немає даних'}
            fresh={isFresh(diagnostics?.gimbal)}
          />
          <StatusCard
            label="Режим зброї"
            state={diagnostics?.modes?.weapon?.mode}
            value={isFresh(diagnostics?.modes?.weapon)
              ? stateLabel(diagnostics.modes.weapon.mode)
              : 'Немає даних'}
            fresh={isFresh(diagnostics?.modes?.weapon)}
          />
          <StatusCard
            label="Операція зброї"
            state={diagnostics?.modes?.weapon?.operation_state || diagnostics?.modes?.weapon?.operation_type}
            value={isFresh(diagnostics?.modes?.weapon)
              ? `${stateLabel(diagnostics.modes.weapon.operation_type)} · ${stateLabel(diagnostics.modes.weapon.operation_state)}`
              : 'Немає даних'}
            fresh={isFresh(diagnostics?.modes?.weapon)}
          />
        </div>
        {diagnostics?.gimbal_error && <p className="muted">{diagnostics.gimbal_error}</p>}
      </section>
      {errors.ros && <p className="error" role="alert">{errors.ros}</p>}
      {!diagnostics?.available && !errors.ros &&
        <p className="muted">{diagnostics?.error || 'Очікування ROS 2…'}</p>}

      {diagnostics && <>
        <section className="overview-group">
          <h3>Приводи та осі</h3>
          <div className="status-grid">
            {[...motorAxisGroups.entries()].map(([key, { label, motor, joint }]) => {
              const freshMotor = isFresh(motor);
              const freshJoint = isFresh(joint);
              const details = [
                motor && `Струм: ${freshMotor && Number.isFinite(motor.current) ? `${motor.current.toFixed(3)} А` : '—'}`,
                motor && `Напруга: ${freshMotor && Number.isFinite(motor.voltage) ? `${motor.voltage.toFixed(2)} В` : '—'}`,
                motor && `Температура: ${freshMotor && Number.isFinite(motor.temperature) ? `${motor.temperature.toFixed(1)} °C` : '—'}`,
                joint && `Позиція: ${freshJoint && Number.isFinite(joint.position) ? `${joint.position.toFixed(3)} рад` : '—'}`,
              ].filter(Boolean).join(' · ');
              const fresh = Boolean((motor && freshMotor) || (joint && freshJoint));
              return <StatusCard
                key={key}
                label={`Привід · ${label}`}
                value={motor
                  ? freshMotor ? stateLabel(motor.drive_status) : 'Застарілі дані'
                  : freshJoint ? 'Позиція доступна' : 'Застарілі дані'}
                detail={details || 'Телеметрія недоступна'}
                fresh={fresh}
              />;
            })}
            {!motorAxisGroups.size && <p className="muted">Дані приводів та осей ще не надходять.</p>}
          </div>
        </section>

        <section className="overview-group">
          <h3>Сенсори</h3>
          {diagnostics.sensors ? <div className="status-grid">
            <StatusCard
              label="Загальний стан"
              value={isFresh(diagnostics.sensors)
                ? stateLabel(diagnostics.sensors.aggregated_state)
                : 'Немає даних'}
              fresh={isFresh(diagnostics.sensors)}
            />
            {(diagnostics.sensors.items || []).map((item, index) =>
              <StatusCard
                key={`${item.name}:${index}`}
                label={sensorLabel(item.name, index)}
                value={stateLabel(item.state)}
                fresh={isFresh(diagnostics.sensors)}
              />
            )}
          </div> : <p className="muted">{diagnostics.sensors_error || 'Статус сенсорів недоступний.'}</p>}
          {diagnostics.sensors_error && diagnostics.sensors &&
            <p className="muted">{diagnostics.sensors_error}</p>}
        </section>

      </>}

      {overviewIssueCount > 0 && <section className="issues" role="alert">
        <h3>Активні попередження та помилки</h3>
        {motorIssues.map(([name, item]) =>
          <p key={name}>{axisLabel(name)}: помилка приводу{item.alarm_code ? ` (код ${item.alarm_code})` : ''}</p>
        )}
        {powerIssues.map(([name]) =>
          <p key={`power:${name}`}>{axisLabel(name)}: активний сигнал аварії живлення</p>
        )}
        {sensorIssues.map((item, index) =>
          <p key={`${item.name}:${index}`}>{sensorLabel(item.name, index)}: {stateLabel(item.state)}</p>
        )}
      </section>}
    </>}

    {tab === 'charts' && <>
      <div className="diagnostics-subheader">
        <div className="diagnostics-subheader-title">
          <div className="tag">ТЕЛЕМЕТРІЯ</div>
          <h3>Останні {timeRange < 60 ? `${timeRange} секунд` : `${timeRange / 60} хв`}</h3>
        </div>
        <div className="actions diagnostics-subheader-actions">
          <button className="primary" onClick={() => {
            if (chartsPaused) {
              setChartsPaused(false);
              setPausedAt(null);
            } else {
              setPausedAt(Date.now());
              setChartsPaused(true);
            }
          }}>{chartsPaused ? 'Продовжити' : 'Пауза'}</button>
          <button type="button" disabled title="Функція ще не реалізована">CSV</button>
        </div>
      </div>
      <div className="diagnostics-controls chart-controls">
        <label>Період
          <select value={timeRange} onChange={(event) => setTimeRange(Number(event.target.value))}>
            <option value={30}>30 секунд</option>
            <option value={60}>1 хвилина</option>
            <option value={300}>5 хвилин</option>
            <option value={900}>15 хвилин</option>
          </select>
        </label>
      </div>
      <TabStrip
        items={chartTabs}
        selected={chartTab}
        onSelect={setChartTab}
        label="Групи графіків"
        className="chart-tabs"
      />
      {errors.ros && <p className="error" role="alert">{errors.ros}</p>}
      {errors.model && <p className="error" role="alert">Не вдалося визначити модель пристрою: {errors.model}</p>}
      {!diagnostics?.available && <p className="muted">{diagnostics?.error || 'Очікування ROS 2…'}</p>}
      {chartTab === 'axes' && !/s360/i.test(deviceModel) && <>
        <ValueChart title="Позиції осей" unit="рад" series={makeSeries(samples, jointSeries)} {...chartProps} />
        <ValueChart title="Швидкість осей" unit="°/с" series={makeSeries(samples, velocitySeries)} {...chartProps} />
      </>}
      {chartTab === 'axes' && /s360/i.test(deviceModel) &&
        <p className="muted">Графіки положення та швидкості осей приховані для S360: підтвердженого джерела й одиниць виміру немає.</p>}
      {chartTab === 'motors' && <>
        <ValueChart title="Струм моторів" unit="А" series={makeSeries(samples, motorSeries)} {...chartProps} />
        <ValueChart title="Напруга приводів" unit="В" series={makeSeries(samples, motorVoltageSeries)} {...chartProps} />
        <ValueChart title="Температура приводів" unit="°C" series={makeSeries(samples, motorTemperatureSeries)} {...chartProps} />
      </>}
      {chartTab === 'system' && <>
        <ValueChart title="Завантаження CPU" unit="%" series={makeSeries(samples, [{ key: 'system:cpu', label: 'CPU' }])} {...chartProps} />
        <ValueChart title="Використання RAM" unit="%" series={makeSeries(samples, [{ key: 'system:memory', label: 'RAM' }])} {...chartProps} />
        <ValueChart title="Температура CPU" unit="°C" series={makeSeries(samples, [{ key: 'system:temperature', label: 'CPU' }])} {...chartProps} />
      </>}
      {chartTab === 'battery' && <>
        {diagnostics?.battery && <ValueChart
          title="Напруга батареї"
          unit="В"
          series={makeSeries(samples, [{ key: 'system:battery', label: 'Батарея' }])}
          {...chartProps}
        />}
        {batteryPercentAvailable && <ValueChart
          title="Орієнтовний заряд батареї"
          unit="%"
          series={makeSeries(samples, [{ key: 'system:battery-percent', label: 'Оцінка за напругою' }])}
          {...chartProps}
        />}
        {!diagnostics?.battery && <p className="muted">Телеметрія батареї недоступна.</p>}
        {diagnostics?.battery && !batteryPercentAvailable &&
          <p className="muted">Оцінка заряду недоступна; показується лише напруга батареї.</p>}
        {diagnostics?.battery_error && <p className="muted">{diagnostics.battery_error}</p>}
      </>}
    </>}

    {tab === 'logs' && <>
      <div className="diagnostics-subheader">
        <div className="diagnostics-subheader-title">
          <div className="tag">ЖУРНАЛ СЕРВІСУ</div>
          <h3>Останні записи</h3>
        </div>
        <div className="actions diagnostics-subheader-actions log-actions">
          <button onClick={refreshLogs}>Оновити</button>
          <button onClick={() => setLogsPaused((value) => !value)}>{logsPaused ? 'Продовжити' : 'Пауза'}</button>
          <button onClick={() => setAutoScroll((value) => !value)}>{autoScroll ? 'Автоскрол: так' : 'Автоскрол: ні'}</button>
          <button type="button" disabled title="Функція ще не реалізована">Копіювати</button>
          <button type="button" disabled title="Функція ще не реалізована">Завантажити</button>
        </div>
      </div>
      <div className="diagnostics-controls log-filters">
        <label>Проміжок часу
          <select value={logRange} onChange={(event) => setLogRange(event.target.value)}>
            {logRanges.map(({ value, label }) =>
              <option key={value} value={value}>{label}</option>
            )}
          </select>
        </label>
        <label>Пошук
          <input value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Пошук у журналі" />
        </label>
        <label>Рівень
          <select value={logLevel} onChange={(event) => setLogLevel(event.target.value)}>
            <option value="all">Усі рівні</option>
            <option value="ERROR">Помилки</option>
            <option value="WARN">Попередження</option>
            <option value="INFO">Інформація</option>
          </select>
        </label>
      </div>
      {errors.logs && <p className="error" role="alert">{errors.logs}</p>}
      <pre className="logs" ref={logViewRef}>{visibleLogs || (errors.logs ? '' : 'Завантаження журналу…')}</pre>
    </>}
  </section>;
}
