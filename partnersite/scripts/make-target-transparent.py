from PIL import Image
from collections import deque
from pathlib import Path

src = Path(r"C:\Users\HP\.cursor\projects\c-Users-HP-OneDrive-Desktop-expo-app\assets\no-running-offers-target.png")
img = Image.open(src).convert("RGBA")
w, h = img.size
px = img.load()


def is_bg(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    # near-white / very light gray plate
    if r >= 245 and g >= 245 and b >= 245:
        return True
    # soft off-white
    if r >= 235 and g >= 235 and b >= 235 and abs(r - g) < 8 and abs(g - b) < 8:
        return True
    return False


visited = [[False] * w for _ in range(h)]
q: deque[tuple[int, int]] = deque()

for x in range(w):
    for y in (0, h - 1):
        r, g, b, a = px[x, y]
        if is_bg(r, g, b, a):
            q.append((x, y))
            visited[y][x] = True
for y in range(h):
    for x in (0, w - 1):
        r, g, b, a = px[x, y]
        if is_bg(r, g, b, a) and not visited[y][x]:
            q.append((x, y))
            visited[y][x] = True

while q:
    x, y = q.popleft()
    r, g, b, a = px[x, y]
    if is_bg(r, g, b, a):
        px[x, y] = (r, g, b, 0)
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
            rr, gg, bb, aa = px[nx, ny]
            if is_bg(rr, gg, bb, aa):
                visited[ny][nx] = True
                q.append((nx, ny))

outs = [
    src,
    Path(r"C:\Users\HP\OneDrive\Desktop\expo_app\partnersite\public\no-running-offers-target.png"),
    Path(r"C:\Users\HP\OneDrive\Desktop\expo_app\partnersite\public\offers\no-running-offers-target.png"),
    Path(r"C:\Users\HP\OneDrive\Desktop\expo_app\partnersite\src\assets\offers\no-running-offers-target.png"),
    Path(r"C:\Users\HP\OneDrive\Desktop\expo_app\apps\merchant_app\assets\no-running-offers-target.png"),
]
for p in outs:
    p.parent.mkdir(parents=True, exist_ok=True)
    img.save(p, "PNG")
    print("saved", p, p.stat().st_size)
