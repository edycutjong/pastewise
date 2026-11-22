/** Races a promise against a timer and always clears the timer (no stray timers, no late rejections). */
export async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error(message)), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}
