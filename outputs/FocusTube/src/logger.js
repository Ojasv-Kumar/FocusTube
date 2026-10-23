let debugEnabled = false;
export function setDebug(enabled) { debugEnabled = Boolean(enabled); }
function write(level, moduleName, message, detail) {
  if (level === "debug" && !debugEnabled) return;
  const fn = console[level] || console.log;
  if (detail === undefined) fn(`[FocusTube][${moduleName}] ${message}`);
  else fn(`[FocusTube][${moduleName}] ${message}`, detail);
}
export const logger = Object.freeze({
  debug: (moduleName, message, detail) => write("debug", moduleName, message, detail),
  info: (moduleName, message, detail) => write("info", moduleName, message, detail),
  warn: (moduleName, message, detail) => write("warn", moduleName, message, detail),
  error: (moduleName, message, detail) => write("error", moduleName, message, detail)
});
