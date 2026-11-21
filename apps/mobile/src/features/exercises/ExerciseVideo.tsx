import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { ResizeMode, Video } from 'expo-av';
import { useBrand } from '@/brand/BrandProvider';
import type { ApiRequestContext } from '@/lib/api-client';
import { Button } from '@/ui/Button';
import { ErrorText } from '@/ui/ErrorText';
import { getPlaybackUrl } from './exercise-api';
import { EXERCISE_VIDEO_SHOULD_AUTOPLAY } from './types';

interface ExerciseVideoProps {
  mediaId: string | null | undefined;
  apiContext: ApiRequestContext;
}

export function ExerciseVideo({ mediaId, apiContext }: ExerciseVideoProps) {
  const { colors } = useBrand();
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUrl = useCallback(async () => {
    if (!mediaId) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await getPlaybackUrl(apiContext, mediaId);
      setPlaybackUrl(res.url);
      return res.url;
    } catch {
      setError('No se pudo cargar el video.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiContext, mediaId]);

  const onPlayInApp = async () => {
    const url = playbackUrl ?? (await loadUrl());
    if (url) setPlaying(true);
  };

  const onOpenExternally = async () => {
    const url = playbackUrl ?? (await loadUrl());
    if (url) await Linking.openURL(url);
  };

  if (!mediaId) {
    return <Text style={{ color: colors.textMuted }}>Este ejercicio no tiene video.</Text>;
  }

  if (playing && playbackUrl) {
    return (
      <View style={styles.playerWrap}>
        <Video
          source={{ uri: playbackUrl }}
          style={[styles.video, { backgroundColor: colors.surface }]}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={EXERCISE_VIDEO_SHOULD_AUTOPLAY}
        />
        <Button label="Cerrar reproductor" variant="secondary" onPress={() => setPlaying(false)} />
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <Text style={{ color: colors.text }}>Video demostrativo</Text>
      <Button label="Reproducir" onPress={() => void onPlayInApp()} loading={loading} />
      <Button
        label="Abrir en el navegador"
        variant="secondary"
        onPress={() => void onOpenExternally()}
        loading={loading}
      />
      <ErrorText message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  playerWrap: { gap: 12 },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
  },
});
