import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, Settings, RefreshCw, Download, Trash2 } from "lucide-react";
import { api, BASE } from "@/lib/records";
import { useAuth } from "@/lib/auth";
type Scan = {
  id: number;
  title: string;
  createdAt: string;
  data: {
    sha256: string;
    deepfake: number | null;
    aiGenerated: number | null;
    provider: string;
    frames: {
      position: number | null;
      deepfake: number | null;
      aiGenerated: number | null;
    }[];
  };
};
const input =
  "w-full rounded-lg border border-border bg-background p-3 text-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50";
export default function Deepfake() {
  const { can } = useAuth();
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [settings, setSettings] = useState(false),
    [apiUser, setApiUser] = useState(""),
    [apiSecret, setApiSecret] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const status = useQuery({
    queryKey: ["deepfake-status"],
    queryFn: () =>
      api<{ configured: boolean; error?: string }>("deepfake/status"),
  });
  const history = useQuery({
    queryKey: ["deepfake-history"],
    queryFn: () => api<Scan[]>("deepfake/history"),
  });
  async function connect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("deepfake/settings", {
        method: "PUT",
        body: JSON.stringify({ apiUser, apiSecret }),
      });
      setApiUser("");
      setApiSecret("");
      setSettings(false);
      setNotice("Credentials saved. They will be checked when you run a scan.");
      await status.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyse(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Maximum upload size is 20 MB");
      const response = await fetch(`${BASE}api/deepfake/analyse`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan failed");
      setNotice("Scan completed and saved.");
      await history.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(scan: Scan) {
    if (!window.confirm(`Archive scan for ${scan.title}?`)) return;
    setError("");
    try {
      await api(`deepfake/history/${scan.id}`, { method: "DELETE" });
      await history.refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download(scan: Scan) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(scan, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-${scan.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const score = (n: number | null) =>
    n === null ? "Not returned" : `${(n * 100).toFixed(1)}%`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Deepfake Detection</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Check face manipulation and AI generation in images and short
            videos. Results include the provider’s scores and a file
            fingerprint.
          </p>
        </div>
        {can("admin", "write") && (
          <button onClick={() => setSettings(!settings)} className={button}>
            <Settings size={16} />
            Provider settings
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {status.isError && (
        <p role="alert" className="text-sm text-red-300">
          Connection settings could not be loaded.{" "}
          <button onClick={() => void status.refetch()} className="underline">
            Retry
          </button>
        </p>
      )}
      {settings && (
        <form
          onSubmit={connect}
          className="replica-panel grid gap-4 p-6 sm:grid-cols-2"
        >
          <label className="space-y-2 text-sm">
            Sightengine API user
            <input
              autoComplete="off"
              required
              className={input}
              value={apiUser}
              onChange={(e) => setApiUser(e.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            API secret
            <input
              type="password"
              autoComplete="new-password"
              required
              className={input}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Use your Sightengine account credentials. Secrets are encrypted when
            saved and are never returned to the browser.
          </p>
          <button disabled={busy} className={button}>
            Save connection
          </button>
        </form>
      )}
      <form onSubmit={analyse} className="replica-panel space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          {status.isLoading
            ? "Loading provider settings…"
            : status.data?.configured
              ? "Sightengine credentials configured"
              : "Sightengine connection required. An administrator can enter credentials in Provider settings."}
        </p>
        <label className="block space-y-2 text-sm">
          Media file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            required
            className={input}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP, MP4 or WebM · up to 20 MB · videos under 60 seconds.
          Analyze sends this file to Sightengine using your account. The app
          saves the report, not the uploaded file.
        </p>
        <button
          disabled={
            busy ||
            !file ||
            !status.data?.configured ||
            !can("intelligence", "write")
          }
          className={`${button} bg-primary text-primary-foreground`}
        >
          <Upload size={16} />
          {busy ? "Processing…" : "Analyze with Sightengine"}
        </button>
      </form>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scan history</h2>
        <button className={button} onClick={() => void history.refetch()}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Scores are model confidence, not proof of authenticity. Review the
        original source. For videos, the headline score is the highest score
        among sampled frames.
      </p>
      {history.isLoading ? (
        <p>Loading scans…</p>
      ) : history.isError ? (
        <p role="alert" className="text-sm text-red-300">
          Scan history could not be loaded.
        </p>
      ) : !history.data?.length ? (
        <div className="replica-panel p-8 text-center text-muted-foreground">
          No scans yet.
        </div>
      ) : (
        history.data.map((scan) => (
          <article key={scan.id} className="replica-panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold break-all">{scan.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(scan.createdAt).toLocaleString("en-KE")} ·{" "}
                  {scan.data.provider}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => download(scan)}
                  className={button}
                  aria-label={`Download report ${scan.title}`}
                >
                  <Download size={16} />
                  Report
                </button>
                {can("intelligence", "write") && (
                  <button
                    onClick={() => void archive(scan)}
                    className={button}
                    aria-label={`Archive scan ${scan.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">
                  Face-manipulation confidence
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {score(scan.data.deepfake)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  AI-generation confidence
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {score(scan.data.aiGenerated)}
                </p>
              </div>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              SHA-256: {scan.data.sha256}
            </p>
            {scan.data.frames.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  Frame results ({scan.data.frames.length})
                </summary>
                <div className="mt-3 max-h-60 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Face manipulation</th>
                        <th>AI generated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scan.data.frames.map((f, i) => (
                        <tr key={i}>
                          <td className="py-2">{f.position ?? i}</td>
                          <td>{score(f.deepfake)}</td>
                          <td>{score(f.aiGenerated)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </article>
        ))
      )}
    </div>
  );
}
