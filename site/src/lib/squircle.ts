const SQUIRCLE_SEGMENTS = 64;

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
