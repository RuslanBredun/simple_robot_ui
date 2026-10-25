import React, { useRef } from 'react';
import { normalizeJoystickPointer } from '../../controlPreview.js';

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

  return <section className="control-block control-joystick-panel">
    <h3>Motion</h3>
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
  </section>;
}
