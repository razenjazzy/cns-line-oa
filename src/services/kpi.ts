type CounterMap = Map<string, number>;

type KpiState = {
  startedAt: string;
  httpRequests: CounterMap;
  groupBuyGateAllowed: CounterMap;
  groupBuyGateBlocked: CounterMap;
};

const state: KpiState = {
  startedAt: new Date().toISOString(),
  httpRequests: new Map<string, number>(),
  groupBuyGateAllowed: new Map<string, number>(),
  groupBuyGateBlocked: new Map<string, number>(),
};

const increment = (target: CounterMap, key: string): void => {
  const current = target.get(key) || 0;
  target.set(key, current + 1);
};

const toRecord = (target: CounterMap): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [key, value] of target.entries()) {
    out[key] = value;
  }
  return out;
};

export const recordHttpRequest = (path: string, method: string, statusCode: number): void => {
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  increment(state.httpRequests, `${method} ${path} ${statusClass}`);
};

export const recordGroupBuyGate = (allowed: boolean, reason: string): void => {
  if (allowed) {
    increment(state.groupBuyGateAllowed, reason);
    return;
  }
  increment(state.groupBuyGateBlocked, reason);
};

export const getKpiSnapshot = () => {
  return {
    startedAt: state.startedAt,
    now: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(0)),
    httpRequests: toRecord(state.httpRequests),
    groupBuyGateAllowed: toRecord(state.groupBuyGateAllowed),
    groupBuyGateBlocked: toRecord(state.groupBuyGateBlocked),
  };
};
