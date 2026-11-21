import { formatUsdFromCents } from '@daminatofit/contracts';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function money(cents: number): string {
  return formatUsdFromCents(cents);
}

export function statusLabel(status: string): string {
  if (status === 'paused') return 'Suspendido';
  if (status === 'archived') return 'Archivado';
  if (status === 'active') return 'Activo';
  return status;
}
