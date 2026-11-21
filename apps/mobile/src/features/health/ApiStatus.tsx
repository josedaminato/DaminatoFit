import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { fetchHealth, getApiUrl } from '@/lib/api';

type Status =
  | { kind: 'unconfigured' }
  | { kind: 'checking' }
  | { kind: 'ok'; version: string }
  | { kind: 'error' };

export function ApiStatus() {
  const { brand, colors } = useBrand();
  const apiUrl = getApiUrl();
  const [status, setStatus] = useState<Status>(
    apiUrl ? { kind: 'checking' } : { kind: 'unconfigured' },
  );

  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    fetchHealth(apiUrl, brand.id)
      .then((health) => !cancelled && setStatus({ kind: 'ok', version: health.version }))
      .catch(() => !cancelled && setStatus({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [apiUrl, brand.id]);

  let label: string;
  let color: string;
  switch (status.kind) {
    case 'unconfigured':
      label = 'API sin configurar (EXPO_PUBLIC_API_URL)';
      color = colors.textMuted;
      break;
    case 'checking':
      label = 'Conectando con la API…';
      color = colors.textMuted;
      break;
    case 'ok':
      label = `API conectada (versión ${status.version})`;
      color = colors.success;
      break;
    case 'error':
      label = 'No se pudo conectar con la API';
      color = colors.danger;
      break;
  }

  return (
    <Text accessibilityLiveRegion="polite" style={[styles.text, { color }]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16 },
});
