import React, { useState } from 'react';
import { CameraPanel } from '../components/control/CameraPanel.jsx';
import { ControlStatusPanel } from '../components/control/ControlStatusPanel.jsx';
import { JoystickPanel } from '../components/control/JoystickPanel.jsx';
import { MotionPanel } from '../components/control/MotionPanel.jsx';
import { ToolPanel } from '../components/control/ToolPanel.jsx';
import { CAMERAS, STREAM_PROFILES, TOOL_IDS, TOOL_MODES } from '../controlPreview.js';

export function ControlPage() {
  const [camera, setCamera] = useState(CAMERAS[0]);
  const [profile, setProfile] = useState(STREAM_PROFILES[0]);
  const [tool, setTool] = useState(TOOL_IDS[0]);
  const [mode, setMode] = useState(TOOL_MODES[0]);
  const [slowMode, setSlowMode] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [axes, setAxes] = useState({ yaw: 0, pitch: 0 });

  return <section className="panel control-panel">
    <div className="line panel-heading">
      <div><div className="tag">CONTROL · MOCK PREVIEW</div><h2>Сервісна панель</h2></div>
      <span className="control-demo-label">Локальний макет · без команд і відео</span>
    </div>
    <ControlStatusPanel />
    <div className="control-layout">
      <CameraPanel
        camera={camera}
        onCameraChange={setCamera}
        profile={profile}
        onProfileChange={setProfile}
        cameras={CAMERAS}
        profiles={STREAM_PROFILES}
      />
      <div className="control-side">
        <JoystickPanel axes={axes} onAxesChange={setAxes} />
        <MotionPanel
          motionEnabled={motionEnabled}
          onMotionChange={setMotionEnabled}
          slowMode={slowMode}
          onSlowModeChange={setSlowMode}
        />
        <ToolPanel
          tool={tool}
          onToolChange={setTool}
          mode={mode}
          onModeChange={setMode}
          tools={TOOL_IDS}
          modes={TOOL_MODES}
        />
      </div>
    </div>
  </section>;
}
