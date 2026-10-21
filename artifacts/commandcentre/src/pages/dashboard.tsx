import { WARDS, CAMPAIGN } from "@/lib/wards";
import { useGetDashboardSummary, useGetDashboardActivity } from "@workspace/api-client-react";
import { Users, MessageSquare, Map, ShieldAlert, Target, Calendar, Zap, Clock, TrendingUp, Activity, User, Building2 } from "lucide-react";

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: any; sub?: string }) {
  return (
    <div className="bg-card border border-border p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function ThreatBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "text-blue-400 border-blue-400/30",
    medium: "text-yellow-400 border-yellow-400/30",
    high: "text-orange-400 border-orange-400/30",
    critical: "text-red-400 border-red-400/30 animate-pulse",
  };
  return (
    <span className={`font-mono text-[10px] border px-2 py-0.5 ${colors[level] ?? colors.low}`}>
      [ {level.toUpperCase()} ]
    </span>
  );
}

function ModuleTag({ module }: { module: string }) {
  const tags: Record<string, string> = {
    members: "IDENTITY",
    messaging: "UPLINK",
    "field-ops": "FIELD",
    volunteers: "VOLUNTEER",
    intelligence: "INTEL",
    "campaign-plan": "PLAN",
    events: "EVENT",
    surveys: "SURVEY",
    kol: "KOL",
    segments: "SEGMENT",
  };
  return (
    <span className="font-mono text-[9px] text-primary border border-primary/30 px-1.5 py-0.5">
      {tags[module] ?? module.toUpperCase()}
    </span>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">COMMAND OVERVIEW</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-1 tracking-widest">[ CAMPAIGN_READ ] [ LIVE_DATA ]</p>
        </div>
        {summary?.daysToElection != null && (
          <div className="bg-primary/10 border border-primary/30 px-6 py-3 text-center">
            <div className="text-4xl font-bold text-primary tabular-nums">{summary.daysToElection}</div>
            <div className="text-[9px] font-mono text-primary/80 tracking-widest mt-1">DAYS TO ELECTION</div>
          </div>
        )}
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="TOTAL MEMBERS" value={summary.totalMembers.toLocaleString()} icon={Users} sub="IDENTITY GRAPH" />
          <StatCard label="ACTIVE VOLUNTEERS" value={summary.activeVolunteers} icon={Activity} sub="DEPLOYED" />
          <StatCard label="MESSAGES SENT" value={summary.messagesSent.toLocaleString()} icon={MessageSquare} sub="ALL CHANNELS" />
          <StatCard label="DOORS KNOCKED" value={summary.doorsKnocked.toLocaleString()} icon={Map} sub="FIELD OPS" />
          <StatCard label="WARDS COVERED" value={summary.wardsCovered} icon={TrendingUp} sub="ACTIVE ZONES" />
          <StatCard label="OPEN THREATS" value={summary.openThreats} icon={ShieldAlert} sub="NARRATIVE" />
          <StatCard label="READINESS SCORE" value={`${summary.campaignReadiness}%`} icon={Target} sub="OVERALL" />
          <StatCard label="UPCOMING EVENTS" value={summary.upcomingEvents} icon={Calendar} sub="SCHEDULED" />
        </div>
      ) : null}

      {/* Candidate Profile + Constituency Intel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs tracking-widest">CANDIDATE_PROFILE</span>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="font-bold text-sm tracking-wide">{(CAMPAIGN.candidate || CAMPAIGN.name).toUpperCase()}</p>
                <p className="font-mono text-[10px] text-primary tracking-widest mt-0.5">{`${CAMPAIGN.constituency} ${CAMPAIGN.seat ?? ""} campaign`.toUpperCase()}</p>
              </div>
              <span className="font-mono text-[9px] border border-primary/30 px-2 py-0.5 text-primary shrink-0">2027</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                ["WORKSPACE", CAMPAIGN.name],
                ["COUNTY", CAMPAIGN.county || "—"],
                ["ASSEMBLY WARDS", String(WARDS.length)],
                ["WARDS", WARDS.slice(0, Math.ceil(WARDS.length / 2)).join(" · ")],
                ["OTHER WARDS", WARDS.slice(Math.ceil(WARDS.length / 2)).join(" · ") || "—"],
                ["POLLING STATIONS", "Awaiting verified IEBC import"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="font-mono text-[8px] text-muted-foreground">{k}</p>
                  <p className="font-mono text-[10px] text-foreground">{v}</p>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border">
              <p className="font-mono text-[8px] text-muted-foreground tracking-widest mb-1">DATA STATUS</p>
              <p className="font-mono text-[10px] text-muted-foreground">Single-campaign workspace. Live operational counts come from the database. Polling-station totals require verified IEBC records.</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs tracking-widest">CONSTITUENCY_INTEL</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "ELECTORAL AREA", value: CAMPAIGN.areaLabel },
                { label: "ASSEMBLY WARDS", value: String(WARDS.length) },
                { label: "WARD NAMES", value: WARDS.join(", ") },
                { label: "POLLING STATIONS", value: "Pending", note: `Import verified ${CAMPAIGN.constituency} IEBC station records` },
              ].map(({ label, value, note }) => (
                <div key={label} className="bg-secondary/50 px-3 py-3">
                  <p className="font-mono text-[8px] text-muted-foreground">{label}</p>
                  <p className="font-bold text-lg tabular-nums text-primary">{value}</p>
                  {note && <p className="font-mono text-[8px] text-muted-foreground mt-1">{note}</p>}
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 space-y-1">
              <p className="font-mono text-[9px] text-muted-foreground">LEGACY FIGURES REMOVED</p>
              <p className="font-mono text-[9px] text-muted-foreground">Polling-station and voter data will appear only after verified constituency-specific IEBC records are imported.</p>
              <a className="font-mono text-[9px] text-primary underline" href="https://www.iebc.or.ke/docs/rov_per_polling_station.pdf" target="_blank" rel="noreferrer">OPEN OFFICIAL IEBC 2022 REGISTER</a>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs tracking-widest">ACTIVITY_FEED</span>
          </div>
          {activityLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-secondary/50 animate-pulse" />
              ))}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="divide-y divide-border">
              {activity.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <ModuleTag module={item.module} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.description}</p>
                    {item.actor && (
                      <p className="text-[10px] font-mono text-muted-foreground">OPERATIVE: {item.actor}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="font-mono text-xs text-muted-foreground">[ NO_ACTIVITY_RECORDED ]</p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs tracking-widest">SYSTEM_STATUS</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="font-mono text-[10px] text-muted-foreground">Live service health is not yet connected to this panel. Operational status must be confirmed from provider checks and API monitoring.</p>
            <span className="font-mono text-[10px] text-yellow-400 border border-yellow-400/30 px-2 py-1 inline-block">SERVICE HEALTH NOT VERIFIED</span>
          </div>
        </div>
      </div>
    </div>
  );
}