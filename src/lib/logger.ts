type LogFields = Record<string, unknown>;

function serialize(level: "INFO" | "WARN" | "ERROR", event: string, fields: LogFields = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
}

export function maskAddress(value?: string | null) {
  if (!value) return undefined;
  if (value.length <= 6) return value;
  return `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

export const logInfo = (event: string, fields?: LogFields) => console.info(serialize("INFO", event, fields));
export const logWarn = (event: string, fields?: LogFields) => console.warn(serialize("WARN", event, fields));
export const logError = (event: string, error: unknown, fields: LogFields = {}) => console.error(serialize("ERROR", event, {
  ...fields,
  error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
}));
