"""Растеризация иконки приложения из геометрии assets/icon.svg.

Android берёт иконку из векторов (res/drawable/ic_launcher_*.xml), но стор, веб
и iOS требуют PNG, поэтому нужен растр. Единственная зависимость — Pillow.

    python tools/icon/render_icon.py

Геометрия описана в CANVAS-координатах 108x108 — тех же, что в SVG и в
VectorDrawable. Дублирование намеренное и проверяемое: числа ниже совпадают со
строками pathData один в один, разойтись незаметно они не могут.

Растеризуется с четырёхкратным оверсэмплингом: у Pillow нет сглаживания, круглые
стыки и торцы иначе выходят рваными на 48 px.
"""

from math import cos, radians, sin
from pathlib import Path

from PIL import Image, ImageDraw

CANVAS = 108.0
OVERSAMPLE = 4

BACKGROUND = (0x12, 0x26, 0x3A, 0xFF)
FRAME = (0xFF, 0xFF, 0xFF, 0xFF)
SOUND = (0x35, 0xC4, 0xF0, 0xFF)
WHITE = (0xFF, 0xFF, 0xFF, 0xFF)

# Треугольник «play»: вершины и толщина обводки, дающей скруглённые углы.
TRIANGLE = ((30.0, 35.0), (30.0, 73.0), (54.0, 54.0))
TRIANGLE_STROKE = 6.0

# Дуги звука: общий центр, радиусы, полураствор в градусах, толщина.
ARC_CENTER = (56.0, 54.0)
ARC_RADII = (9.0, 17.5, 26.0)
ARC_HALF_ANGLE = 50.0
ARC_STROKE = 5.0

ROOT = Path(__file__).resolve().parents[2]


def _dot(draw, xy, radius, color, scale):
    """Круг радиуса radius в координатах холста — им скругляются стыки и торцы."""
    x, y = xy[0] * scale, xy[1] * scale
    r = radius * scale
    draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def _draw_art(draw, scale, frame_color, sound_color):
    points = [(x * scale, y * scale) for x, y in TRIANGLE]
    draw.polygon(points, fill=frame_color)
    draw.line(points + [points[0]], fill=frame_color, width=round(TRIANGLE_STROKE * scale))
    for vertex in TRIANGLE:
        _dot(draw, vertex, TRIANGLE_STROKE / 2, frame_color, scale)

    cx, cy = ARC_CENTER
    for radius in ARC_RADII:
        # Pillow наращивает толщину внутрь от габаритного прямоугольника, а не
        # симметрично осевой линии: чтобы радиус означал середину штриха (как в
        # SVG), рамку берём шире на половину толщины.
        outer = radius + ARC_STROKE / 2
        box = (
            (cx - outer) * scale,
            (cy - outer) * scale,
            (cx + outer) * scale,
            (cy + outer) * scale,
        )
        draw.arc(box, -ARC_HALF_ANGLE, ARC_HALF_ANGLE, fill=sound_color,
                 width=round(ARC_STROKE * scale))
        # Торцы: Pillow рисует дугу с прямым срезом, круглый край добавляем сами.
        for sign in (-1, 1):
            angle = radians(sign * ARC_HALF_ANGLE)
            _dot(draw, (cx + radius * cos(angle), cy + radius * sin(angle)),
                 ARC_STROKE / 2, sound_color, scale)


def render(size, background=None, art=True, frame_color=FRAME, sound_color=SOUND):
    big = size * OVERSAMPLE
    scale = big / CANVAS
    image = Image.new("RGBA", (big, big), background or (0, 0, 0, 0))
    if art:
        _draw_art(ImageDraw.Draw(image), scale, frame_color, sound_color)
    return image.resize((size, size), Image.LANCZOS)


def main():
    assets = ROOT / "assets"
    outputs = {
        # Иконка для стора, iOS и превью Expo: фон внутри картинки.
        "icon.png": render(1024, background=BACKGROUND),
        # Слои адаптивной иконки — вход для `expo prebuild`, если его когда-то
        # запустят на чистом дереве. Android в сборке берёт вектор, не их.
        "android-icon-foreground.png": render(1024),
        "android-icon-background.png": render(1024, background=BACKGROUND, art=False),
        "android-icon-monochrome.png": render(1024, frame_color=WHITE, sound_color=WHITE),
        "favicon.png": render(48, background=BACKGROUND),
    }
    for name, image in outputs.items():
        path = assets / name
        image.save(path)
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size} B")


if __name__ == "__main__":
    main()
