import React, { useState } from 'react';
import { api } from '../api.js';

export function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      onLogin();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen">
    <form className="panel auth-form" onSubmit={submit}>
      <div className="tag">ROBOT UI · SECURE ACCESS</div>
      <h1>Вхід</h1>
      <p>Введіть пароль сервісної панелі.</p>
      <label htmlFor="auth-password">Пароль</label>
      <input id="auth-password" type="password" autoComplete="current-password"
        value={password} onChange={event => setPassword(event.target.value)} required />
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Перевірка…' : 'Увійти'}</button>
    </form>
  </main>;
}
