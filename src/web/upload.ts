import { LIMITS } from '../shared/const';
import { ApiError, authHeader } from './api';

const MAX_SIDE = 900;

/** Сжимаем в JPEG на клиенте (≤ 900px), чтобы не гонять мегабайты и не принимать произвольные форматы. */
export async function prepareImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new ApiError(0, 'bad_image', 'Не удалось открыть картинку'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= LIMITS.imageMaxBytes) return blob;
    }
    throw new ApiError(0, 'bad_image', 'Картинка слишком тяжёлая');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(file: File): Promise<string> {
  const blob = await prepareImage(file);
  const res = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...authHeader() }, body: blob });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Не удалось загрузить');
  return data.id as string;
}
