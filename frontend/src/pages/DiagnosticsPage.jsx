import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ValueChart } from '../components/ValueChart.jsx';

const SAMPLE_INTERVAL_MS = 200;
const MAX_SAMPLES = 4500;
const tabs = [
  { id: 'service', label: 'Огляд' },
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

function StatusCard({ label, value, fresh, detail }) {
  return <div className="status-card">
    <label>{label}</label>
    <strong>{value ?? 'Недоступно'}</strong>
    {detail && <span className="metric-detail">{detail}</span>}
    <span className={`freshness ${fresh ? 'fresh' : ''}`}>{fresh ? 'Актуальні дані' : 'Немає актуальних даних'}</span>
  </div>;
}

function MetricCard({ label, value, detail, error }) {
  return <div className="status-card">
    <label>{label}</label>
    <strong>{value ?? 'Недоступно'}</strong>
    {detail && <span className="metric-detail">{detail}</span>}
    {error && <span className="metric-error">{error}</span>}
  </div>;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} д ${hours} год` : `${hours} год ${minutes} хв`;
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
  const [diagnostics, setDiagnostics] = useState(null);
  const [system, setSystem] = useState(null);
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
  const [cursorAt, setCursorAt] = useState(null);
  const [logSearch, setLogSearch] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [logsPaused, setLogsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logViewRef = useRef(null);

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
          setSystem(data.system);
          setErrors((previous) => ({ ...previous, ros: '' }));
          setSamples((previous) => {
            let next = previous;
            for (const [name, item] of Object.entries(data.ros.motors || {})) {
              next = appendSample(next, `motor:${name}`, item.current);
              next = appendSample(next, `motor-voltage:${name}`, item.voltage);
              next = appendSample(next, `motor-temperature:${name}`, item.temperature);
            }
            for (const [name, item] of Object.entries(data.ros.joints || {})) {
              next = appendSample(next, `joint:${name}`, item.position);
              next = appendSample(
                next,
                `velocity:${name}`,
                Number.isFinite(item.velocity) ? item.velocity * 180 / Math.PI : null
              );
            }
            next = appendSample(next, 'system:cpu', data.system?.cpu_percent);
            next = appendSample(next, 'system:memory', data.system?.memory_percent);
            next = appendSample(next, 'system:temperature', data.system?.cpu_temperature_c);
            next = appendSample(
              next,
              'system:battery',
              data.ros.battery?.age_seconds <= 2 ? data.ros.battery.voltage_v : null
            );
            next = appendSample(
              next,
              'system:battery-percent',
              data.ros.battery?.age_seconds <= 2 &&
                data.ros.battery.is_live &&
                isPercent(data.ros.battery.charge_percent)
                ? data.ros.battery.charge_percent
                : null
            );
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
  }, [tab, logsPaused]);

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
  const hasTelemetry = diagnostics &&
    (Object.keys(diagnostics.motors || {}).length ||
      Object.keys(diagnostics.joints || {}).length ||
      Object.keys(diagnostics.modes || {}).length ||
      diagnostics.connection?.received_at ||
      diagnostics.gimbal ||
      diagnostics.battery ||
      diagnostics.sensors);
  const motorIssues = Object.entries(diagnostics?.motors || {})
    .filter(([, item]) => isFresh(item) && (item.motor_fault_alarm || item.drive_status === 'FAULT'));
  const batteryPercent = diagnostics?.battery?.charge_percent;
  const batteryPercentAvailable = isFresh(diagnostics?.battery) &&
    diagnostics.battery.is_live && isPercent(batteryPercent);
  const batteryIssue = batteryPercentAvailable && batteryPercent <= 20;
  const systemIssues = [];
  if (Number.isFinite(system?.cpu_temperature_c) && system.cpu_temperature_c >= 80) {
    systemIssues.push('Температура CPU досягла 80 °C');
  }
  const diskFreePercent = Number.isFinite(system?.disk_total_bytes) &&
    system.disk_total_bytes > 0 && Number.isFinite(system?.disk_free_bytes)
    ? system.disk_free_bytes / system.disk_total_bytes * 100
    : null;
  if (diskFreePercent !== null && diskFreePercent < 10) {
    systemIssues.push('Вільно менше 10 % місця на системному диску');
  }
  const powerIssues = Object.entries(diagnostics?.motors || {})
    .filter(([, item]) => isFresh(item) && item.battery_power_down_alarm);
  const sensorIssues = isFresh(diagnostics?.sensors)
    ? (diagnostics.sensors.items || [])
      .filter((item) => ['DEGRADED', 'FAILED'].includes(item.state))
    : [];
  const visibleLogs = logs.split('\n').filter((line) => {
    const query = logSearch.trim().toLowerCase();
    if (query && !line.toLowerCase().includes(query)) return false;
    if (logLevel === 'all') return true;
    return line.toUpperCase().includes(logLevel);
  }).join('\n');
  const chartEndAt = chartsPaused && pausedAt ? pausedAt : Date.now();
  const chartProps = {
    timeRange,
    endAt: chartEndAt,
    cursorAt,
    onCursorChange: setCursorAt,
  };

  return <section className="panel diagnostics-panel">
    <div className="line diagnostics-heading">
      <div><div className="tag">СТАН СИСТЕМИ</div><h2>Діагностика</h2></div>
      <button className="download" type="button" disabled title="Функція ще не реалізована">
        Звіт — незабаром
      </button>
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
          label="Підключення операторського застосунку"
          value={isFresh(diagnostics.connection)
            ? diagnostics.connection.connected ? 'Підключено' : 'Відключено'
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
          <StatusCard
            key={`health:${name}`}
            label={`${axisLabel(name)} · стан приводу`}
            value={isFresh(item) ? stateLabel(item.drive_status) : 'Застарілі дані'}
            fresh={isFresh(item)}
          />
        )}
        {Object.entries(diagnostics.motors || {}).map(([name, item]) =>
          <StatusCard
            key={name}
            label={`${axisLabel(name)} · струм`}
            value={isFresh(item)
              ? Number.isFinite(item.current) ? `${item.current.toFixed(3)} А` : '—'
              : 'Застарілі дані'}
            fresh={isFresh(item)}
          />
        )}
        {Object.entries(diagnostics.motors || {}).map(([name, item]) =>
          <StatusCard
            key={`temperature:${name}`}
            label={`${axisLabel(name)} · температура приводу`}
            value={isFresh(item) && Number.isFinite(item.temperature)
              ? `${item.temperature.toFixed(1)} °C`
              : 'Немає актуальних даних'}
            fresh={isFresh(item) && Number.isFinite(item.temperature)}
          />
        )}
        {Object.entries(diagnostics.motors || {}).map(([name, item]) =>
          <StatusCard
            key={`voltage:${name}`}
            label={`${axisLabel(name)} · напруга приводу`}
            value={isFresh(item) && Number.isFinite(item.voltage)
              ? `${item.voltage.toFixed(2)} В`
              : 'Немає актуальних даних'}
            fresh={isFresh(item) && Number.isFinite(item.voltage)}
          />
        )}
        {diagnostics.battery ? <StatusCard
          label="Основна батарея"
          value={isFresh(diagnostics.battery) && Number.isFinite(diagnostics.battery.voltage_v)
            ? `${diagnostics.battery.voltage_v.toFixed(2)} В${batteryPercentAvailable
              ? ` · ≈${batteryPercent.toFixed(1)} %`
              : ''}`
            : 'Немає актуальних даних'}
          detail="Заряд є оцінкою runtime за напругою, не BMS SOC; попередження при ≤20 %."
          fresh={isFresh(diagnostics.battery) && Number.isFinite(diagnostics.battery.voltage_v)}
        /> : <StatusCard
          label="Напруга батареї"
          value="Недоступно"
          detail={diagnostics.battery_error || 'Очікування телеметрії батареї'}
          fresh={false}
        />}
        {Object.entries(diagnostics.joints || {}).map(([name, item]) =>
          <StatusCard key={name} label={`${axisLabel(name)} · позиція`} value={isFresh(item) ? `${Number(item.position).toFixed(3)} рад` : 'Застарілі дані'} fresh={isFresh(item)} />
        )}
        {Object.entries(diagnostics.modes || {}).filter(([name]) => name === 'weapon').map(([name, item]) =>
          <StatusCard
            key={name}
            label="Режим зброї"
            value={isFresh(item)
              ? `${stateLabel(item.mode)}${item.operation_type && item.operation_type !== 'NONE'
                ? ` · ${stateLabel(item.operation_type)}: ${stateLabel(item.operation_state)}`
                : ''}`
              : 'Застарілі дані'}
            fresh={isFresh(item)}
          />
        )}
        {!hasTelemetry && <p className="muted">Дані ще не надходять.</p>}
        {diagnostics.sensors ? <>
          <StatusCard
            label="Стан сенсорів"
            value={isFresh(diagnostics.sensors)
              ? stateLabel(diagnostics.sensors.aggregated_state)
              : 'Немає даних'}
            fresh={isFresh(diagnostics.sensors)}
          />
          {diagnostics.sensors.items.map((item, index) =>
            <StatusCard
              key={`${item.name}:${index}`}
              label={sensorLabel(item.name, index)}
              value={stateLabel(item.state)}
              fresh={isFresh(diagnostics.sensors)}
            />
          )}
        </> : <StatusCard label="Стан сенсорів" value="Статус недоступний" fresh={false} />}
      </div>}
      {diagnostics?.sensors_error && <p className="muted">{diagnostics.sensors_error}</p>}
      {system && <section className="metrics-section">
        <div className="line telemetry-title">
          <div><div className="tag">СИСТЕМНІ РЕСУРСИ</div><h3>Стан комп’ютера</h3></div>
        </div>
        <div className="status-grid">
          <MetricCard label="Завантаження CPU" value={Number.isFinite(system.cpu_percent) ? `${system.cpu_percent.toFixed(1)} %` : null} error={system.errors?.cpu_percent} />
          <MetricCard
            label="Оперативна пам’ять"
            value={Number.isFinite(system.memory_percent) ? `${system.memory_percent.toFixed(1)} %` : null}
            detail={system.memory_used_bytes != null && system.memory_total_bytes != null
              ? `${formatBytes(system.memory_used_bytes)} з ${formatBytes(system.memory_total_bytes)}`
              : null}
            error={system.errors?.memory}
          />
          <MetricCard label="Температура CPU" value={Number.isFinite(system.cpu_temperature_c) ? `${system.cpu_temperature_c.toFixed(1)} °C` : null} error={system.errors?.cpu_temperature_c} />
          <MetricCard
            label="Вільне місце"
            value={system.disk_free_bytes != null ? formatBytes(system.disk_free_bytes) : null}
            detail={[
              system.disk_percent != null ? `Використано ${system.disk_percent.toFixed(1)} %` : null,
              system.filesystem_read_only === true ? 'Файлова система лише для читання' : null,
            ].filter(Boolean).join(' · ') || null}
            error={system.errors?.disk}
          />
          <MetricCard label="Час роботи пристрою" value={formatUptime(system.uptime_seconds)} error={system.errors?.uptime} />
        </div>
      </section>}
      {(motorIssues.length > 0 || powerIssues.length > 0 || sensorIssues.length > 0 || batteryIssue || systemIssues.length > 0) && <section className="issues" role="alert">
        <h3>Активні попередження та помилки</h3>
        {batteryIssue && <p>Основна батарея: орієнтовний заряд не перевищує 20 %.</p>}
        {systemIssues.map((issue) => <p key={issue}>{issue}</p>)}
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
      {diagnostics?.gimbal_error && <p className="muted">{diagnostics.gimbal_error}</p>}
      {diagnostics?.battery_error && diagnostics.battery && <p className="muted">{diagnostics.battery_error}</p>}
    </>}

    {tab === 'charts' && <>
      <div className="chart-intro">
        <div className="tag">ТЕЛЕМЕТРІЯ · ОСТАННІ {timeRange < 60 ? `${timeRange} СЕКУНД` : `${timeRange / 60} ХВ`}</div>
        <p className="muted">Дані оновлюються з частотою 5 Гц. Показано лише доступні вимірювання.</p>
        <div className="chart-controls">
          <label>Період
            <select value={timeRange} onChange={(event) => setTimeRange(Number(event.target.value))}>
              <option value={30}>30 секунд</option>
              <option value={60}>1 хвилина</option>
              <option value={300}>5 хвилин</option>
              <option value={900}>15 хвилин</option>
            </select>
          </label>
          <button onClick={() => {
            if (chartsPaused) {
              setChartsPaused(false);
              setPausedAt(null);
            } else {
              setPausedAt(Date.now());
              setChartsPaused(true);
            }
          }}>{chartsPaused ? 'Продовжити' : 'Пауза графіків'}</button>
          <button type="button" disabled title="Функція ще не реалізована">CSV — незабаром</button>
        </div>
      </div>
      {errors.ros && <p className="error" role="alert">{errors.ros}</p>}
      {errors.model && <p className="error" role="alert">Не вдалося визначити модель пристрою: {errors.model}</p>}
      {!diagnostics?.available && <p className="muted">{diagnostics?.error || 'Очікування ROS 2…'}</p>}
      <ValueChart title="Струм моторів" unit="А" series={makeSeries(samples, motorSeries)} {...chartProps} />
      <ValueChart title="Напруга приводів" unit="В" series={makeSeries(samples, motorVoltageSeries)} {...chartProps} />
      <ValueChart title="Температура приводів" unit="°C" series={makeSeries(samples, motorTemperatureSeries)} {...chartProps} />
      {!/s360/i.test(deviceModel) ? <>
        <ValueChart title="Позиції осей" unit="рад" series={makeSeries(samples, jointSeries)} {...chartProps} />
        <ValueChart title="Швидкість осей" unit="°/с" series={makeSeries(samples, velocitySeries)} {...chartProps} />
      </> : <p className="muted">Графіки положення та швидкості осей приховані для S360: підтвердженого джерела й одиниць виміру немає.</p>}
      <ValueChart title="Завантаження CPU" unit="%" series={makeSeries(samples, [{ key: 'system:cpu', label: 'CPU' }])} {...chartProps} />
      <ValueChart title="Використання RAM" unit="%" series={makeSeries(samples, [{ key: 'system:memory', label: 'RAM' }])} {...chartProps} />
      <ValueChart title="Температура CPU" unit="°C" series={makeSeries(samples, [{ key: 'system:temperature', label: 'CPU' }])} {...chartProps} />
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
      {diagnostics?.available && !motorSeries.length && !jointSeries.length &&
        <p className="muted">Немає даних осей для графіків.</p>}
    </>}

    {tab === 'logs' && <>
      <div className="line">
        <div><div className="tag">ЖУРНАЛ СЕРВІСУ</div><h3>Останні записи</h3></div>
        <div className="actions">
          <button onClick={refreshLogs}>Оновити</button>
          <button onClick={() => setLogsPaused((value) => !value)}>{logsPaused ? 'Продовжити оновлення' : 'Пауза оновлення'}</button>
          <button onClick={() => setAutoScroll((value) => !value)}>{autoScroll ? 'Вимкнути автопрокрутку' : 'Увімкнути автопрокрутку'}</button>
          <button type="button" disabled title="Функція ще не реалізована">Копіювати — незабаром</button>
          <button type="button" disabled title="Функція ще не реалізована">Завантажити — незабаром</button>
        </div>
      </div>
      <p className="muted">Останні 100 рядків · оновлення кожні 5 секунд</p>
      <div className="log-filters">
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
