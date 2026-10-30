/**
 * Whether the process exists and is signalable by this one. `EPERM` counts as alive: the pid is real, someone else
 * owns it. Used to tell a live instance from a leftover record, so nothing is signalled or deleted on a guess.
 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}
