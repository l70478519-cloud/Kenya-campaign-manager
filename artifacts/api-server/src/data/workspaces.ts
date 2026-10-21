/**
 * Active workspace registry for the Kaiti Constituency Command Centre.
 *
 * Only Makueni is exposed by the running application. Future workspaces are
 * documented separately so they cannot appear in active selectors or be
 * accepted as active workspace IDs until explicitly configured and reviewed.
 */
export type WorkspaceDefinition = {
  id: string;
  label: string;
  level: "county" | "sub-county" | "county-and-sub-county";
  geographyReady: boolean;
  parentWorkspaceId?: string;
};

/** Workspaces visible/usable in the current deployment. Keep Kaiti only. */
export const WORKSPACES: readonly WorkspaceDefinition[] = [
  {
    id: "kaiti",
    label: "Kaiti Constituency",
    level: "sub-county",
    geographyReady: true,
  },
] as const;

/**
 * Future workspaces are intentionally excluded from this deployment.
 * They must not be shown in the Kaiti interface or accepted as active
 * workspace IDs until their geography, data isolation, and permissions are
 * implemented and verified.
 */
export const PLANNED_WORKSPACES: readonly WorkspaceDefinition[] = [] as const;

export const DEFAULT_WORKSPACE_ID = "kaiti";

export function getWorkspace(id: string): WorkspaceDefinition | undefined {
  return WORKSPACES.find((workspace) => workspace.id === id);
}

/**
 * Keep future records tenant/workspace scoped. Call this when adding workspace
 * IDs to database-backed records; do not infer a workspace from a ward label.
 * Unknown or not-yet-enabled workspace IDs safely resolve to Kaiti.
 */
export function normalizeWorkspaceId(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_WORKSPACE_ID;
  const normalized = value.trim().toLowerCase();
  return getWorkspace(normalized) ? normalized : DEFAULT_WORKSPACE_ID;
}
