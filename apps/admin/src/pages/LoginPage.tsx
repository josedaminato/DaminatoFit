import { useState, type FormEvent } from 'react';
import { authClient, writeBearer } from '../lib/auth';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? 'No se pudo iniciar sesión');
        return;
      }
      const token =
        (result.data as { token?: string } | null)?.token ??
        ((result as { headers?: Headers }).headers?.get?.('set-auth-token') as string | null);
      if (typeof token === 'string' && token.length > 0) writeBearer(token);
      onSignedIn();
    } catch {
      setError('Error de red al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>DaminatoFit Admin</h1>
        <p className="muted">Acceso exclusivo para administradores de plataforma.</p>
        <label>
          Correo
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted small">
          MFA/TOTP aún no está habilitado. No exponer este panel a internet hasta implementarlo.
        </p>
      </form>
    </div>
  );
}
