/**
 * Rules for a password a user chooses for themselves (first sign-in with a
 * temporary password, or a later change). Returns the problem, or null.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export function newPasswordProblem(
  newPassword: string,
  currentPassword: string,
  identities: Array<string | null | undefined>,
): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (newPassword.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (newPassword === currentPassword) return "Choose a password different from the current one.";
  const lowered = newPassword.trim().toLowerCase();
  if (identities.some(v => v && lowered === v.trim().toLowerCase())) return "Don't use your email or username as your password.";
  return null;
}
