import React from 'react';

export function CameraPanel({ camera, onCameraChange, profile, onProfileChange, cameras, profiles }) {
  return <section className="control-video panel">
    <div className="control-video-placeholder">
      <div className="control-video-select control-video-select-camera">
        <label htmlFor="control-camera-select">Камера</label>
        <select
          id="control-camera-select"
          value={camera}
          onChange={(event) => onCameraChange(event.target.value)}
        >
          {cameras.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="control-video-select control-video-select-quality">
        <label htmlFor="control-quality-select">Якість</label>
        <select
          id="control-quality-select"
          value={profile}
          onChange={(event) => onProfileChange(event.target.value)}
        >
          {profiles.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="control-video-message">
        <strong>Відео недоступне</strong>
        <small>Mock preview · живий потік не підключено</small>
      </div>
    </div>
  </section>;
}
