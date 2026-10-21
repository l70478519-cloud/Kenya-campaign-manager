import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/records";
import { useAuth } from "@/lib/auth";

export type Campaign = {
  id: number; organisationId: number; organisationName: string; name: string; seat: string | null; area: string | null;
  electionDate: string | null; status: string; wards: string[]; constituency: string | null;
  candidateName: string | null; county: string | null; party: string | null; profileSummary: string | null;
};
export type TenancyContext = { activeCampaignId: number | null; primaryCampaignId: number; campaigns: Campaign[]; allModulesIsolated?: boolean };

/** Older modules. Hidden outside the primary campaign only if the server reports database isolation is off. */
export const LEGACY_HREFS = new Set([
  "/dashboard", "/deepfake", "/wa-templates", "/strategist", "/analytics", "/campaign-plan", "/members", "/voters-db", "/segments", "/messaging", "/speeches",
  "/events", "/operations", "/kol", "/field-ops", "/volunteers", "/surveys", "/intelligence", "/narrative-response",
  "/social-listening", "/swot", "/election-day", "/turnout", "/fundraising", "/credentials",
]);

export function useTenancy() {
  const { user, mfaEnrollmentRequired } = useAuth();
  return useQuery<TenancyContext>({
    queryKey: ["tenancy-context", user?.id ?? null],
    queryFn: () => api<TenancyContext>("tenancy/context"),
    enabled: !!user && !mfaEnrollmentRequired,
    staleTime: 60_000,
  });
}

export async function switchCampaign(campaignId: number) {
  await api("tenancy/switch", { method: "POST", body: JSON.stringify({ campaignId }) });
  // Every cached query belongs to the old campaign; a reload is the simplest guarantee.
  window.location.assign(`${import.meta.env.BASE_URL}dashboard`);
}

/** True when an older module must be hidden in the active campaign. */
export function legacyHidden(t: TenancyContext | undefined): boolean {
  return !!t && !t.allModulesIsolated && t.activeCampaignId !== t.primaryCampaignId;
}
