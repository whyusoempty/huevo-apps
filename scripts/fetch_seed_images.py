"""Скачивает для стартовых тестов картинки из Wikimedia Commons (только Public domain / CC0)
и делает им «ретро-вид» (сжатие, насыщенность), как у миниТестов 2012 года.
Запуск: python -I scripts/fetch_seed_images.py  → public/seed/*.jpg + public/seed/CREDITS.md
"""
import io, json, os, sys, urllib.parse, urllib.request
from PIL import Image, ImageEnhance

API = 'https://commons.wikimedia.org/w/api.php'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'seed')
UA = {'User-Agent': 'huevo-tests-seed/1.0 (educational project)'}
OK_LICENSES = ('public domain', 'cc0', 'pd')

# имя файла -> поисковый запрос
WANTED = {
    'cat': 'cat Unsplash',
    'wolf': 'wolf USFWS',
    'fox': 'red fox Unsplash',
    'owl': 'owl Unsplash',
    'jupiter': 'Jupiter planet Cassini',
    'einstein': 'Albert Einstein photo 1921',
    'chick': 'incategory:"Chicks" yellow chick',
    'football': 'association football ball on grass',
    'magnifier': 'magnifying glass',
}


def get(params):
    url = API + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def find(query):
    res = get({'action': 'query', 'generator': 'search', 'gsrsearch': f'filetype:bitmap {query}', 'gsrnamespace': 6,
               'gsrlimit': 25, 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata|mime', 'iiurlwidth': 800, 'format': 'json'})
    pages = sorted(res.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
    for p in pages:
        ii = (p.get('imageinfo') or [{}])[0]
        lic = (ii.get('extmetadata', {}).get('LicenseShortName', {}).get('value') or '').lower()
        if ii.get('mime') != 'image/jpeg' or ii.get('width', 0) < 500:
            continue
        if any(lic.startswith(x) for x in OK_LICENSES):
            return p['title'], ii['thumburl'], lic
    return None


def retro(img):
    img = img.convert('RGB')
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((360, 360))
    img = ImageEnhance.Color(img).enhance(1.35)
    img = ImageEnhance.Contrast(img).enhance(1.12)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    credits = ['# Картинки стартовых тестов\n', 'Wikimedia Commons, только Public domain / CC0.\n']
    import time
    only = set(sys.argv[1:])
    for name, q in WANTED.items():
        if only and name not in only:
            continue
        time.sleep(6)
        try:
            found = find(q)
        except Exception as e:  # noqa: BLE001
            print('ERR', name, e); continue
        if not found:
            print('нет подходящей', name); continue
        title, url, lic = found
        data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        buf = io.BytesIO()
        retro(Image.open(io.BytesIO(data))).save(buf, 'JPEG', quality=42, optimize=True)
        with open(os.path.join(OUT, f'{name}.jpg'), 'wb') as f:
            f.write(buf.getvalue())
        credits.append(f'- `{name}.jpg` — {title} ({lic}) https://commons.wikimedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}\n')
        print('ok', name, len(buf.getvalue()), title)
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf8') as f:
        f.writelines(credits)


if __name__ == '__main__':
    sys.exit(main())
