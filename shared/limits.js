export const VERSION = '3.1.0';
export const LIMITS = Object.freeze({
  maxThreads: 32,
  defaultThreads: 4,
  defaultMaxBytes: 0,
  defaultDurationSeconds: 0,
  networkRefreshMs: 30000,
  maxDurationSeconds: 86400,
  maxMiB: 1048576,
  idleTimeoutMs: 10000,
  probeTimeoutMs: 8000,
  probeMaxBytes: 8 * 1024 * 1024,
  probeConcurrency: 4,
  chartPoints: 60,
  maxCustomLinks: 200,
  maxUrlLength: 8192,
  maxNameLength: 120
});
