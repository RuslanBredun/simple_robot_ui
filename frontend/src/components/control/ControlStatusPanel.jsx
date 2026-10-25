import React from 'react';

const connectionStatuses = [
  ['WEB_UI source', 'Not registered · mock only'],
  ['Main operator', 'Not connected · mock only'],
  ['Active control owner', 'Not available in preview'],
  ['Control availability', 'Disabled'],
];

const deviceStatuses = [
  ['Turret Mode', 'Немає даних · mock preview'],
  ['Weapon Mode', 'Немає даних · mock preview'],
  ['Homing Status', 'Немає даних · mock preview'],
  ['Motion State', 'Немає даних · mock preview'],
  ['Tool Status', 'Немає даних · mock preview'],
];

function StatusGroup({ title, items }) {
  return <section className="control-status-group">
    <h3>{title}</h3>
    <div className="control-status-grid">
      {items.map(([label, value]) =>
        <div className="control-status-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      )}
    </div>
  </section>;
}

export function ControlStatusPanel() {
  return <div className="control-status-panel">
    <StatusGroup title="Підключення та доступ" items={connectionStatuses} />
    <StatusGroup title="Стан пристрою" items={deviceStatuses} />
  </div>;
}
