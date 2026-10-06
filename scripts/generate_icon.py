import math
from pathlib import Path
from PIL import Image, ImageDraw

def create_app_icon(output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded squircle
    margin = 12
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=54,
        fill=(15, 17, 26, 255),
        outline=(56, 189, 248, 120),
        width=4,
    )

    # Draw 3D LiDAR scanning cone and layers
    cx, cy = size // 2, size // 2 + 10

    # Top diamond (isometric box top)
    top_poly = [
        (cx, cy - 65),
        (cx + 60, cy - 35),
        (cx, cy - 5),
        (cx - 60, cy - 35),
    ]
    draw.polygon(top_poly, fill=(56, 189, 248, 230), outline=(255, 255, 255, 200))

    # Left face
    left_poly = [
        (cx - 60, cy - 35),
        (cx, cy - 5),
        (cx, cy + 65),
        (cx - 60, cy + 35),
    ]
    draw.polygon(left_poly, fill=(14, 116, 144, 230), outline=(255, 255, 255, 160))

    # Right face
    right_poly = [
        (cx, cy - 5),
        (cx + 60, cy - 35),
        (cx + 60, cy + 35),
        (cx, cy + 65),
    ]
    draw.polygon(right_poly, fill=(79, 70, 229, 230), outline=(255, 255, 255, 160))

    # LiDAR scan pulse rings (arcs/ellipses)
    for r, alpha in [(30, 255), (55, 180), (80, 100)]:
        draw.arc(
            [cx - r, cy - 85 - r//2, cx + r, cy - 85 + r//2],
            start=0,
            end=360,
            fill=(56, 189, 248, alpha),
            width=3,
        )

    img.save(output_path, "PNG")
    print(f"Created app icon at {output_path}")

if __name__ == "__main__":
    icon_path = Path("/home/zaiah/lidarscan-studio/assets/icon.png")
    create_app_icon(icon_path)
