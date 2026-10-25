import React, { useState } from 'react';

// v0.5 layout prototype. All inputs are local previews, never ROS commands.
const cameras = ['Camera 1', 'Camera 2'];
const qualities = ['High', 'Medium', 'Low'];
const tools = [1, 2, 3, 5];
const modes = [1, 2, 3];

export function ControlPage() {
  const [camera, setCamera] = useState(cameras[0]);
  const [quality, setQuality] = useState(qualities[0]);
  const [tool, setTool] = useState(tools[0]);
  const [mode, setMode] = useState(modes[0]);
  const [slow, setSlow] = useState(false);
  const [motion, setMotion] = useState(false);

  return <section className="panel control-panel">
    <div className="line panel-heading">
      <div><div className="tag">CONTROL · v0.5 PROTOTYPE</div><h2>Сервісна панель</h2></div>
      <span className="control-demo-label">UI preview · команди не надсилаються</span>
    </div>
    <div className="control-status">
      <span>Turret mode: <strong>Немає даних</strong></span>
      <span>Weapon mode: <strong>Немає даних</strong></span>
      <span>Motion: <strong>Локальний макет</strong></span>
    </div>
    <div className="control-layout">
      <div className="control-video panel">
        <h3>Камера</h3>
        <div className="control-video-placeholder"><span>Відео не підключено</span><small>RTSP потребує окремого браузерного шлюзу</small></div>
        <div className="control-selects">
          <label>Камера<select value={camera} onChange={e => setCamera(e.target.value)}>{cameras.map(v => <option key={v}>{v}</option>)}</select></label>
          <label>Якість<select value={quality} onChange={e => setQuality(e.target.value)}>{qualities.map(v => <option key={v}>{v}</option>)}</select></label>
        </div>
        <p className="muted">Обрано: {camera} · {quality}. Жоден потік не запускається.</p>
      </div>
      <div className="control-side">
        <div className="control-block">
          <h3>Axis Control</h3>
          <div className="control-stick-preview" aria-label="Joystick preview, inactive"><span /></div>
          <p className="muted">Yaw / Pitch · −100%…+100%. Підключення команд очікує перевірки контрактів.</p>
        </div>
        <div className="control-block">
          <h3>Motion</h3>
          <label className="control-check"><input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)} /> Motion Enable <small>Preview: {motion ? 'ON' : 'OFF'}</small></label>
          <label className="control-check"><input type="checkbox" checked={slow} onChange={e => setSlow(e.target.checked)} /> Slow Mode <small>Preview: {slow ? 'ON' : 'OFF'}</small></label>
          <button disabled title="Потрібна підтверджена інтеграція та перевірка стану системи">Run Homing</button>
          <p className="muted">Slow Mode — окремий прапорець; не змінює нормалізований діапазон джойстика.</p>
        </div>
        <div className="control-block">
          <h3>Tool</h3>
          <div className="control-selects">
            <label>Tool ID<select value={tool} onChange={e => setTool(Number(e.target.value))}>{tools.map(v => <option key={v} value={v}>Tool {v}</option>)}</select></label>
            <label>Mode<select value={mode} onChange={e => setMode(Number(e.target.value))}>{modes.map(v => <option key={v} value={v}>Mode {v}</option>)}</select></label>
          </div>
          <div className="control-status"><span>Safety: <strong>Немає даних</strong></span><span>Activation: <strong>Немає даних</strong></span></div>
          <p className="muted">Вибір локальний. Активація інструмента й керування запобіжником недоступні у сервісному макеті.</p>
        </div>
      </div>
    </div>
  </section>;
}
