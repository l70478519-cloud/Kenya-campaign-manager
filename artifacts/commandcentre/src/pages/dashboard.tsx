import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboardActivity } from "@workspace/api-client-react";
import {
  Users,
  UserPlus,
  Radio,
  Map,
  Activity,
  MessageSquare,
  HeartPulse,
  Download,
  BookOpen,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { api } from "@/lib/records";
import { useTenancy } from "@/lib/tenancy";
import { Link } from "wouter";

type Overview = {
  totalMembers: number;
  newThisMonth: number;
  previousMonth: number;
  growthRate: number | null;
  activeVolunteers: number;
  openTasks: number;
  messagesThisMonth: number;
  acquisition: { date: string; members: number }[];
};

export default function Dashboard() {
  const overview = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => api<Overview>("dashboard/overview"),
    refetchInterval: 60_000,
  });
  const {
    data: activity,
    isLoading: activityLoading,
    isError: activityError,
  } = useGetDashboardActivity();
  const { data: tenancy } = useTenancy();
  // This campaign's own area only; other campaigns are never counted here.
  const active = tenancy?.campaigns.find((c) => c.id === tenancy.activeCampaignId);
  const myArea = useQuery({
    queryKey: ["my-area-totals", tenancy?.activeCampaignId],
    queryFn: () => api<{ label: string; totals: { wards: number; centres: number } }>("geography/my-area?centres=0"),
    enabled: !!tenancy?.activeCampaignId,
  });
  const [help, setHelp] = useState(false);
  const [fullTrail, setFullTrail] = useState(false);
  const d = overview.data;
  const number = (value: number | undefined) =>
    value === undefined ? "—" : value.toLocaleString("en-KE");
  const stats = [
    {
      label: "TOTAL BASE",
      value: number(d?.totalMembers),
      icon: Users,
      note: d ? `+${number(d.newThisMonth)} this month` : undefined,
      title: "Members registered in the active campaign",
    },
    {
      label: "GROWTH RATE",
      value: d?.growthRate == null ? "—" : `${d.growthRate}%`,
      icon: UserPlus,
      title:
        "New members this calendar month compared with last month; unavailable without a previous-month baseline",
    },
    {
      label: "POLLING CENTRES",
      value: number(myArea.data?.totals.centres),
      icon: Radio,
      note: myArea.data ? `${number(myArea.data.totals.wards)} wards` : undefined,
      title: "IEBC polling centres in this campaign's area",
    },
    {
      label: "VOLUNTEERS",
      value: number(d?.activeVolunteers),
      icon: Map,
      title: "Active volunteers in this campaign",
    },
    {
      label: "OPEN TASKS",
      value: number(d?.openTasks),
      icon: Activity,
      title: "Unfinished volunteer assignments and operations tasks",
    },
    {
      label: "MSGS SENT (MO)",
      value: number(d?.messagesThisMonth),
      icon: MessageSquare,
      title:
        "Recipients of dispatched messages this calendar month; not a delivery confirmation",
    },
  ];
  const download = () => {
    if (!d) return;
    const rows = [
      ["Metric", "Value"],
      ...stats.map((s) => [s.label, s.value]),
      ["Generated at", new Date().toISOString()],
    ];
    const blob = new Blob(
      [
        rows
          .map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(","))
          .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign-dashboard-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-7">
      {active && (
        <Link href="/my-area" className="replica-panel p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">CANDIDATE</p>
            <h2 className="text-xl font-bold truncate">{active.candidateName || active.name}</h2>
            <p className="text-sm text-muted-foreground">
              {[active.party, active.seat, myArea.data?.label ?? active.area, active.electionDate ? `election ${active.electionDate}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="text-sm text-primary underline">View my area</span>
        </Link>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => setHelp(!help)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <BookOpen className="h-4 w-4" />
          How this works
        </button>
      </div>
      {help && (
        <div className="replica-panel p-5 text-sm text-muted-foreground">
          Figures reflect your campaign records. Growth compares new
          registrations this month with last month. The chart shows weekly
          registrations over twelve weeks. Hover over a card for its definition.
          Calendar periods use Kenya time.
        </div>
      )}
      {overview.isError && (
        <div role="alert" className="text-sm text-red-400">
          Dashboard data could not be loaded.{" "}
          <button className="underline" onClick={() => void overview.refetch()}>
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 xl:gap-5">
        {stats.map(({ label, value, icon: Icon, note, title }) => (
          <div key={label} title={title} className="replica-panel replica-stat">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-xs sm:text-sm font-semibold tracking-wide text-muted-foreground">
                {label}
              </span>
              <Icon className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <strong aria-busy={overview.isLoading}>{value}</strong>
            {note && (
              <span className="mt-3 inline-block rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
                {note}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-7 xl:grid-cols-[2.2fr_1fr]">
        <section className="replica-panel min-w-0 p-5 sm:p-7">
          <h2 className="replica-title mb-7">MEMBER ACQUISITION VELOCITY</h2>
          <div className="replica-chart">
            {overview.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading registrations…
              </p>
            ) : d ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={d.acquisition}
                  margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="acquisition-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#008c51"
                        stopOpacity={0.28}
                      />
                      <stop offset="100%" stopColor="#008c51" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#25292e" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) =>
                      new Date(`${v}T12:00:00Z`).toLocaleDateString("en-KE", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#16181b",
                      border: "1px solid #30353b",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Area
                    name="Members"
                    type="monotone"
                    dataKey="members"
                    stroke="#12b76a"
                    strokeWidth={2}
                    fill="url(#acquisition-fill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">
                Registration history unavailable.
              </p>
            )}
          </div>
        </section>
        <section className="replica-panel min-w-0 p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="replica-title">LIVE ACTIVITY FEED</h2>
            <button
              onClick={() => setFullTrail(true)}
              className="shrink-0 text-xs text-primary"
            >
              Full trail ↗
            </button>
          </div>
          <div className="replica-chart overflow-y-auto pr-2">
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">Loading activity…</p>
            ) : activityError ? (
              <p role="alert" className="text-sm text-red-400">
                Activity could not be loaded.
              </p>
            ) : !activity?.length ? (
              <p className="text-sm text-muted-foreground">
                No activity recorded.
              </p>
            ) : (
              activity.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 border-b border-border py-3 first:pt-0"
                >
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                  <div className="min-w-0">
                    <p className="text-sm leading-6">{item.description}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {new Date(item.timestamp).toLocaleString("en-KE", {
                        timeZone: "Africa/Nairobi",
                      })}{" "}
                      · {item.module}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <HeartPulse className="h-5 w-5 text-red-500" />
          <h2 className="replica-title">CAMPAIGN HEALTH</h2>
          <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
            {overview.isError
              ? "Data unavailable"
              : !d
                ? "Awaiting data"
                : d.openTasks
                  ? "Needs Attention"
                  : "No open tasks"}
          </span>
          <button
            disabled={!d}
            onClick={download}
            className="ml-auto flex items-center gap-2 rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Download report
          </button>
        </div>
        <div className="replica-panel mt-4 p-5 text-sm text-muted-foreground">
          {d
            ? `${number(d.openTasks)} open tasks · ${number(d.activeVolunteers)} active volunteers`
            : "Awaiting campaign data"}
        </div>
      </section>
      {fullTrail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setFullTrail(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Recent activity trail"
            className="replica-panel max-h-[80vh] w-full max-w-2xl overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              aria-label="Close activity trail"
              onClick={() => setFullTrail(false)}
              className="float-right"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">Recent activity trail</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Latest 15 recorded campaign actions.
            </p>
            {activity?.map((item) => (
              <div
                key={item.id}
                className="border-b border-border py-4 text-sm"
              >
                <p>{item.description}</p>
                <time className="text-xs text-muted-foreground">
                  {new Date(item.timestamp).toLocaleString("en-KE", {
                    timeZone: "Africa/Nairobi",
                  })}
                </time>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
