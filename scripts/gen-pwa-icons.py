#!/usr/bin/env python3
"""Generate PWA / home-screen app icons (pure stdlib — no PIL/cairo on this box).

Draws a flat house glyph (matching favicon /home.svg) in white on the brand iris
background (#8b7bff), sized so the glyph sits inside the maskable safe zone (central
80%), so the SAME image works for both `purpose: any` and `purpose: maskable`.

Outputs to public/icons/:
  icon-192.png, icon-512.png   -> web app manifest (any maskable)
  apple-touch-icon-180.png     -> iOS "Add to Home Screen"

Re-run after changing the brand color or glyph:  python3 scripts/gen-pwa-icons.py
"""
import os
import struct
import zlib

BG = (139, 123, 255)      # --color-primary #8b7bff
FG = (255, 255, 255)      # white house
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "icons")

# House geometry in unit square [0,1]; all points within the central 80% safe circle.
ROOF_APEX_Y = 0.20
ROOF_BASE_Y = 0.46
ROOF_HALF   = 0.32        # half-width of eaves at the base
BODY_X0, BODY_X1 = 0.28, 0.72
BODY_Y0, BODY_Y1 = 0.46, 0.80
DOOR_X0, DOOR_X1 = 0.45, 0.55
DOOR_Y0, DOOR_Y1 = 0.60, 0.80


def in_house(u, v):
    # Roof triangle: half-width grows linearly from apex (0) to base (ROOF_HALF).
    if ROOF_APEX_Y <= v <= ROOF_BASE_Y:
        t = (v - ROOF_APEX_Y) / (ROOF_BASE_Y - ROOF_APEX_Y)
        if abs(u - 0.5) <= ROOF_HALF * t:
            return True
    # Body rectangle.
    if BODY_X0 <= u <= BODY_X1 and BODY_Y0 <= v <= BODY_Y1:
        return True
    return False


def in_door(u, v):
    return DOOR_X0 <= u <= DOOR_X1 and DOOR_Y0 <= v <= DOOR_Y1


def render(n):
    row = bytearray()
    px = bytearray()
    for y in range(n):
        px.append(0)  # PNG filter type 0 (None) for this scanline
        v = (y + 0.5) / n
        for x in range(n):
            u = (x + 0.5) / n
            if in_house(u, v) and not in_door(u, v):
                r, g, b = FG
            else:
                r, g, b = BG
            px += bytes((r, g, b, 255))
    return bytes(px)


def png(n, raw):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon-180.png": 180,
    }
    for name, n in targets.items():
        data = png(n, render(n))
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        print(f"wrote {name} ({n}x{n}, {len(data)} bytes)")


if __name__ == "__main__":
    main()
