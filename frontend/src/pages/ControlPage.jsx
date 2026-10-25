import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
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
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsError, setDiagnosticsError] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer;

    async function refreshDiagnostics() {
      try {
        const data = await api('diagnostics');
        if (!stopped) {
          setDiagnostics(data.ros);
          setDiagnosticsError(false);
        }
      } catch {
        if (!stopped) setDiagnosticsError(true);
      }
      if (!stopped) timer = window.setTimeout(refreshDiagnostics, 1000);
    }

    refreshDiagnostics();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  return <section className="panel control-panel">
    <div className="line panel-heading">
      <div><div className="tag">LIVE STATUS · COMMANDS MOCK-ONLY</div><h2>Керування</h2></div>
    </div>
    <div className="control-workspace">
      <ControlStatusPanel diagnostics={diagnostics} unavailable={diagnosticsError} />
      <CameraPanel
        camera={camera}
        onCameraChange={setCamera}
        profile={profile}
        onProfileChange={setProfile}
        cameras={CAMERAS}
        profiles={STREAM_PROFILES}
      />
      <div className="control-panels">
        <JoystickPanel axes={axes} onAxesChange={setAxes} />
        <div className="control-right-stack">
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
    </div>
  </section>;
}
