export async function softActualize<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try { return await fn(); } catch (e) {
    console.log(`[soft-actualize] ${label} simulated: ${e}`);
    return fallback;
  }
}
