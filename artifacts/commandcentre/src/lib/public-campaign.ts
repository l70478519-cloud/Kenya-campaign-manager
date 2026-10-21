import { useEffect, useState } from "react";

/** Name and wards of the campaign that owns public forms (no sign-in needed). */
export type PublicCampaign = { name: string; candidate: string; areaLabel: string; wards: string[] };
let cached: Promise<PublicCampaign> | null = null;

export function usePublicCampaign(): PublicCampaign {
  const [c, setC] = useState<PublicCampaign>({ name: "", candidate: "", areaLabel: "", wards: [] });
  useEffect(() => {
    cached ??= fetch(`${import.meta.env.BASE_URL}api/public/campaign`).then(r => r.ok ? r.json() : Promise.reject(new Error("unavailable")));
    cached.then(setC).catch(() => { cached = null; });
  }, []);
  return c;
}
