/** Mandatory enrolment is temporarily opt-in; enrolled accounts still verify codes. */
const normRole = (role: string) => role.toLowerCase().replace(/[^a-z0-9]/g, "");
export function roleRequiresMfa(role: string): boolean {
  const list = (process.env.MFA_REQUIRED_ROLES ?? "")
    .split(",").map(s => normRole(s.trim())).filter(Boolean);
  return list.includes("all") || list.includes(normRole(role));
}
