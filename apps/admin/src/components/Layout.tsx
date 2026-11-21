import { NavLink, Outlet } from 'react-router-dom';

const links = [
  ['/', 'Resumen'],
  ['/trainers', 'Entrenadores'],
  ['/students', 'Alumnos'],
  ['/stats', 'Estadísticas'],
  ['/billing', 'Finanzas'],
  ['/storage', 'Almacenamiento'],
  ['/config', 'Configuración'],
  ['/audit', 'Auditoría'],
] as const;

export function Layout({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>DaminatoFit</strong>
          <span>Admin</span>
        </div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="muted">{email}</p>
          <button type="button" className="linkish" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
