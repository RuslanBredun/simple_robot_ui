import React from 'react';

export function ToolPanel({ tool, onToolChange, mode, onModeChange, tools, modes }) {
  return <section className="control-block">
    <h3>Weapon</h3>
    <div className="control-tool-selects">
      <label>Tool
        <select value={tool} onChange={(event) => onToolChange(Number(event.target.value))}>
          {tools.map((item) => <option key={item} value={item}>Tool {item}</option>)}
        </select>
      </label>
      <label>Mode
        <select value={mode} onChange={(event) => onModeChange(Number(event.target.value))}>
          {modes.map((item) => <option key={item} value={item}>Mode {item}</option>)}
        </select>
      </label>
    </div>
    <div className="control-tool-buttons">
      <button type="button" disabled title="Unavailable in mock preview">Safety</button>
      <button type="button" disabled title="Activation unavailable in mock preview">Activate</button>
    </div>
  </section>;
}
