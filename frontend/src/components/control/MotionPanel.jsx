import React from 'react';

export function MotionPanel({ motionEnabled, onMotionChange, slowMode, onSlowModeChange }) {
  return <section className="control-block">
    <h3>Motion · mock</h3>
    <label className="control-check">
      <input
        type="checkbox"
        checked={motionEnabled}
        onChange={(event) => onMotionChange(event.target.checked)}
      />
      Motion Enable <small>Preview: {motionEnabled ? 'ON' : 'OFF'}</small>
    </label>
    <label className="control-check">
      <input
        type="checkbox"
        checked={slowMode}
        onChange={(event) => onSlowModeChange(event.target.checked)}
      />
      Slow Mode <small>Preview: {slowMode ? 'ON' : 'OFF'}</small>
    </label>
    <button type="button" disabled title="Run Homing is unavailable in mock preview">Run Homing</button>
    <p className="muted">Перемикачі локальні. Slow Mode не масштабує значення джойстика.</p>
  </section>;
}
