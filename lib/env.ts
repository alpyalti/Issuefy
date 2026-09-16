/**
 * Optional configuration can explicitly override inherited deployment values.
 * Keep process.env reads at call sites so Next can inline public client values.
 * Only this exact, nonsecret sentinel is disabled; normal values are untouched.
 */
export function configuredEnv(value: string | undefined): string | undefined {
  return value === "__ISSUEFY_DISABLED__" ? undefined : value;
}
