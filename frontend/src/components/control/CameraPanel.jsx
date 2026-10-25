import React from 'react';

export function CameraPanel({ camera, onCameraChange, profile, onProfileChange, cameras, profiles }) {
  return <section className="control-video panel">
    <h3>Камера · mock preview</h3>
    <div className="control-video-placeholder">
      <span>Відео недоступне в mock preview</span>
      <small>Живий RTSP-потік не підключається</small>
    </div>
    <div className="control-selects">
      <label>Камера
        <select value={camera} onChange={(event) => onCameraChange(event.target.value)}>
          {cameras.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>Профіль потоку
        <select value={profile} onChange={(event) => onProfileChange(event.target.value)}>
          {profiles.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
    </div>
    <p className="muted">Вибір змінює лише стан сторінки; потік не запускається.</p>
  </section>;
}
