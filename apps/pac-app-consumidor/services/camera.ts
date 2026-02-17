// ============================================================================
// Camera & Image - App Consumidor
// Usa expo-camera y expo-image-picker
// ============================================================================

import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

const RECEIPTS_BUCKET = 'receipts';

export interface PhotoResult {
  uri: string;
  width?: number;
  height?: number;
}

/**
 * Toma una foto usando expo-camera.
 * Solicita permisos si no están concedidos.
 */
export async function takePhoto(): Promise<PhotoResult> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Se requieren permisos de cámara');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });

  if (result.canceled) {
    throw new Error('Captura cancelada');
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Selecciona una imagen de la galería usando expo-image-picker.
 */
export async function pickImage(): Promise<PhotoResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Se requieren permisos de galería');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.8,
  });

  if (result.canceled) {
    throw new Error('Selección cancelada');
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Sube una imagen desde su URI a Supabase Storage (bucket receipts).
 * Retorna la URL pública o la ruta de storage.
 */
export async function uploadImage(uri: string): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Usuario no autenticado');
  }

  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${user.id}/${Date.now()}.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, blob, { upsert: true });

  if (uploadError) {
    throw new Error(`Error al subir imagen: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(RECEIPTS_BUCKET)
    .getPublicUrl(path);

  return urlData.publicUrl;
}
