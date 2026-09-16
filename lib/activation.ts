/** Validated navigation hints only; never used to authorize paid access. */
export function activationUrl(plan?: string | null, billing?: string | null, path = "/upgrade") {
  const params = new URLSearchParams();
  if (path === "/upgrade") params.set("required", "1");
  if (plan && ["starter", "growth", "agency"].includes(plan)) params.set("plan", plan);
  if (billing && ["monthly", "annual"].includes(billing)) params.set("billing", billing);
  return path + (params.size ? `?${params}` : "");
}
