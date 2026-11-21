import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SimpleBars } from './components/SimpleBars';
import { StatCard } from './components/StatCard';
import { statusLabel } from './lib/format';

describe('admin UI', () => {
  it('labels suspended trainers clearly', () => {
    expect(statusLabel('paused')).toBe('Suspendido');
    expect(statusLabel('active')).toBe('Activo');
  });

  it('renders dashboard cards and empty charts', () => {
    render(
      <>
        <StatCard label="Entrenadores" value={0} />
        <StatCard label="Estimado" value="USD 0.00" nature="estimate" />
        <SimpleBars title="Nuevos entrenadores por mes" points={[]} />
      </>,
    );
    expect(screen.getByText('Entrenadores')).toBeTruthy();
    expect(screen.getByText('Estimado · no cobrado')).toBeTruthy();
    expect(screen.getByText('Sin datos en este período')).toBeTruthy();
  });
});
