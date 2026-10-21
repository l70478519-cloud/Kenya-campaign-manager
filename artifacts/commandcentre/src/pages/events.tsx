import { WARDS } from "@/lib/wards";
import { useState } from "react";
import {
  useListEvents, useCreateEvent, useUpdateEvent, useDeleteEvent,
  getListEventsQueryKey
} from "@workspace/api-client-react";
import type { CampaignEventInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, Check, Trash2, Calendar, MapPin, Users } from "lucide-react";

const EVENT_TYPES = ["rally", "townhall", "canvass", "fundraiser", "debate", "training", "press_conference", "community"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "text-blue-400 border-blue-400/30",
    active: "text-green-400 border-green-400/30 animate-pulse",
    completed: "text-muted-foreground border-border",
    cancelled: "text-red-400 border-red-400/30",
  };
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${map[status] ?? "text-muted-foreground border-border"}`}>[ {status.toUpperCase()} ]</span>;
}

export default function Events() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [upcoming, setUpcoming] = useState(true);
  const [form, setForm] = useState<Partial<CampaignEventInput>>({ type: "rally" });

  const { data: events, isLoading } = useListEvents({ upcoming: upcoming || undefined });
  const createEvent = useCreateEvent({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListEventsQueryKey() }); setShowAdd(false); setForm({ type: "rally" }); } } });
  const deleteEvent = useDeleteEvent({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListEventsQueryKey() }) } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest">EVENT LOGISTICS</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-1">CAMPAIGN EVENT COMMAND</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90">
          <Plus className="w-3 h-3" /> SCHEDULE EVENT
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setUpcoming(true)} className={`font-mono text-[10px] border px-4 py-2 transition-colors ${upcoming ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>UPCOMING</button>
        <button onClick={() => setUpcoming(false)} className={`font-mono text-[10px] border px-4 py-2 transition-colors ${!upcoming ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>ALL EVENTS</button>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/50 p-4">
          <h3 className="font-mono text-xs tracking-widest mb-4">SCHEDULE EVENT</h3>
          <form onSubmit={e => { e.preventDefault(); createEvent.mutate({ data: form as CampaignEventInput }); }} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">EVENT TITLE *</label>
              <input required value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">TYPE *</label>
              <select required value={form.type ?? "rally"} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ").toUpperCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">WARD</label>
              <select value={form.ward ?? ""} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"><option value="">COUNTY-WIDE / NOT WARD-SPECIFIC</option>{WARDS.map(ward => <option key={ward} value={ward}>{ward}</option>)}</select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">START DATE *</label>
              <input required type="datetime-local" value={form.startDate ?? ""} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">END DATE</label>
              <input type="datetime-local" value={form.endDate ?? ""} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">LOCATION</label>
              <input value={form.location ?? ""} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground">MAX ATTENDEES</label>
              <input type="number" value={form.maxAttendees ?? ""} onChange={e => setForm(p => ({ ...p, maxAttendees: Number(e.target.value) }))} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowAdd(false); setForm({ type: "rally" }); }} className="flex items-center gap-2 border border-border px-4 py-2 font-mono text-xs hover:bg-secondary"><X className="w-3 h-3" /> ABORT</button>
              <button type="submit" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs hover:bg-primary/90"><Check className="w-3 h-3" /> SCHEDULE</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card border border-border h-32 animate-pulse" />)}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="bg-card border border-border flex items-center justify-center py-12">
          <p className="font-mono text-xs text-muted-foreground">[ NO_EVENTS_SCHEDULED ]</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {events.map(ev => (
            <div key={ev.id} className="bg-card border border-border p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-sm">{ev.title}</h3>
                  <span className="font-mono text-[9px] bg-secondary border border-border px-1.5 py-0.5">{ev.type.replace("_", " ").toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ev.status} />
                  <button onClick={() => { if (confirm("Delete event?")) deleteEvent.mutate({ id: ev.id }); }} className="text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 mt-3">
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(ev.startDate).toLocaleString()}</span>
                </div>
                {ev.location && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span>{ev.location}</span>
                    {ev.ward && <span>— {ev.ward}</span>}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <Users className="w-3 h-3" />
                  <span>{ev.attendeeCount} ATTENDEES</span>
                  {ev.maxAttendees && <span>/ {ev.maxAttendees} MAX</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}