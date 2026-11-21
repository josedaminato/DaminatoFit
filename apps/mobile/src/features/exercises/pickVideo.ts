import * as DocumentPicker from 'expo-document-picker';
import type { VideoContentType } from './exercise-api';
import { normalizeVideoContentType } from './exercise-api';

export interface PickedVideo {
  uri: string;
  name: string;
  size: number | null;
  contentType: VideoContentType;
}

export async function pickExerciseVideo(): Promise<PickedVideo | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['video/mp4', 'video/quicktime', 'video/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const contentType = normalizeVideoContentType(asset.mimeType);
  if (!contentType) {
    throw new Error('invalid_video_type');
  }

  return {
    uri: asset.uri,
    name: asset.name,
    size: asset.size ?? null,
    contentType,
  };
}
