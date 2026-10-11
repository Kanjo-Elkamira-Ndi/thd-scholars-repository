export const computeBackoffSeconds = (
  attempts: number,
  baseSeconds: number,
  capSeconds = 3600,
): number => {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(baseSeconds * 2 ** exponent, capSeconds);
};
