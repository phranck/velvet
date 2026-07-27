export interface SliderOption {
  value: number;
  label: string;
  output: string;
}

export interface SliderModelInput {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  output?: string;
  options?: SliderOption[];
}

export interface SliderModel {
  inputMin: number;
  inputMax: number;
  inputStep: number;
  inputValue: number;
  ratio: number;
  output: string;
  ariaValueText: string;
  positions: number[];
  options: SliderOption[];
  valueFromInput: (value: string) => number;
}

export function createSliderModel(input: SliderModelInput): SliderModel {
  if (input.options?.length) {
    const options = input.options;
    const selectedIndex = Math.max(
      0,
      options.findIndex(({ value }) => value === input.value),
    );
    const selected = options[selectedIndex] ?? options[0];
    const positions = options.map((_, index) => ratio(index, options.length - 1));

    return {
      inputMin: 0,
      inputMax: Math.max(0, options.length - 1),
      inputStep: 1,
      inputValue: selectedIndex,
      ratio: positions[selectedIndex] ?? 0,
      output: selected.output,
      ariaValueText:
        selected.label === selected.output
          ? selected.output
          : `${selected.label}, ${selected.output}`,
      positions,
      options,
      valueFromInput: (value) =>
        options[clamp(Math.round(Number(value)), 0, options.length - 1)]?.value ??
        selected.value,
    };
  }

  const min = finite(input.min, 0);
  const max = Math.max(min, finite(input.max, 100));
  const step = Math.max(Number.EPSILON, finite(input.step, 1));
  const value = clamp(input.value, min, max);
  const stepCount = Math.floor((max - min) / step);

  return {
    inputMin: min,
    inputMax: max,
    inputStep: step,
    inputValue: value,
    ratio: ratio(value - min, max - min),
    output: input.output ?? String(value),
    ariaValueText: input.output ?? String(value),
    positions: Array.from({ length: stepCount + 1 }, (_, index) =>
      ratio(index, stepCount),
    ),
    options: [],
    valueFromInput: (next) => clamp(Number(next), min, max),
  };
}

function ratio(value: number, range: number): number {
  return range > 0 ? value / range : 0;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
