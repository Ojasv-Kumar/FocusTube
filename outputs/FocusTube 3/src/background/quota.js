export function pacificDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function canSpendQuota(usage, costs, limits) {
  return (usage.searchCalls || 0) + (costs.searchCalls || 0) <= limits.searchCalls &&
    (usage.searchUnits || 0) + (costs.searchUnits || 0) <= limits.searchUnits &&
    (usage.otherUnits || 0) + (costs.otherUnits || 0) <= limits.otherUnits;
}
export function addQuotaUsage(usage, costs, dateKey) {
  const base = usage?.dateKey === dateKey ? usage : { dateKey, searchCalls: 0, searchUnits: 0, otherUnits: 0 };
  return { dateKey, searchCalls: (base.searchCalls || 0) + (costs.searchCalls || 0), searchUnits: (base.searchUnits || 0) + (costs.searchUnits || 0), otherUnits: (base.otherUnits || 0) + (costs.otherUnits || 0) };
}
