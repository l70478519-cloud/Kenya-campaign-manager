import { WARDS, CONSTITUENCIES, CAMPAIGN } from "@/lib/wards";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Database, Search, Upload, RefreshCw, CheckCircle, XCircle, Clock,
  AlertTriangle, Users, FileText, Settings, Plus, Trash2, Eye,
  Download, ChevronRight, Link, Wifi, WifiOff, BarChart2, Filter,
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const API = `${BASE_URL}/api/voter-registry`;

type Tab = "roll" | "capture" | "api" | "review";

interface VoterRecord {
  id: number;
  nationalId?: string | null;
  voterNumber?: string | null;
  fullName: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  ward?: string | null;
  subCounty?: string | null;
  pollingStation?: string | null;
  pollingStationCode?: string | null;
  stream?: string | null;
  status: string;
  source: string;
  importBatch?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
}

interface Stats {
  total: number; verified: number; pending: number; rejected: number;
  fromUpload: number; fromApi: number; fromManual: number;
  wardBreakdown: { ward: string; count: number }[];
  recentLogs: SyncLog[];
}


interface SyncLog {
  id: number; source: string; status: string;
  recordsProcessed: number; recordsNew: number; recordsDuplicate: number;
  errorMessage?: string | null; details?: string | null; createdAt: string;
}

interface IebcCreds {
  configured: boolean; baseUrl?: string; clientId?: string; notes?: string;
  lastTested?: string; lastStatus?: string;
}

function Badge({ label, style }: { label: string; style: string }) {
  return <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${style}`}>[ {label} ]</span>;
}

function Input({ label, required, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-mono text-muted-foreground tracking-widest">{label}{required && " *"}</label>
      <input required={required} {...props} className={`w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary ${props.className ?? ""}`} />
    </div>
  );
}

function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-mono text-muted-foreground tracking-widest">{label}</label>
      <select {...props} className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
        {children}
      </select>
    </div>
  );
}

// Small RFC-4180-style CSV reader: supports quoted fields, commas inside quotes,
// escaped double quotes, CRLF files and blank lines.
function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const statusStyle: Record<string, string> = {
  verified: "text-green-400 border-green-400/30",
  pending: "text-yellow-400 border-yellow-400/30",
  rejected: "text-red-400 border-red-400/30",
};

const sourceStyle: Record<string, string> = {
  upload: "text-blue-400 border-blue-400/30",
  api: "text-cyan-400 border-cyan-400/30",
  manual: "text-purple-400 border-purple-400/30",
};

// ── VOTER ROLL TAB ──────────────────────────────────────────────────────────
function VoterRollTab() {
  const [search, setSearch] = useState("");
  const [ward, setWard] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ data: VoterRecord[]; total: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<VoterRecord | null>(null);
  const LIMIT = 50;

  const fetchData = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (ward) params.set("ward", ward);
      if (status) params.set("status", status);
      if (source) params.set("source", source);
      params.set("limit", String(LIMIT));
      params.set("offset", String(pg * LIMIT));
      const [rollRes, statsRes] = await Promise.all([
        fetch(`${API}?${params}`),
        fetch(`${API}/stats`),
      ]);
      const roll = await rollRes.json();
      const st = await statsRes.json();
      setData(roll);
      setStats(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, ward, status, source, page]);

  // Load the voter roll automatically, including records still pending review.
  useEffect(() => {
    void fetchData(0);
    // Fetch on entry; filters remain user-controlled via SEARCH.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => { setPage(0); fetchData(0); };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this voter record?")) return;
    await fetch(`${API}/${id}`, { method: "DELETE" });
    fetchData(page);
  };

  const downloadCSV = () => {
    if (!data?.data.length) return;
    const headers = ["ID", "National ID", "Voter #", "Full Name", "Phone", "Gender", "Ward", "Polling Station", "Status", "Source", "Created"];
    const rows = data.data.map(r => [r.id, r.nationalId ?? "", r.voterNumber ?? "", r.fullName, r.phone ?? "", r.gender ?? "", r.ward ?? "", r.pollingStation ?? "", r.status, r.source, r.createdAt].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "voter-roll.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: "TOTAL", value: stats.total, color: "" },
            { label: "VERIFIED", value: stats.verified, color: "text-green-400" },
            { label: "PENDING", value: stats.pending, color: "text-yellow-400" },
            { label: "REJECTED", value: stats.rejected, color: "text-red-400" },
            { label: "VIA UPLOAD", value: stats.fromUpload, color: "text-blue-400" },
            { label: "VIA IEBC API", value: stats.fromApi, color: "text-cyan-400" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border p-3 text-center">
              <div className="font-mono text-[10px] text-muted-foreground mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search / filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Name, National ID, Voter #..." className="w-full bg-secondary border border-border pl-8 pr-3 py-2 font-mono text-xs focus:outline-none focus:border-primary" />
        </div>
        <div>
          <select value={ward} onChange={e => setWard(e.target.value)} className="bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
            <option value="">All Wards</option>
            {WARDS.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
            <option value="">All Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <select value={source} onChange={e => setSource(e.target.value)} className="bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary">
            <option value="">All Sources</option>
            <option value="upload">Upload</option>
            <option value="api">IEBC API</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <button onClick={handleSearch} className="bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2 hover:bg-primary/90 whitespace-nowrap">
          SEARCH
        </button>
        <button onClick={downloadCSV} disabled={!data?.data.length} className="flex items-center gap-1.5 border border-border font-mono text-[10px] px-3 py-2 hover:border-primary hover:text-primary disabled:opacity-40">
          <Download className="w-3 h-3" /> EXPORT CSV
        </button>
      </div>

      {/* Table */}
      {!data && !loading && (
        <div className="border border-border bg-card p-12 text-center">
          <Database className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <div className="font-mono text-xs text-muted-foreground">VOTER ROLL WILL LOAD AUTOMATICALLY</div>
        </div>
      )}

      {loading && <div className="p-8 text-center font-mono text-xs text-muted-foreground animate-pulse bg-card border border-border">QUERYING REGISTRY...</div>}

      {data && !loading && (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{data.total.toLocaleString()} contacts</span>
            <span className="hidden sm:inline">{CAMPAIGN.areaLabel} · Registry</span>
          </div>
          <div className="border border-border bg-card overflow-x-auto overscroll-x-contain">
            <div className="grid grid-cols-12 gap-3 min-w-[780px] px-4 py-3 border-b border-border bg-secondary/30 text-[10px] font-semibold tracking-widest text-muted-foreground">
              <div className="col-span-3">NAME</div>
              <div className="col-span-2">CONTACT</div>
              <div className="col-span-2">LOCATION</div>
              <div className="col-span-3">RECORD DETAILS</div>
              <div className="col-span-2 text-right">STATUS</div>
            </div>
            <div className="divide-y divide-border max-h-[560px] overflow-y-auto">
              {data.data.map(r => (
                <div key={r.id} className={`grid grid-cols-12 gap-3 min-w-[780px] px-4 py-3.5 hover:bg-white/[0.025] cursor-pointer group items-center transition-colors ${selected?.id === r.id ? "bg-secondary/40" : ""}`} onClick={() => setSelected(selected?.id === r.id ? null : r)}>
                  <div className="col-span-3 min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate">{r.fullName}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">ID #{String(r.id).padStart(5, "0")}</div>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm text-foreground truncate">{r.phone || "No phone recorded"}</div>
                    {r.voterNumber && <div className="text-[11px] text-muted-foreground mt-1">Voter #{r.voterNumber}</div>}
                  </div>
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm text-foreground truncate">{r.ward || "Ward not set"}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{r.subCounty || "Constituency not set"}</div>
                  </div>
                  <div className="col-span-3 flex flex-wrap gap-1.5 items-center">
                    {r.nationalId && <span className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground">ID: {r.nationalId}</span>}
                    <span className={`rounded-full px-2 py-1 text-[10px] ${r.source === "upload" ? "bg-blue-500/10 text-blue-300" : r.source === "api" ? "bg-cyan-500/10 text-cyan-300" : "bg-violet-500/10 text-violet-300"}`}>{r.source === "upload" ? "CSV Upload" : r.source === "api" ? "IEBC API" : "Manual"}</span>
                    {r.pollingStation && <span className="rounded-full bg-secondary px-2 py-1 text-[10px] text-muted-foreground max-w-full truncate">{r.pollingStation}</span>}
                  </div>
                  <div className="col-span-2 flex justify-end items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-semibold tracking-wide ${r.status === "verified" ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/[0.06]" : r.status === "pending" ? "border-amber-500/40 text-amber-300 bg-amber-500/[0.06]" : "border-red-500/40 text-red-300 bg-red-500/[0.06]"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${r.status === "verified" ? "bg-emerald-400" : r.status === "pending" ? "bg-amber-300" : "bg-red-400"}`} />{r.status === "verified" ? "ACTIVE" : r.status.toUpperCase()}
                    </span>
                    <button title="Delete contact" onClick={e => { e.stopPropagation(); handleDelete(r.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {data.data.length === 0 && <div className="px-4 py-12 text-center text-sm text-muted-foreground">No contacts found. Try changing your search or filters.</div>}
            </div>
          </div>

          {/* Pagination */}
          {data.total > LIMIT && (
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>Page {page + 1} of {Math.ceil(data.total / LIMIT)}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => { const p = page - 1; setPage(p); fetchData(p); }} className="px-3 py-1 border border-border hover:border-primary disabled:opacity-40">← PREV</button>
                <button disabled={(page + 1) * LIMIT >= data.total} onClick={() => { const p = page + 1; setPage(p); fetchData(p); }} className="px-3 py-1 border border-border hover:border-primary disabled:opacity-40">NEXT →</button>
              </div>
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div className="bg-card border border-primary/30 p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="font-mono text-[10px] text-primary tracking-widest">VOTER RECORD DETAIL</div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground font-mono text-[10px]">× CLOSE</button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "FULL NAME", value: selected.fullName },
                  { label: "NATIONAL ID", value: selected.nationalId ?? "—" },
                  { label: "VOTER NUMBER", value: selected.voterNumber ?? "—" },
                  { label: "PHONE", value: selected.phone ?? "—" },
                  { label: "GENDER", value: selected.gender ?? "—" },
                  { label: "DOB", value: selected.dateOfBirth ?? "—" },
                  { label: "WARD", value: selected.ward ?? "—" },
                  { label: "POLLING STATION", value: selected.pollingStation ?? "—" },
                  { label: "STATION CODE", value: selected.pollingStationCode ?? "—" },
                  { label: "STREAM", value: selected.stream ?? "—" },
                  { label: "SOURCE", value: selected.source.toUpperCase() },
                  { label: "BATCH", value: selected.importBatch ?? "—" },
                ].map(f => (
                  <div key={f.label} className="bg-secondary border border-border p-2">
                    <div className="font-mono text-[9px] text-muted-foreground">{f.label}</div>
                    <div className="font-mono text-xs mt-0.5 truncate">{f.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Ward breakdown */}
      {stats && stats.wardBreakdown.length > 0 && (
        <div className="bg-card border border-border p-4">
          <div className="font-mono text-[10px] text-muted-foreground mb-3 tracking-widest">BREAKDOWN BY WARD</div>
          <div className="space-y-2">
            {stats.wardBreakdown.sort((a, b) => b.count - a.count).map(w => {
              const maxCount = Math.max(...stats.wardBreakdown.map(x => x.count));
              const pctVal = maxCount > 0 ? Math.round((w.count / maxCount) * 100) : 0;
              return (
                <div key={w.ward} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground w-32 truncate">{w.ward}</span>
                  <div className="flex-1 h-1.5 bg-secondary border border-border">
                    <div className="h-full bg-primary" style={{ width: `${pctVal}%` }} />
                  </div>
                  <span className="font-mono text-[10px] w-12 text-right">{w.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUPERVISED CAPTURE TAB ──────────────────────────────────────────────────
function CaptureTab() {
  const [batch, setBatch] = useState(`CAP-${new Date().toISOString().split("T")[0]}`);
  const [form, setForm] = useState<Record<string, string>>({ status: "verified" });
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<VoterRecord[]>([]);
  const [successMsg, setSuccessMsg] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState<{ processed: number; new: number; updated?: number; duplicates: number; skipped?: number; batchId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, importBatch: batch }),
      });
      if (res.ok) {
        const record = await res.json();
        setRecent(prev => [record, ...prev.slice(0, 9)]);
        setSuccessMsg(`✓ ${record.fullName} captured`);
        setForm({ status: "verified" });
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } finally { setLoading(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setUploadResult(null);
    setUploadError("");
    setUploadProgress("Reading CSV file...");

    try {
      const text = await file.text();
      const rows = parseCsvRows(text);
      if (rows.length < 2) throw new Error("CSV must contain a header row and at least one contact.");
      const entryCount = rows.length - 1;
      setUploadProgress("Read " + entryCount.toLocaleString() + " contact rows. Preparing upload...");
      const headers = rows[0]!.map(h => h.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));

      const fieldMap: Record<string, string> = {
        "full_name": "fullName", "name": "fullName", "names": "fullName", "fullname": "fullName",
        "first_name": "firstName", "firstname": "firstName", "given_name": "firstName",
        "second_name": "secondName", "middlename": "secondName", "middle_name": "secondName",
        "last_name": "lastName", "lastname": "lastName", "surname": "lastName", "family_name": "lastName",
        "national_id": "nationalId", "national_id_no": "nationalId", "id_no": "nationalId", "id_number": "nationalId", "idno": "nationalId", "nationalid": "nationalId",
        "voter_number": "voterNumber", "voter_no": "voterNumber", "voter_id": "voterNumber", "voter_id_number": "voterNumber", "serial_number": "voterNumber",
        "phone": "phone", "primaryphone": "phone", "primary_phone": "phone", "mobile": "phone", "mobile_number": "phone", "phone_number": "phone", "telephone": "phone",
        "gender": "gender", "sex": "gender",
        "date_of_birth": "dateOfBirth", "dob": "dateOfBirth", "birth_date": "dateOfBirth",
        "ward": "ward",
        "sub_county": "subCounty", "subcounty": "subCounty",
        "polling_station": "pollingStation", "station": "pollingStation",
        "polling_station_code": "pollingStationCode", "station_code": "pollingStationCode",
        "stream": "stream",
      };

      const records = rows.slice(1).map(cols => {
        const record: Record<string, string> = {};
        headers.forEach((h, i) => {
          const mapped = fieldMap[h] ?? h;
          const value = (cols[i] ?? "").trim();
          if (value) record[mapped] = value;
        });
        if (!record.fullName && (record.firstName || record.secondName || record.lastName)) {
          record.fullName = [record.firstName, record.secondName, record.lastName].filter(Boolean).join(" ");
        }
        if (record.ward) {
          const normalizeWard = (value: string) => value.toLowerCase().replace(/\s+ward$/i, "").replace(/[^a-z0-9]/g, "");
          const aliases: Record<string, string> = {
            emalimulala: "Emali/Mulala",
            ivingoninzambani: "Ivingoni/Nzambani",
            nzauikililikalamba: "Nzaui/Kilili/Kalamba",
            muvaukikuumini: "Muvau/Kikumini",
            muvaukikumini: "Muvau/Kikumini",
            kithungokitundu: "Kithungo/Kitundu",
            kitetakisau: "Kiteta/Kisau",
            kakowaia: "Kako/Waia",
            nguumasumba: "Nguu/Masumba",
            ksouth: "Kikumbulyu South",
            mbooniward: "Mbooni",
            woteniu: "Wote",
            kiimakiukalanzoni: "Kiima Kiu/Kalanzoni",
            nimakui: "Kiima Kiu/Kalanzoni",
            kimakui: "Kiima Kiu/Kalanzoni",
            kitesekithuki: "Kitise/Kithuki",
          };
          const normalized = normalizeWard(record.ward);
          const canonicalWard = WARDS.find(w => normalizeWard(w) === normalized) ?? aliases[normalized];
          // Keep the person's name even when the source has a non-standard/unknown ward label.
          // Unknown geography is stored as blank rather than causing the whole contact to be skipped.
          record.ward = canonicalWard ?? "";
        }
        if (record.phone) {
          const digits = record.phone.replace(/\D/g, "");
          let normalizedPhone = digits;
          if (digits.startsWith("2540")) normalizedPhone = "254" + digits.slice(4);
          else if (digits.startsWith("0")) normalizedPhone = "254" + digits.slice(1);
          else if (digits.startsWith("7") || digits.startsWith("1")) normalizedPhone = "254" + digits;
          record.phone = normalizedPhone ? "+" + normalizedPhone : record.phone;
        }
        return record;
      }).filter(r => r.fullName || r.nationalId || r.voterNumber);

      if (!records.length) throw new Error("No contacts with a name were found. Check that the CSV contains First Name and/or Second Name columns.");
      const batchName = `FILE-${file.name.replace(/[^a-z0-9]/gi, "_")}-${Date.now()}`;
      const totals = { processed: 0, new: 0, updated: 0, duplicates: 0, skipped: 0, batchId: batchName };
      const chunkSize = 500;
      const chunks = Math.ceil(records.length / chunkSize);
      for (let start = 0; start < records.length; start += chunkSize) {
        const chunk = records.slice(start, start + chunkSize);
        const chunkNumber = Math.floor(start / chunkSize) + 1;
        setUploadProgress(`Uploading batch ${chunkNumber} of ${chunks} (${Math.min(start + chunk.length, records.length).toLocaleString()} of ${records.length.toLocaleString()} contacts)...`);
        const res = await fetch(`${API}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: chunk, batchName: `${batchName}-${chunkNumber}` }),
        });
        const responseText = await res.text();
        let result: Record<string, unknown>;
        try { result = JSON.parse(responseText) as Record<string, unknown>; }
        catch { throw new Error(`Batch ${chunkNumber} failed (HTTP ${res.status}). Server response: ${responseText.slice(0, 180)}`); }
        if (!res.ok) throw new Error(`Batch ${chunkNumber} failed (HTTP ${res.status}): ${String(result.error ?? responseText).slice(0, 240)}`);
        for (const key of ["processed", "new", "updated", "duplicates", "skipped"] as const) totals[key] += Number(result[key] ?? 0);
      }
      setUploadResult(totals);
      setUploadProgress(`Finished processing ${totals.processed.toLocaleString()} contacts.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setUploadError(message.startsWith("Failed to fetch") ? "Could not reach the API. The deployment may still be starting or the server may have timed out. Refresh and retry; completed batches may already have been saved." : message);
      setUploadProgress("");
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
      {/* Individual capture */}
      <div className="col-span-3 space-y-4">
        {/* CSV Upload */}
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest">◆ BULK CSV UPLOAD</div>
          <p className="text-xs text-muted-foreground">Upload large CSV files in one selection; records are automatically sent in batches of 500. Keep this page open until the upload completes. Use <code className="font-mono text-primary">full_name</code> (or name), plus <code className="font-mono text-primary">national_id</code> or <code className="font-mono text-primary">voter_number</code> to match existing records and update their names. New contacts can be uploaded without a <code className="font-mono text-primary">ward</code>; phone number is used to match existing contacts. Optional: <code className="font-mono text-primary">national_id, voter_number, phone, gender, dob, ward, polling_station, station_code, stream, sub_county</code>.</p>

          <div
            className="border-2 border-dashed border-border hover:border-primary/50 p-8 text-center cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <div className="font-mono text-xs text-muted-foreground">CLICK TO SELECT CSV FILE</div>
            <div className="font-mono text-[9px] text-muted-foreground mt-1">Supports .csv format · Auto-detects column names</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />

          {uploadLoading && <div className="font-mono text-xs text-muted-foreground animate-pulse">{uploadProgress || "PARSING AND UPLOADING RECORDS..."}</div>}
          {!uploadLoading && uploadProgress && <div className="font-mono text-xs text-green-400">{uploadProgress}</div>}
          {uploadError && <div className="border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300"><strong>UPLOAD FAILED:</strong> {uploadError}</div>}

          {uploadResult && (
            <div className="bg-secondary border border-border p-3 space-y-1">
              <div className="font-mono text-[10px] text-green-400 font-bold">✓ UPLOAD COMPLETE — BATCH: {uploadResult.batchId}</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                <div className="text-center"><div className="font-mono text-[9px] text-muted-foreground">PROCESSED</div><div className="font-bold">{uploadResult.processed}</div></div>
                <div className="text-center"><div className="font-mono text-[9px] text-green-400">NEW</div><div className="font-bold text-green-400">{uploadResult.new}</div></div>
                <div className="text-center"><div className="font-mono text-[9px] text-blue-400">UPDATED</div><div className="font-bold text-blue-400">{uploadResult.updated ?? 0}</div></div>
                <div className="text-center"><div className="font-mono text-[9px] text-yellow-400">MATCHED</div><div className="font-bold text-yellow-400">{uploadResult.duplicates}</div></div>
                <div className="text-center"><div className="font-mono text-[9px] text-red-400">SKIPPED</div><div className="font-bold text-red-400">{uploadResult.skipped ?? 0}</div></div>
              </div>
              <div className="font-mono text-[9px] text-muted-foreground mt-2">Existing records can match by National ID, Voter Number or phone. Contacts can be uploaded without a ward. Phone number is the preferred matching key; contacts without a ward remain unassigned until their ward is confirmed.</div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] text-muted-foreground tracking-widest">◆ INDIVIDUAL VOTER CAPTURE</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-muted-foreground">BATCH:</span>
              <input value={batch} onChange={e => setBatch(e.target.value)} className="bg-secondary border border-border px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-primary w-44" />
            </div>
          </div>

          {successMsg && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs p-2">{successMsg}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Input label="FULL NAME" required placeholder="John Mutua Kioko" value={form.fullName ?? ""} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
              </div>
              <Input label="NATIONAL ID" placeholder="12345678" value={form.nationalId ?? ""} onChange={e => setForm(p => ({ ...p, nationalId: e.target.value }))} />
              <Input label="VOTER NUMBER / SERIAL" placeholder="01234567" value={form.voterNumber ?? ""} onChange={e => setForm(p => ({ ...p, voterNumber: e.target.value }))} />
              <Input label="PHONE" type="tel" placeholder="0712 345 678" value={form.phone ?? ""} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              <Select label="GENDER" value={form.gender ?? ""} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="">— Select —</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </Select>
              <Input label="DATE OF BIRTH" type="date" value={form.dateOfBirth ?? ""} onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} />
              <Select label="WARD" value={form.ward ?? ""} onChange={e => setForm(p => ({ ...p, ward: e.target.value }))}>
                <option value="">— Ward —</option>
                {WARDS.map(w => <option key={w}>{w}</option>)}
              </Select>
              <Select label="CONSTITUENCY / SUB-COUNTY" value={form.subCounty ?? ""} onChange={e => setForm(p => ({ ...p, subCounty: e.target.value }))}><option value="">— Constituency —</option>{CONSTITUENCIES.map(c => <option key={c} value={c}>{c}</option>)}</Select>
              <div className="col-span-2">
                <Input label="POLLING STATION" placeholder="Wote Primary School" value={form.pollingStation ?? ""} onChange={e => setForm(p => ({ ...p, pollingStation: e.target.value }))} />
              </div>
              <Input label="STATION CODE" placeholder="TAL-001" value={form.pollingStationCode ?? ""} onChange={e => setForm(p => ({ ...p, pollingStationCode: e.target.value }))} />
              <Input label="STREAM" placeholder="1" value={form.stream ?? ""} onChange={e => setForm(p => ({ ...p, stream: e.target.value }))} />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-primary text-white font-mono text-[10px] tracking-widest py-3 hover:bg-primary/90 disabled:opacity-50">
              {loading ? "CAPTURING..." : "▶ CAPTURE VOTER RECORD"}
            </button>
          </form>
        </div>

      </div>

      {/* Recent captures */}
      <div className="col-span-2">
        <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">RECENT CAPTURES (THIS SESSION)</div>
        {recent.length === 0 && (
          <div className="border border-border bg-card p-6 text-center font-mono text-xs text-muted-foreground">NO CAPTURES YET</div>
        )}
        <div className="space-y-2">
          {recent.map(r => (
            <div key={r.id} className="bg-card border border-border p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-xs">{r.fullName}</div>
                  <div className="font-mono text-[9px] text-muted-foreground">{r.nationalId ?? "—"} · {r.ward ?? "—"}</div>
                </div>
                <Badge label="VERIFIED" style="text-green-400 border-green-400/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── REGISTRY API TAB ────────────────────────────────────────────────────────
function RegistryApiTab() {
  const [creds, setCreds] = useState<IebcCreds | null>(null);
  const [form, setForm] = useState({ apiKey: "", baseUrl: "https://api.iebc.or.ke/v1", clientId: "", notes: "" });
  const [syncOpts, setSyncOpts] = useState({ ward: "", pollingStation: "", limit: "500" });
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; processed?: number; imported?: number; message?: string; error?: string } | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);

  const loadCreds = useCallback(async () => {
    const [credsRes, logsRes] = await Promise.all([
      fetch(`${API}/iebc/credentials`),
      fetch(`${API}/sync-logs`),
    ]);
    const c = await credsRes.json();
    const l = await logsRes.json();
    setCreds(c);
    setLogs(l);
    if (c.configured) {
      setForm(prev => ({ ...prev, baseUrl: c.baseUrl ?? prev.baseUrl, clientId: c.clientId ?? "", notes: c.notes ?? "" }));
    }
  }, []);

  useEffect(() => { loadCreds(); }, [loadCreds]);

  const saveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    try {
      const res = await fetch(`${API}/iebc/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const updated = await res.json();
      setCreds(updated);
      setCredsSaved(true);
      setTimeout(() => setCredsSaved(false), 3000);
    } finally { setSavingCreds(false); }
  };

  const testConnection = async () => {
    setTestResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/iebc/test`, { method: "POST" });
      const result = await res.json();
      setTestResult(result);
    } finally { setLoading(false); }
  };

  const triggerSync = async () => {
    setSyncResult(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/iebc/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncOpts),
      });
      const result = await res.json();
      setSyncResult(result);
      // Reload logs
      const logsRes = await fetch(`${API}/sync-logs`);
      setLogs(await logsRes.json());
    } finally { setLoading(false); }
  };

  const logStatusStyle: Record<string, string> = {
    completed: "text-green-400",
    failed: "text-red-400",
    running: "text-yellow-400",
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
      <div className="col-span-3 space-y-4">
        {/* Status banner */}
        {creds && (
          <div className={`flex items-center gap-3 border p-3 ${creds.configured && creds.lastStatus === "connected" ? "border-green-500/30 bg-green-500/5" : creds.configured ? "border-yellow-500/30 bg-yellow-500/5" : "border-border bg-card"}`}>
            {creds.configured && creds.lastStatus === "connected" ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : creds.configured ? (
              <WifiOff className="w-4 h-4 text-yellow-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <div>
              <div className={`font-mono text-xs font-bold ${creds.configured ? creds.lastStatus === "connected" ? "text-green-400" : "text-yellow-400" : "text-muted-foreground"}`}>
                {creds.configured ? creds.lastStatus === "connected" ? "IEBC API — CONNECTED" : "IEBC API — CONFIGURED (UNTESTED / FAILED)" : "IEBC API — NOT CONFIGURED"}
              </div>
              {creds.lastTested && <div className="font-mono text-[9px] text-muted-foreground">Last tested: {new Date(creds.lastTested).toLocaleString()}</div>}
            </div>
          </div>
        )}

        {/* Credentials form */}
        <div className="bg-card border border-border p-4 space-y-4">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest">◆ IEBC API CREDENTIALS</div>

          {credsSaved && <div className="bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs p-2">✓ CREDENTIALS SAVED</div>}

          <form onSubmit={saveCreds} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-mono text-muted-foreground tracking-widest">API KEY *</label>
              <input
                type="password"
                required
                value={form.apiKey}
                onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="iebc_live_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-secondary border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:border-primary"
              />
              <div className="font-mono text-[9px] text-muted-foreground">Obtain from IEBC Integration Portal · Keep this key confidential</div>
            </div>
            <Input label="BASE URL" value={form.baseUrl} onChange={e => setForm(p => ({ ...p, baseUrl: e.target.value }))} placeholder="https://api.iebc.or.ke/v1" />
            <Input label="CLIENT ID" value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))} placeholder="kaiti-campaign-001" />
            <Input label="NOTES" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Integration contact, expiry date etc." />
            <div className="flex gap-2">
              <button type="submit" disabled={savingCreds} className="bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2 hover:bg-primary/90 disabled:opacity-50">SAVE CREDENTIALS</button>
              <button type="button" onClick={testConnection} disabled={loading || !creds?.configured} className="flex items-center gap-1.5 border border-border font-mono text-[10px] px-4 py-2 hover:border-primary hover:text-primary disabled:opacity-40">
                <Wifi className="w-3 h-3" /> TEST CONNECTION
              </button>
            </div>
          </form>

          {testResult && (
            <div className={`flex items-center gap-2 border p-3 font-mono text-xs ${testResult.ok ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
              {testResult.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {testResult.message}
            </div>
          )}
        </div>

        {/* Sync panel */}
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest">◆ INGEST FROM IEBC VOTER ROLLS</div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="WARD" value={syncOpts.ward} onChange={e => setSyncOpts(p => ({ ...p, ward: e.target.value }))}>
              <option value="">All Wards</option>
              {WARDS.map(w => <option key={w}>{w}</option>)}
            </Select>
            <Input label="POLLING STATION (OPTIONAL)" value={syncOpts.pollingStation} onChange={e => setSyncOpts(p => ({ ...p, pollingStation: e.target.value }))} placeholder="Wote Primary" />
            <Input label="RECORD LIMIT" type="number" value={syncOpts.limit} onChange={e => setSyncOpts(p => ({ ...p, limit: e.target.value }))} placeholder="500" />
          </div>

          <div className="bg-secondary border border-border p-3 font-mono text-[9px] text-muted-foreground space-y-1">
            <div className="text-yellow-400 font-bold">◆ IMPORTANT — IEBC API REQUIREMENTS:</div>
            <div>· Valid API key from IEBC Integration Portal (api.iebc.or.ke)</div>
            <div>· Approved data access agreement with IEBC</div>
            <div>· Rate limit: 1,000 records/minute per API key</div>
            <div>· Ingested records are placed in PENDING status for review before use</div>
          </div>

          <button onClick={triggerSync} disabled={loading || !creds?.configured} className="flex items-center gap-2 bg-primary text-white font-mono text-[10px] tracking-widest px-4 py-2.5 hover:bg-primary/90 disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "SYNCING FROM IEBC..." : "TRIGGER IEBC SYNC"}
          </button>

          {syncResult && (
            <div className={`border p-3 font-mono text-xs ${syncResult.ok ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
              {syncResult.ok ? `✓ ${syncResult.message}` : `✗ ${syncResult.error}`}
              {syncResult.ok && <div className="mt-1 text-[10px] text-muted-foreground">{syncResult.processed} processed · {syncResult.imported} new records added · Review in Registry Review tab</div>}
            </div>
          )}
        </div>
      </div>

      {/* Sync logs */}
      <div className="col-span-2">
        <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-widest">SYNC HISTORY</div>
        <div className="space-y-2">
          {logs.length === 0 && <div className="border border-border bg-card p-4 text-center font-mono text-xs text-muted-foreground">NO SYNC HISTORY</div>}
          {logs.map(log => (
            <div key={log.id} className="bg-card border border-border p-3">
              <div className="flex justify-between items-start mb-1">
                <div className={`font-mono text-[10px] font-bold ${logStatusStyle[log.status] ?? "text-muted-foreground"}`}>{log.status.toUpperCase()}</div>
                <div className="font-mono text-[9px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</div>
              </div>
              <div className="font-mono text-[9px] text-muted-foreground truncate">{log.source}</div>
              {log.details && <div className="font-mono text-[10px] mt-1">{log.details}</div>}
              {log.errorMessage && <div className="font-mono text-[10px] text-red-400 mt-1">{log.errorMessage}</div>}
              <div className="flex gap-3 mt-2 font-mono text-[9px] text-muted-foreground">
                <span>Processed: {log.recordsProcessed}</span>
                <span className="text-green-400">New: {log.recordsNew}</span>
                <span className="text-yellow-400">Dup: {log.recordsDuplicate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── REGISTRY REVIEW TAB ─────────────────────────────────────────────────────
function RegistryReviewTab() {
  const [records, setRecords] = useState<VoterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<VoterRecord>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?status=pending&limit=200`);
      const data = await res.json();
      setRecords(data.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map(r => r.id)));
  };

  const applyBulk = async (action: "verify" | "reject") => {
    if (selected.size === 0) return;
    if (!confirm(`${action === "verify" ? "Verify" : "Reject"} ${selected.size} records?`)) return;
    setActionLoading(true);
    try {
      await fetch(`${API}/bulk-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      setSuccessMsg(`✓ ${selected.size} records ${action === "verify" ? "verified" : "rejected"}`);
      setTimeout(() => setSuccessMsg(""), 3000);
      setSelected(new Set());
      await load();
    } finally { setActionLoading(false); }
  };

  const updateSingle = async (id: number, status: string) => {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const saveEdit = async (id: number) => {
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    setEditForm({});
    await load();
  };

  const grouped = records.reduce<Record<string, VoterRecord[]>>((acc, r) => {
    const key = r.importBatch ?? "Manual";
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] text-muted-foreground tracking-widest">PENDING REGISTRY REVIEW</div>
          <div className="font-mono text-xs mt-0.5">{records.length} records awaiting review</div>
        </div>
        <div className="flex items-center gap-2">
          {successMsg && <span className="font-mono text-xs text-green-400">{successMsg}</span>}
          {selected.size > 0 && (
            <>
              <span className="font-mono text-[10px] text-muted-foreground">{selected.size} selected</span>
              <button onClick={() => applyBulk("verify")} disabled={actionLoading} className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-[10px] px-3 py-1.5 hover:bg-green-500/20 disabled:opacity-40">
                <CheckCircle className="w-3 h-3" /> VERIFY SELECTED
              </button>
              <button onClick={() => applyBulk("reject")} disabled={actionLoading} className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-[10px] px-3 py-1.5 hover:bg-red-500/20 disabled:opacity-40">
                <XCircle className="w-3 h-3" /> REJECT SELECTED
              </button>
            </>
          )}
          <button onClick={load} className="flex items-center gap-1.5 border border-border font-mono text-[10px] px-3 py-1.5 hover:border-primary hover:text-primary">
            <RefreshCw className="w-3 h-3" /> REFRESH
          </button>
        </div>
      </div>

      {loading && <div className="p-6 text-center font-mono text-xs text-muted-foreground animate-pulse bg-card border border-border">LOADING PENDING RECORDS...</div>}

      {!loading && records.length === 0 && (
        <div className="border border-green-500/30 bg-green-500/5 p-8 text-center">
          <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <div className="font-mono text-xs text-green-400">ALL RECORDS REVIEWED — NO PENDING ITEMS</div>
        </div>
      )}

      {Object.entries(grouped).map(([batchId, batchRecords]) => (
        <div key={batchId} className="bg-card border border-border">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30">
            <div className="font-mono text-[10px] text-muted-foreground">BATCH: <span className="text-foreground font-bold">{batchId}</span></div>
            <div className="font-mono text-[10px] text-muted-foreground">{batchRecords.length} records</div>
          </div>

          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr className="font-mono text-[10px] text-muted-foreground">
                <th className="text-left px-4 py-2 w-8">
                  <input type="checkbox" checked={batchRecords.every(r => selected.has(r.id))} onChange={selectAll} className="accent-primary" />
                </th>
                <th className="text-left px-4 py-2">FULL NAME</th>
                <th className="text-left px-4 py-2">NATIONAL ID</th>
                <th className="text-left px-4 py-2">VOTER #</th>
                <th className="text-left px-4 py-2">WARD</th>
                <th className="text-left px-4 py-2">POLLING STATION</th>
                <th className="text-left px-4 py-2">GENDER</th>
                <th className="px-4 py-2 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batchRecords.map(r => (
                <>
                  <tr key={r.id} className={`hover:bg-secondary/30 ${selected.has(r.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-primary" />
                    </td>
                    {editingId === r.id ? (
                      <>
                        <td className="px-2 py-1"><input value={editForm.fullName ?? r.fullName} onChange={e => setEditForm(p => ({ ...p, fullName: e.target.value }))} className="w-full bg-secondary border border-primary px-2 py-0.5 font-mono text-[10px]" /></td>
                        <td className="px-2 py-1"><input value={editForm.nationalId ?? r.nationalId ?? ""} onChange={e => setEditForm(p => ({ ...p, nationalId: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-0.5 font-mono text-[10px]" /></td>
                        <td className="px-2 py-1"><input value={editForm.voterNumber ?? r.voterNumber ?? ""} onChange={e => setEditForm(p => ({ ...p, voterNumber: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-0.5 font-mono text-[10px]" /></td>
                        <td className="px-2 py-1"><select value={editForm.ward ?? r.ward ?? ""} onChange={e => setEditForm(p => ({ ...p, ward: e.target.value }))} className="bg-secondary border border-border px-1 py-0.5 font-mono text-[10px]">{WARDS.map(w => <option key={w}>{w}</option>)}</select></td>
                        <td className="px-2 py-1"><input value={editForm.pollingStation ?? r.pollingStation ?? ""} onChange={e => setEditForm(p => ({ ...p, pollingStation: e.target.value }))} className="w-full bg-secondary border border-border px-2 py-0.5 font-mono text-[10px]" /></td>
                        <td className="px-2 py-1"><select value={editForm.gender ?? r.gender ?? ""} onChange={e => setEditForm(p => ({ ...p, gender: e.target.value }))} className="bg-secondary border border-border px-1 py-0.5 font-mono text-[10px]"><option value="">—</option><option value="M">M</option><option value="F">F</option></select></td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => saveEdit(r.id)} className="font-mono text-[9px] text-green-400 border border-green-400/30 px-2 py-0.5 hover:bg-green-400/10">SAVE</button>
                            <button onClick={() => { setEditingId(null); setEditForm({}); }} className="font-mono text-[9px] text-muted-foreground border border-border px-2 py-0.5">CANCEL</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-semibold">{r.fullName}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px]">{r.nationalId ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{r.voterNumber ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{r.ward ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">{r.pollingStation ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{r.gender ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => updateSingle(r.id, "verified")} className="font-mono text-[9px] text-green-400 border border-green-400/30 px-2 py-0.5 hover:bg-green-400/10">✓ VERIFY</button>
                            <button onClick={() => { setEditingId(r.id); setEditForm({}); }} className="font-mono text-[9px] text-blue-400 border border-blue-400/30 px-2 py-0.5 hover:bg-blue-400/10">EDIT</button>
                            <button onClick={() => updateSingle(r.id, "rejected")} className="font-mono text-[9px] text-red-400 border border-red-400/30 px-2 py-0.5 hover:bg-red-400/10">✗ REJECT</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "roll", label: "VOTER ROLL", icon: FileText, desc: "Search & view all registered voter records" },
  { id: "capture", label: "SUPERVISED CAPTURE", icon: Plus, desc: "Manual data entry & bulk CSV upload" },
  { id: "api", label: "REGISTRY API", icon: Link, desc: "Configure IEBC API and trigger data sync" },
  { id: "review", label: "REGISTRY REVIEW", icon: Eye, desc: "Review pending records before approval" },
];

export default function VotersDb() {
  const [tab, setTab] = useState<Tab>("roll");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest flex items-center gap-3">
            <Database className="w-5 h-5 text-primary" />
            CONSTITUENT DATABASE
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1 tracking-widest">
            VOTER REGISTRY MANAGEMENT — {CAMPAIGN.areaLabel.toUpperCase()} · IEBC INTEGRATION
          </p>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground border border-border px-3 py-1.5 bg-card">
          {CAMPAIGN.constituency.toUpperCase()} · {WARDS.length} WARDS
        </div>
      </div>

      <div className="flex border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 font-mono text-[10px] tracking-widest border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <div className="font-mono text-[10px] text-muted-foreground">
        ◆ {TABS.find(t => t.id === tab)?.desc}
      </div>

      <div>
        {tab === "roll" && <VoterRollTab />}
        {tab === "capture" && <CaptureTab />}
        {tab === "api" && <RegistryApiTab />}
        {tab === "review" && <RegistryReviewTab />}
      </div>
    </div>
  );
}