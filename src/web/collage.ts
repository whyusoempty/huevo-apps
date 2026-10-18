import { GRADIENTS } from '../shared/const';
import { authHeader } from './api';
import { imgUrl } from './ui';

export type Layout = 'grid' | 'big';

export interface CollageInput {
  layout: Layout;
  userName: string;
  testTitle: string;
  coverImage: string | null;
  coverEmoji: string;
  coverGrad: number;
  teaser: string;
  teaserImage?: string | null;
  result: { title: string; image?: string | null; emoji: string; grad: number };
  watermark: string;
}

const FONT = '"Trebuchet MS", Tahoma, Arial, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
}

let avatarCache: Promise<HTMLImageElement | null> | null = null;
/** Аватар берём через наш сервер (тот же origin), иначе canvas нельзя будет выгрузить в картинку. */
export function loadAvatar(): Promise<HTMLImageElement | null> {
  avatarCache ??= fetch('/api/avatar', { headers: authHeader() })
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => (b ? loadImage(URL.createObjectURL(b)) : null))
    .catch(() => null);
  return avatarCache;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function drawFallback(ctx: CanvasRenderingContext2D, grad: number, emoji: string, x: number, y: number, w: number, h: number) {
  const [a, b] = GRADIENTS[grad] ?? GRADIENTS[0];
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, a); g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.font = `${Math.round(Math.min(w, h) * 0.5)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(emoji, x + w / 2, y + h / 2);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Белая подпись-плашка снизу ячейки, как в оригинальных миниТестах. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, maxW: number, size: number) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, maxW - 24);
  const lh = size * 1.2;
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24);
  const h = lines.length * lh + 14;
  const x = cx - w / 2, y = bottom - h;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  lines.forEach((l, i) => ctx.fillText(l, cx, y + 7 + lh * (i + 0.5)));
}

function drawWatermark(ctx: CanvasRenderingContext2D, text: string, sub: string, cx: number, cy: number, size: number) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `italic bold ${size}px ${FONT}`;
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = '#e8337f';
  ctx.fillText(text, cx, cy);
  ctx.font = `bold ${size * 0.42}px ${FONT}`;
  ctx.lineWidth = size * 0.14;
  ctx.strokeText(sub, cx, cy + size * 0.62);
  ctx.fillStyle = '#222';
  ctx.fillText(sub, cx, cy + size * 0.62);
}

export async function renderCollage(inp: CollageInput): Promise<string> {
  const [avatar, cover, res, tz] = await Promise.all([
    loadAvatar(),
    inp.coverImage ? loadImage(imgUrl(inp.coverImage)) : Promise.resolve(null),
    inp.result.image ? loadImage(imgUrl(inp.result.image)) : Promise.resolve(null),
    inp.teaserImage ? loadImage(imgUrl(inp.teaserImage)) : Promise.resolve(null),
  ]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  if (inp.layout === 'grid') {
    const W = 920, H = 660, pad = 10, gap = 6;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#dcdfe3'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    const cw = (W - pad * 2 - gap) / 2, ch = (H - pad * 2 - gap) / 2;
    const cell = (i: number) => ({ x: pad + (i % 2) * (cw + gap), y: pad + Math.floor(i / 2) * (ch + gap) });
    const size = 26;

    let p = cell(0);
    if (avatar) drawCover(ctx, avatar, p.x, p.y, cw, ch); else drawFallback(ctx, inp.coverGrad, '🙂', p.x, p.y, cw, ch);
    drawLabel(ctx, inp.userName, p.x + cw / 2, p.y + ch - 16, cw - 30, size);

    p = cell(1);
    if (cover) drawCover(ctx, cover, p.x, p.y, cw, ch); else drawFallback(ctx, inp.coverGrad, inp.coverEmoji, p.x, p.y, cw, ch);
    drawLabel(ctx, inp.testTitle, p.x + cw / 2, p.y + ch - 16, cw - 30, size);

    p = cell(2);
    if (tz) drawCover(ctx, tz, p.x, p.y, cw, ch); else drawFallback(ctx, inp.result.grad, inp.result.emoji, p.x, p.y, cw, ch);
    drawLabel(ctx, inp.teaser || 'Он уже знает, кто ты)))', p.x + cw / 2, p.y + ch - 16, cw - 30, size);

    p = cell(3);
    if (res) drawCover(ctx, res, p.x, p.y, cw, ch); else drawFallback(ctx, inp.result.grad, inp.result.emoji, p.x, p.y, cw, ch);
    drawLabel(ctx, inp.result.title, p.x + cw / 2, p.y + ch - 16, cw - 30, size);

    drawWatermark(ctx, 'Тесты', inp.watermark, W / 2, H / 2, 46);
  } else {
    const W = 760, H = 700, pad = 14;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // шапка: аватар + «Имя, вопрос теста» + стрелка
    const ah = 64;
    if (avatar) drawCover(ctx, avatar, pad, pad, ah, ah); else drawFallback(ctx, inp.coverGrad, '🙂', pad, pad, ah, ah);
    ctx.fillStyle = '#444';
    ctx.font = `${26}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const t = inp.testTitle.replace(/[?.!]+$/, '');
    const head = `${inp.userName}, ${t.charAt(0).toLowerCase()}${t.slice(1)}?`;
    wrap(ctx, head, W - pad * 3 - ah).slice(0, 2).forEach((l, i, arr) => ctx.fillText(l, pad * 2 + ah, pad + ah / 2 + (i - (arr.length - 1) / 2) * 32));
    ctx.fillStyle = '#c3c8ce';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 14, pad + ah + 12); ctx.lineTo(W / 2 + 14, pad + ah + 12); ctx.lineTo(W / 2, pad + ah + 34);
    ctx.fill();
    const iy = pad + ah + 46, ih = H - iy - pad;
    ctx.strokeStyle = '#dcdfe3'; ctx.lineWidth = 2; ctx.strokeRect(pad, iy, W - pad * 2, ih);
    if (res) drawCover(ctx, res, pad + 8, iy + 8, W - pad * 2 - 16, ih - 16);
    else drawFallback(ctx, inp.result.grad, inp.result.emoji, pad + 8, iy + 8, W - pad * 2 - 16, ih - 16);
    drawLabel(ctx, inp.result.title, W / 2, iy + ih - 26, W - 120, 30);
    drawWatermark(ctx, 'Тесты', inp.watermark, W - 110, iy + ih - 62, 30);
  }
  return canvas.toDataURL('image/jpeg', 0.9);
}
