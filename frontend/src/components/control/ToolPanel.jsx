import React from 'react';

export function ToolPanel({ tool, onToolChange, mode, onModeChange, tools, modes }) {
  return <section className="control-block">
    <h3>Tool · mock</h3>
    <div className="control-selects">
      <label>Tool ID
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
    <p className="muted">Вибір локальний; стани окремих інструментів у preview не надходять.</p>
    <p className="muted">Запобіжник та активація не мають елементів керування.</p>
  </section>;
}
