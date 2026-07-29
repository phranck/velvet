import type { NormalizedJsonAssertion } from "@velvet/contracts";

const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

const decodePointerSegment = (segment: string): string =>
  segment.replaceAll("~1", "/").replaceAll("~0", "~");

function valueAtPointer(document: unknown, pointer: string): unknown {
  let current = document;
  for (const encodedSegment of pointer.slice(1).split("/")) {
    const segment = decodePointerSegment(encodedSegment);
    if (UNSAFE_SEGMENTS.has(segment)) return undefined;

    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment)) return undefined;
      const index = Number(segment);
      if (index >= current.length) return undefined;
      current = current[index];
      continue;
    }

    if (
      typeof current !== "object" ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function assertionsMatch(
  document: unknown,
  assertions: NormalizedJsonAssertion[],
): boolean {
  return assertions.every((assertion) =>
    Object.is(valueAtPointer(document, assertion.path), assertion.equals),
  );
}
