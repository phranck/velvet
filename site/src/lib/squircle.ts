const SQUIRCLE_SEGMENTS = 64;

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function point(x: number, y: number): string {
  return `${formatCoordinate(x)} ${formatCoordinate(y)}`;
}

export function createSquirclePath(
  size: number,
  inset = 0,
  segments = SQUIRCLE_SEGMENTS,
): string {
  if (!Number.isFinite(size) || size <= 0) return "";

  const safeInset = Math.max(Number.isFinite(inset) ? inset : 0, 0);
  const radius = size / 2 - safeInset;
  if (radius <= 0) return "";

  const center = size / 2;
  const segmentCount = Math.max(
    4,
    Math.floor(Number.isFinite(segments) ? segments : SQUIRCLE_SEGMENTS),
  );

  return `${Array.from({ length: segmentCount }, (_, index) => {
    const angle = (index / segmentCount) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = center + radius * Math.sign(cosine) * Math.sqrt(Math.abs(cosine));
    const y = center + radius * Math.sign(sine) * Math.sqrt(Math.abs(sine));
    return `${index === 0 ? "M" : "L"}${point(x, y)}`;
  }).join(" ")} Z`;
}

export const SQUIRCLE_PATH = createSquirclePath(100, 3);
