/**
 * Login screen — visual layout preserved from original.
 * Demo credentials: r.sharma / sail123  (also a.patel, s.nair, k.reddy)
 */
import { useState } from 'react';
import { ArrowRight, BrainCircuit, Route, Bell } from 'lucide-react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [id, setId] = useState('r.sharma');
  const [pw, setPw] = useState('sail123');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      // Backend expects user_id + password
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ user_id: id.trim(), password: pw }),
      });
      onLogin(data.manager, data.plant, data.security || null);
    } catch (error) {
      setErr(error.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-left">
        <div className="brand">FREIGHT<span>ONE</span></div>
        <div className="eyebrow">INTELLIGENT PROCUREMENT & FREIGHT CONTROL</div>
        <h1>Make the decision before the market makes it for you.</h1>
        <p>
          Material-aware procurement, freight intelligence, port choice and contingency recovery
          in one decision workflow.
        </p>
        <div className="login-features">
          <span><BrainCircuit /> Decision intelligence</span>
          <span><Route /> Route optimization</span>
          <span><Bell /> Risk monitoring</span>
        </div>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div className="eyebrow">MANAGER ACCESS</div>
        <h2>Sign in to FreightOne</h2>
        <p>Your access scope and plant context load automatically.</p>
        <label>
          Manager ID
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="primary full" disabled={loading}>
          {loading ? 'Authenticating…' : 'Sign in'} <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
