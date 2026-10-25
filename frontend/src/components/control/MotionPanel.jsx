import React from 'react';

export function MotionPanel({ motionEnabled, onMotionChange, slowMode, onSlowModeChange }) {
  return <section className="control-block control-motion-panel" aria-label="Motion control">
    <h3>Motion control</h3>
    <div className="control-motion-buttons">
      <button
        type="button"
        className={`control-toggle-button${motionEnabled ? ' is-active' : ''}`}
        aria-pressed={motionEnabled}
        onClick={() => onMotionChange(!motionEnabled)}
      >
        Enable
      </button>
      <button
        type="button"
        className={`control-toggle-button${slowMode ? ' is-active' : ''}`}
        aria-pressed={slowMode}
        onClick={() => onSlowModeChange(!slowMode)}
      >
        Slow
      </button>
      <button type="button" disabled title="Homing недоступний у mock preview">
        Run Homing
      </button>
    </div>
  </section>;
}
