# Стиль «ВКонтакте 2014»

Ретро: светлый, плотный, без теней и закруглений-«пилюль», минимум эмодзи. Не делай «современно».

## Токены

```css
:root {
  --text: #222; --muted: #8a8f95; --link: #2b587a;
  --blue: #5e81a8; --blue-dark: #4c6f96;
  --bar: #f0f2f5; --line: #dae1e8;
  --gray-btn: #f0f0f0; --gray-line: #cfd4d9;
  --warn: #c08400; --danger: #c0392b; --ok: #3f9b4a;
}
html, body { background: #fff; color: var(--text); font: 13px/1.45 Tahoma, Verdana, Arial, sans-serif; }
a { color: var(--link); text-decoration: none; } a:hover { text-decoration: underline; }
.page { max-width: 640px; margin: 0 auto; }
```

## Компоненты

- **Вкладки сверху:** `display:flex; gap:3px; border-bottom:3px solid var(--blue)`; вкладка `background:var(--line); color:var(--link); border-radius:4px 4px 0 0; padding:6px 14px; font-weight:bold`; активная `background:var(--blue); color:#fff`.
- **Заголовок раздела:** серая полоса `background:var(--bar); border-bottom:1px solid var(--line); padding:8px 12px; font-weight:bold; color:#55595e`; справа мелкие ссылки (сортировка).
- **Кнопки:** синяя `background:var(--blue); border:1px solid var(--blue-dark); color:#fff; font-weight:bold; border-radius:3px; padding:6px 14px`; серая `background:var(--gray-btn); border:1px solid var(--gray-line); color:var(--link)`. Без теней и градиентов.
- **Плитки каталога:** сетка `repeat(auto-fill,minmax(124px,1fr))`, квадрат 96px с `border-radius:5px; box-shadow:0 1px 5px rgba(0,0,0,.45)`, подпись под ним по центру 13px.
- **Поля:** белые, рамка `#c0c8d0`, радиус 2px, фокус `#7f9db9`.
- **Комментарии/стена:** аватар 32–36px (квадрат с радиусом 3px), имя ссылкой, дата серым, текст; разделитель `1px solid #eef0f2`.
- **Модалка:** синяя шапка (`var(--blue)`, белый заголовок), белое тело, радиус 4px.
- **Топ/списки:** строка: место, аватар 40px, имя + мелкая серая подпись, число справа.
- **Бейджи:** `background:#e8edf2; color:var(--link); font-size:11px; font-weight:bold; border-radius:2px`.
- **Тосты:** тёмная плашка `rgba(30,40,55,.92)`, радиус 3px.

## Графика

- Пиксель-арт: `image-rendering: pixelated`, целочисленный масштаб, палитра 16–32 цвета, контрастный контур.
- Картинки для результатов в духе старого интернета: сильное сжатие JPEG (качество ~40–50), насыщенные цвета. Белые плашки с жирным чёрным текстом поверх фото и розовый «курсивный» знак с белой обводкой в центре коллажа (как у миниТестов).
- Все иконки и спрайты рисуй кодом (canvas/SVG), не бери чужие ассеты без лицензии. Для фото используй Wikimedia Commons только с лицензиями Public domain / CC0 и записывай источники в `CREDITS.md`.

## Картинки для карточки приложения

Логотип 1:1 ≥512px, баннер 4:3 ≥800×600, баннер 16:9 ≥1280×720. Генерируй скриптом (Pillow), проверь глазами: перекрытие подписей знаком, обрезка, читаемость. Шрифт Arial Bold есть в Windows (`C:/Windows/Fonts/arialbd.ttf`); эмодзи/звёздочки он не рисует, используй простые символы.
