/** How a sweep is triggered, so the schedule can be tested without one. */
export interface AutomaticSweepSchedule {
  /** Starts a sweep. Failures are the caller's to report. */
  run: () => void;
  /** How often to sweep, in milliseconds. */
  intervalMs: number;
  /** How long after start-up the first sweep waits. */
  startDelayMs: number;
  setTimeout?: (callback: () => void, ms: number) => { unref?: () => void };
  setInterval?: (callback: () => void, ms: number) => { unref?: () => void };
}

/**
 * Schedules the security sweep: once shortly after start-up, then repeatedly.
 *
 * The early run is what stops a deploy from postponing the sweep by a whole
 * interval. With an interval alone, a service deployed more often than it
 * sweeps never sweeps at all, and that fails precisely when a security release
 * has just shipped in the deploy that reset the clock.
 *
 * The delay before that first run keeps two things apart. The service is
 * answering requests before it starts background work, and a service caught in
 * a restart loop cannot turn into a request loop against GitHub.
 *
 * Both timers are unreferenced where the runtime allows it, so a sweep waiting
 * to run never keeps the process alive on its own. Serving is what the process
 * is for.
 *
 * @param schedule - What to run, how often, and how long to wait first.
 * @returns Nothing. The timers are deliberately not handed back, because
 *   nothing in the service stops sweeping whilst it is still serving.
 */
export function scheduleAutomaticSweeps(
  schedule: AutomaticSweepSchedule,
): void {
  if (schedule.intervalMs <= 0) return;

  const timeout = schedule.setTimeout ?? globalThis.setTimeout;
  const interval = schedule.setInterval ?? globalThis.setInterval;

  timeout(schedule.run, schedule.startDelayMs).unref?.();
  interval(schedule.run, schedule.intervalMs).unref?.();
}
