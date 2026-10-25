import React from 'react';
import { controlStatusValues } from '../../controlStatus.js';

export function ControlStatusPanel({ diagnostics, unavailable }) {
  const statuses = controlStatusValues(diagnostics, unavailable);

  return <aside className="control-status-panel" aria-label="Статуси системи">
    {statuses.map(([label, value]) =>
      <div className="control-status-card" key={label}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    )}
  </aside>;
}
