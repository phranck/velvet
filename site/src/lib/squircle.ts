const SQUIRCLE_SEGMENTS = 64;

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function point(x: number, y: number): string {
  return `${formatCoordinate(x)} ${formatCoordinate(y)}`;
}

export function createSquircleRectPath(
  width: number,
  height: number,
  cornerRadius: number,
  inset = 0,
  segmentsPerCorner = 12,
): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "";
  }

  const safeInset = Math.min(
    Math.max(Number.isFinite(inset) ? inset : 0, 0),
    width / 2,
    height / 2,
  );
  const left = safeInset;
  const top = safeInset;
  const right = width - safeInset;
  const bottom = height - safeInset;
  const availableWidth = right - left;
  const availableHeight = bottom - top;

  if (availableWidth <= 0 || availableHeight <= 0) return "";

  const safeCornerRadius = Math.max(
    Number.isFinite(cornerRadius) ? cornerRadius - safeInset : 0,
    0,
  );
  const radius = Math.min(safeCornerRadius, availableWidth / 2, availableHeight / 2);
  const segmentCount = Math.max(
    1,
    Math.floor(Number.isFinite(segmentsPerCorner) ? segmentsPerCorner : 12),
  );

  if (radius === 0) {
    return `M${point(left, top)} L${point(right, top)} L${point(right, bottom)} L${point(left, bottom)} Z`;
  }

  const commands = [
    `M${point(left + radius, top)}`,
    `L${point(right - radius, top)}`,
  ];

  function appendCorner(
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number,
  ): void {
    for (let index = 1; index <= segmentCount; index += 1) {
      const angle = startAngle + ((endAngle - startAngle) * index) / segmentCount;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const x = centerX + radius * Math.sign(cosine) * Math.sqrt(Math.abs(cosine));
      const y = centerY + radius * Math.sign(sine) * Math.sqrt(Math.abs(sine));
      commands.push(`L${point(x, y)}`);
    }
  }

  appendCorner(right - radius, top + radius, -Math.PI / 2, 0);
  commands.push(`L${point(right, bottom - radius)}`);
  appendCorner(right - radius, bottom - radius, 0, Math.PI / 2);
  commands.push(`L${point(left + radius, bottom)}`);
  appendCorner(left + radius, bottom - radius, Math.PI / 2, Math.PI);
  commands.push(`L${point(left, top + radius)}`);
  appendCorner(left + radius, top + radius, Math.PI, (Math.PI * 3) / 2);
  commands.push("Z");

  return commands.join(" ");
}

export const SQUIRCLE_PATH = `${Array.from(
  { length: SQUIRCLE_SEGMENTS },
  (_, index) => {
    const angle = (index / SQUIRCLE_SEGMENTS) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = 50 + 47 * Math.sign(cosine) * Math.sqrt(Math.abs(cosine));
    const y = 50 + 47 * Math.sign(sine) * Math.sqrt(Math.abs(sine));
    return `${index === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`;
  },
).join(" ")} Z`;
