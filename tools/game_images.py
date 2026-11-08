"""Game images the site owner collects by hand (docs/IMAGES.md).

Source files live in static/img/game/<kind>/<id>.<png|jpg|jpeg|webp>. A missing file is fine: the page simply
shows no picture there. The build writes each found file to assets/img/game/<kind>/:

- with Pillow: shrunk to the file size below and saved as WebP (maps also get a small -s thumbnail);
- without Pillow: copied as it is.

GameImages.tag() returns '' when there is no file, so templates can call it everywhere.
"""
import html
import io
import os

KINDS = ('towers', 'upgrades', 'paragons', 'heroes', 'maps', 'bloons', 'bosses')
EXTS = ('.png', '.jpg', '.jpeg', '.webp')
# largest file written per kind: (width, height), 2x the biggest display size in docs/IMAGES.md
FILE_SIZE = {'towers': (192, 192), 'upgrades': (144, 144), 'paragons': (192, 192), 'heroes': (192, 192),
             'maps': (1280, 720), 'bloons': (80, 80), 'bosses': (192, 192)}
THUMB = {'maps': (160, 90)}  # 2x the Maps index size
NOT_SHOWN_YET = ('bloons', 'bosses')  # collected, but no page slot yet

try:
    from PIL import Image
except ImportError:  # the build still works; files are copied unchanged
    Image = None


class GameImages:
    def __init__(self, src_root):
        self.src_root = src_root
        self.found = {}  # (kind, id) -> source path
        self.skipped = []  # files with an upper-case name or an unknown type
        self.used = set()  # (kind, id) a template asked for
        for kind in KINDS:
            d = os.path.join(src_root, kind)
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                stem, ext = os.path.splitext(fn)
                if fn.startswith('.'):
                    continue
                if ext.lower() in EXTS and stem == stem.lower():
                    self.found.setdefault((kind, stem), os.path.join(d, fn))
                else:
                    self.skipped.append(f'{kind}/{fn}')
        self.out = {}  # (kind, id, variant) -> published path relative to the site root

    def __bool__(self):
        return bool(self.found)

    def has(self, kind, gid):
        return (kind, gid) in self.found

    def write_all(self, writer):
        """Write every found image through the site's Writer. Returns the number of source files."""
        for (kind, gid), src in sorted(self.found.items()):
            variants = [('', FILE_SIZE[kind])] + ([('-s', THUMB[kind])] if kind in THUMB else [])
            for suffix, size in variants:
                rel, data = self._convert(kind, gid, src, suffix, size)
                writer.write(rel, data, binary=True)
                self.out[(kind, gid, suffix)] = rel
        return len(self.found)

    def _convert(self, kind, gid, src, suffix, size):
        base = f'assets/img/game/{kind}/{gid}{suffix}'
        if Image is None:
            with open(src, 'rb') as f:
                return base + os.path.splitext(src)[1].lower(), f.read()
        with Image.open(src) as im:
            im = im.convert('RGBA')
            im.thumbnail(size, Image.LANCZOS)  # keeps the aspect ratio, never upscales
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=85, method=6)
        return base + '.webp', buf.getvalue()

    def problems(self):
        """Warnings for the build: files skipped by name, and files no page uses (usually a typo in the id)."""
        out = [f'game image {f} skipped: use a lower-case name ending .png, .jpg or .webp' for f in self.skipped]
        out += [f'game image {k}/{g} is not used on any page: check the name against docs/IMAGES.md'
                for k, g in sorted(set(self.found) - self.used) if k not in NOT_SHOWN_YET]
        return out

    def url(self, kind, gid, suffix=''):
        rel = self.out.get((kind, gid, suffix))
        if rel is None and self.has(kind, gid):  # templates rendered before write_all: predict the name
            ext = '.webp' if Image is not None else os.path.splitext(self.found[(kind, gid)])[1].lower()
            rel = f'assets/img/game/{kind}/{gid}{suffix}{ext}'
        return rel

    def tag(self, kind, gid, w, h, alt, root, cls='', lazy=True, thumb=False):
        """<img> markup for one game image, or '' when the owner hasn't added that file."""
        if not self.has(kind, gid):
            return ''
        self.used.add((kind, gid))
        rel = self.url(kind, gid, '-s' if thumb and kind in THUMB else '')
        c = ('gimg gimg-' + kind + (' ' + cls if cls else '')).strip()
        return (f'<img class="{html.escape(c)}" src="{html.escape(root + rel)}" width="{int(w)}" height="{int(h)}" '
                f'alt="{html.escape(alt or "")}" decoding="async"' + (' loading="lazy"' if lazy else '') + '>')
