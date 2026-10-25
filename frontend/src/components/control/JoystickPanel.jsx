import React, { useRef } from 'react';
import { normalizeJoystickPointer } from '../../controlPreview.js';

const formatAxis = (value) => value.toFixed(2);

export function JoystickPanel({ axes, onAxesChange }) {
  const stickRef = useRef(null);

  function updateFromPointer(event) {
    const bounds = stickRef.current?.getBoundingClientRect();
    if (bounds) {
      onAxesChange(normalizeJoystickPointer(event.clientX, event.clientY, bounds));
    }
  }

  function releasePointer(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onAxesChange({ yaw: 0, pitch: 0 });
  }

  return <section className="control-block">
    <h3>Analog joystick · mock</h3>
    <div
      ref={stickRef}
      className="control-stick-preview"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
      }}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
    >
      <span style={{
        left: `${50 + axes.yaw * 42}%`,
        top: `${50 - axes.pitch * 42}%`,
      }} />
    </div>
    <div className="control-axis-values" aria-live="polite">
      <label>Yaw
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={axes.yaw}
          onChange={(event) => onAxesChange({ ...axes, yaw: Number(event.target.value) })}
        />
        <output>{formatAxis(axes.yaw)}</output>
      </label>
      <label>Pitch
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={axes.pitch}
          onChange={(event) => onAxesChange({ ...axes, pitch: Number(event.target.value) })}
        />
        <output>{formatAxis(axes.pitch)}</output>
      </label>
    </div>
    <p className="muted">Yaw / Pitch: від −1 до +1. Значення локальні й не надсилаються.</p>
  </section>;
}
