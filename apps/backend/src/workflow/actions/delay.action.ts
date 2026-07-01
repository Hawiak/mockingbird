export async function executeDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
