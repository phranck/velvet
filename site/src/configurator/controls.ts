/**
 * What the controls in the theme panel work out for themselves.
 *
 * A control draws a feature the theme describes, and two of them have to
 * calculate rather than read: an arrangement invents a fresh set of places, and
 * a slider decides how far one press moves it. Both are here rather than in the
 * component so a test can put a number in and read one back.
 */

/**
 * The plastic constant, which is what the golden ratio becomes in two
 * dimensions.
 *
 * The golden ratio spreads one dimension evenly because its powers never fall
 * into step with each other. The same argument in two dimensions gives the real
 * root of x³ = x + 1 rather than of x² = x + 1, and stepping by its reciprocals
 * lays points down so that each new one falls in the largest gap the ones
 * before it left.
 */
const PLASTIC = 1.324_717_957_244_746;

/**
 * A fresh scattering, as places separated by semicolons.
 *
 * Even rather than random. Six points drawn from chance alone clump and leave
 * holes often enough to be the usual result, and a sky with three clouds in one
 * corner is not a sky somebody shuffled to. Stepping by the plastic constant's
 * reciprocals keeps them apart; one random offset per axis is what makes each
 * press give a different sky rather than the same six places every time.
 *
 * Whole percentages, because a wash is soft and wide and a tenth of one moves it
 * by nothing anybody sees.
 *
 * @param count - How many places are wanted.
 * @param random - Where the two offsets come from, each in [0, 1).
 * @returns The places, in the order the theme's properties stand in.
 */
export function shuffledPlaces(
  count: number,
  random: () => number = Math.random,
): string {
  const acrossFrom = random();
  const downFrom = random();
  return Array.from({ length: count }, (_, index) => {
    const step = index + 1;
    const across = (acrossFrom + step / PLASTIC) % 1;
    const down = (downFrom + step / (PLASTIC * PLASTIC)) % 1;
    return `${Math.round(across * 100)}% ${Math.round(down * 100)}%`;
  }).join(";");
}

/**
 * The step a slider moves in, which follows from what it spans.
 *
 * A range of a hundred or less moves a unit at a time, because that is what the
 * numbers in it mean. A wider one moves in hundredths of itself, so a thumb
 * crossing a slider takes the same number of presses whatever it measures.
 *
 * @param minimum - The lowest value.
 * @param maximum - The highest.
 * @returns How far one press or one notch moves it.
 */
export function sliderStep(minimum: number, maximum: number): number {
  const span = maximum - minimum;
  return span <= 100 ? 1 : Math.round(span / 100);
}
