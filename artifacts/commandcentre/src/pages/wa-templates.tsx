import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, RefreshCw, Send, Pencil, Archive, X } from "lucide-react";
import { api } from "@/lib/records";
import { useAuth } from "@/lib/auth";
type Draft = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  header: string;
  footer: string;
  examples: string[];
};
type Template = {
  id: number;
  title: string;
  status: string;
  data: Draft & { metaId?: string; metaStatus?: string; reason?: string };
  updatedAt: string;
};
const blank: Draft = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  body: "",
  header: "",
  footer: "",
  examples: [],
};
const input =
  "w-full rounded-lg border border-border bg-background p-2.5 text-sm";
const button =
  "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50";
export default function WaTemplates() {
  const { can } = useAuth();
  const writable = can("messaging", "write");
  const list = useQuery({
    queryKey: ["wa-templates"],
    queryFn: () => api<Template[]>("wa-templates"),
  });
  const connection = useQuery({
    queryKey: ["wa-template-status"],
    queryFn: () =>
      api<{ configured: boolean; phoneConfigured: boolean }>(
        "wa-templates/status",
      ),
  });
  const [editing, setEditing] = useState<number | "new" | null>(null),
    [form, setForm] = useState<Draft>(blank),
    [examples, setExamples] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  const [testing, setTesting] = useState<Template | null>(null),
    [phone, setPhone] = useState(""),
    [values, setValues] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false);
  const change = (key: keyof Draft, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  function edit(t?: Template) {
    setEditing(t?.id ?? "new");
    setForm(
      t
        ? {
            name: t.data.name,
            language: t.data.language,
            category: t.data.category,
            body: t.data.body,
            header: t.data.header ?? "",
            footer: t.data.footer ?? "",
            examples: t.data.examples ?? [],
          }
        : blank,
    );
    setExamples(t?.data.examples?.join("\n") ?? "");
    setError("");
  }
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await list.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      await api(`wa-templates${editing === "new" ? "" : `/${editing}`}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify({
          ...form,
          examples: examples.trim()
            ? examples.split("\n").map((s) => s.trim())
            : [],
        }),
      });
      setEditing(null);
    }, "Draft saved.");
  }
  async function sync() {
    await act(async () => {
      const result = await api<{ synced: number; truncated: boolean }>(
        "wa-templates/sync",
        { method: "POST", body: "{}" },
      );
      if (result.truncated)
        throw new Error(
          "Only the first 1,000 account templates were checked. Narrow this account before syncing again.",
        );
    }, "Template statuses synced from Meta.");
  }
  async function test(e: FormEvent) {
    e.preventDefault();
    if (!testing) return;
    await act(async () => {
      const response = await api<{ providerMessageId: string }>(
        `wa-templates/${testing.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({ phone, values, confirm: confirmed }),
        },
      );
      setTesting(null);
      setPhone("");
      setConfirmed(false);
      return response;
    }, "Meta accepted the test message. Delivery is not yet confirmed.");
  }
  const existing =
    editing && editing !== "new"
      ? list.data?.find((t) => t.id === editing)
      : null;
  const preview = form.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, n) => examples.split("\n")[Number(n) - 1] || `{{${n}}}`,
  );
  const rows = list.data?.filter((t) =>
    `${t.title} ${t.status} ${t.data.language}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">WA Templates</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create message templates, preview placeholders, submit to Meta and
            sync approval status.
          </p>
        </div>
        <div className="flex gap-2">
          {writable && (
            <>
              <button
                onClick={() => void sync()}
                disabled={busy || !connection.data?.configured}
                className={button}
              >
                <RefreshCw size={16} />
                Sync status
              </button>
              <button
                onClick={() => edit()}
                className={`${button} bg-primary text-primary-foreground`}
              >
                <Plus size={16} />
                New template
              </button>
            </>
          )}
        </div>
      </div>
      {error && editing === null && !testing && (
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
      <div className="replica-panel p-4 text-sm text-muted-foreground">
        {connection.isLoading ? (
          "Checking Meta connection…"
        ) : connection.isError ? (
          "Could not load provider settings."
        ) : connection.data?.configured ? (
          "Meta provider configured. Submission and sync use your saved WhatsApp Business Account."
        ) : (
          <>
            Drafts and previews work now. For submission, approval sync and test
            messages,{" "}
            <Link
              href="/messaging?channel=whatsapp"
              className="text-primary underline"
            >
              connect Meta Cloud API in Messaging settings
            </Link>{" "}
            with an access token, Business Account ID and Phone Number ID.
          </>
        )}
      </div>
      <label className="block">
        <span className="sr-only">Search templates</span>
        <input
          placeholder="Search templates"
          className={input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {list.isLoading ? (
        <p>Loading templates…</p>
      ) : list.isError ? (
        <p role="alert">
          Templates could not be loaded.{" "}
          <button onClick={() => void list.refetch()} className="underline">
            Retry
          </button>
        </p>
      ) : !rows?.length ? (
        <div className="replica-panel p-8 text-center text-muted-foreground">
          No templates yet. Create your first draft.
        </div>
      ) : (
        rows.map((t) => (
          <article key={t.id} className="replica-panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.data.language} · {t.data.category} ·{" "}
                  <span className="uppercase">{t.status}</span>
                  {t.data.metaId ? ` · Meta ID ${t.data.metaId}` : ""}
                </p>
              </div>
              {writable && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => edit(t)}
                    disabled={busy}
                    className={button}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() =>
                      void act(
                        () =>
                          api(`wa-templates/${t.id}/submit`, {
                            method: "POST",
                            body: "{}",
                          }),
                        "Submitted to Meta. Sync status to check the approval decision.",
                      )
                    }
                    disabled={
                      busy ||
                      t.status !== "draft" ||
                      !connection.data?.configured
                    }
                    className={button}
                  >
                    <Send size={14} />
                    Submit to Meta
                  </button>
                  {t.status === "approved" && (
                    <button
                      disabled={busy || !connection.data?.phoneConfigured}
                      onClick={() => {
                        setTesting(t);
                        setValues(t.data.examples.map(() => ""));
                        setConfirmed(false);
                      }}
                      className={button}
                    >
                      Send test
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Archive ${t.title} locally? Its Meta template stays in your account.`,
                        )
                      )
                        void act(
                          () =>
                            api(`wa-templates/${t.id}`, { method: "DELETE" }),
                          "Template archived locally.",
                        );
                    }}
                    disabled={busy}
                    className={button}
                    aria-label={`Archive ${t.title}`}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="max-w-lg rounded-lg border border-border bg-background p-4">
              {t.data.header && (
                <p className="mb-2 font-semibold">{t.data.header}</p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm">
                {t.data.body.replace(
                  /\{\{(\d+)\}\}/g,
                  (_, n) => t.data.examples[Number(n) - 1] || `{{${n}}}`,
                )}
              </p>
              {t.data.footer && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t.data.footer}
                </p>
              )}
            </div>
            {t.data.reason && (
              <p className="text-sm text-red-300">
                Meta review: {t.data.reason}
              </p>
            )}
          </article>
        ))
      )}
      {editing !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4">
          <form
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            aria-label="Template editor"
            className="replica-panel mx-auto my-4 max-w-4xl space-y-5 p-6"
          >
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold">
                {editing === "new" ? "New template" : "Edit template"}
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
                aria-label="Close template editor"
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <label className="block space-y-2 text-sm">
                  Template name
                  <input
                    autoFocus
                    required
                    disabled={!!existing?.data.metaId}
                    value={form.name}
                    onChange={(e) => change("name", e.target.value)}
                    pattern="[a-z][a-z0-9_]*"
                    className={input}
                    placeholder="event_reminder"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-2 text-sm">
                    Language
                    <input
                      required
                      disabled={!!existing?.data.metaId}
                      value={form.language}
                      onChange={(e) => change("language", e.target.value)}
                      className={input}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    Category
                    <select
                      value={form.category}
                      onChange={(e) => change("category", e.target.value)}
                      className={input}
                    >
                      <option value="UTILITY">Utility</option>
                      <option value="MARKETING">Marketing</option>
                    </select>
                  </label>
                </div>
                <label className="block space-y-2 text-sm">
                  Header (optional)
                  <input
                    value={form.header}
                    onChange={(e) => change("header", e.target.value)}
                    maxLength={60}
                    className={input}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  Message body
                  <textarea
                    required
                    rows={7}
                    value={form.body}
                    onChange={(e) => change("body", e.target.value)}
                    maxLength={1024}
                    className={input}
                    placeholder="Hello {{1}}, your meeting is at {{2}}."
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  Footer (optional)
                  <input
                    value={form.footer}
                    onChange={(e) => change("footer", e.target.value)}
                    maxLength={60}
                    className={input}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  Sample values (one per line)
                  <textarea
                    rows={3}
                    className={input}
                    value={examples}
                    onChange={(e) => setExamples(e.target.value)}
                    placeholder={"Jane\n10:00 AM"}
                  />
                </label>
              </div>
              <div>
                <h3 className="mb-3 font-semibold">Message preview</h3>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
                  <p className="font-semibold">{form.header}</p>
                  <p className="my-3 whitespace-pre-wrap break-words text-sm">
                    {preview || "Your message appears here."}
                  </p>
                  <p className="text-xs text-muted-foreground">{form.footer}</p>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Use numbered body placeholders: {"{{1}}, {{2}}"}. Add a sample
                  for each before saving. Header and footer use plain text. Meta
                  decides template approval.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                disabled={busy}
                className={`${button} bg-primary text-primary-foreground`}
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
            </div>
          </form>
        </div>
      )}
      {testing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4">
          <form
            onSubmit={test}
            role="dialog"
            aria-modal="true"
            aria-label="Send template test"
            className="replica-panel w-full max-w-lg space-y-4 p-6"
          >
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">
                Send a real test message
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => setTesting(null)}
                aria-label="Close test message"
              >
                <X size={20} />
              </button>
            </div>
            <label className="block space-y-2 text-sm">
              WhatsApp number
              <input
                required
                pattern="254[0-9]{9}"
                className={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2547XXXXXXXX"
              />
            </label>
            {values.map((v, i) => (
              <label key={i} className="block space-y-2 text-sm">
                Value for {`{{${i + 1}}}`}
                <input
                  required
                  className={input}
                  value={v}
                  onChange={(e) =>
                    setValues((old) =>
                      old.map((x, j) => (i === j ? e.target.value : x)),
                    )
                  }
                />
              </label>
            ))}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have permission to send this message to this number.
            </label>
            <button
              disabled={busy || !confirmed}
              className={`${button} bg-primary text-primary-foreground`}
            >
              {busy ? "Sending…" : "Send WhatsApp test"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
