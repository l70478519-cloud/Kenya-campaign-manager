import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { useUpdateInsightPoll } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Check,
  Download,
  Pencil,
  Loader2,
  MessageCircle,
  Facebook,
  Mail,
  Share2,
} from "lucide-react";

// X (Twitter) glyph — lucide dropped the bird, so inline the current logo.
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface SharePoll {
  id: number;
  title: string;
  slug?: string | null;
  shareToken: string;
  status?: string;
}

// Lightweight client-side slug suggestion mirroring the server's slugify rules.
// The server normalises + guarantees uniqueness on save, so this is just a hint.
function suggestSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

interface ShareDialogProps {
  poll: SharePoll | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSlugChange?: () => void;
}

type Channel = "whatsapp" | "x" | "facebook" | "email" | "copy" | "qr";

// Branded link points at the API server's root /s route (proxied), independent of
// the SPA base path. The ?src channel flows through to funnel analytics.
function buildLink(slug: string, channel?: string): string {
  const base = `${window.location.origin}/s/${slug}`;
  return channel ? `${base}?src=${encodeURIComponent(channel)}` : base;
}

export function ShareDialog({ poll, open, onOpenChange, onSlugChange }: ShareDialogProps) {
  const { toast } = useToast();
  const updatePoll = useUpdateInsightPoll();

  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const slug = poll?.slug ?? "";
  const link = slug ? buildLink(slug) : "";
  // QR scans are attributed to the `qr` channel in funnel analytics.
  const qrLink = slug ? buildLink(slug, "qr") : "";

  // Render a QR for the channel-attributed branded link.
  useEffect(() => {
    if (!qrLink) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrLink, { width: 512, margin: 2, color: { dark: "#1e1b4b", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  useEffect(() => {
    if (!open) {
      setEditingSlug(false);
      setCopied(false);
      return;
    }
    // Published poll missing a slug (e.g. legacy poll): prefill a suggestion.
    if (!slug && poll?.status === "published") {
      setSlugDraft(suggestSlug(poll.title));
    }
  }, [open, slug, poll?.status, poll?.title]);

  const copyLink = useCallback(
    (channel: string) => {
      navigator.clipboard.writeText(buildLink(slug, channel));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Link copied", description: "Branded poll link copied to clipboard." });
    },
    [slug, toast],
  );

  const handleSaveSlug = async () => {
    if (!poll) return;
    const clean = slugDraft.trim();
    if (!clean) {
      toast({ title: "Slug can't be empty", variant: "destructive" });
      return;
    }
    try {
      await updatePoll.mutateAsync({ id: poll.id, data: { slug: clean } });
      setEditingSlug(false);
      onSlugChange?.();
      toast({ title: "Link updated", description: "Your branded link is ready to share." });
    } catch {
      toast({ title: "Couldn't update link", description: "Try a different name.", variant: "destructive" });
    }
  };

  const downloadPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${slug || "poll"}-qr.png`;
    a.click();
  };

  const downloadSvg = async () => {
    if (!qrLink) return;
    const svg = await QRCode.toString(qrLink, {
      type: "svg",
      width: 512,
      margin: 2,
      color: { dark: "#1e1b4b", light: "#ffffff" },
    });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "poll"}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareText = poll ? `${poll.title} — share your opinion (takes under a minute):` : "";

  const socials: Array<{ key: Channel; label: string; icon: React.ReactNode; className: string; href: () => string }> = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className="h-4 w-4" />,
      className: "bg-[#25D366] hover:bg-[#1ebe57] text-white",
      href: () => `https://wa.me/?text=${encodeURIComponent(`${shareText} ${buildLink(slug, "whatsapp")}`)}`,
    },
    {
      key: "x",
      label: "X",
      icon: <XIcon className="h-4 w-4" />,
      className: "bg-black hover:bg-neutral-800 text-white",
      href: () =>
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(buildLink(slug, "x"))}`,
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: <Facebook className="h-4 w-4" />,
      className: "bg-[#1877F2] hover:bg-[#166fe0] text-white",
      href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(buildLink(slug, "facebook"))}`,
    },
    {
      key: "email",
      label: "Email",
      icon: <Mail className="h-4 w-4" />,
      className: "bg-slate-600 hover:bg-slate-700 text-white",
      href: () =>
        `mailto:?subject=${encodeURIComponent(poll?.title ?? "Opinion Poll")}&body=${encodeURIComponent(`${shareText}\n\n${buildLink(slug, "email")}`)}`,
    },
  ];

  const nativeShare = async () => {
    if (!navigator.share) {
      copyLink("native");
      return;
    }
    try {
      await navigator.share({ title: poll?.title, text: shareText, url: buildLink(slug, "native") });
    } catch {
      /* user dismissed share sheet */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-500" /> Share Poll
          </DialogTitle>
          <DialogDescription>
            Share your branded link, download a QR code, or post to social channels. Every channel is tracked in the
            Distribution dashboard.
          </DialogDescription>
        </DialogHeader>

        {!slug && poll?.status !== "published" ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Publish this poll first to generate a shareable link.
          </p>
        ) : !slug ? (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Choose a branded link for this poll to start sharing it.
            </p>
            <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1.5 text-sm">
              <span className="text-muted-foreground shrink-0">{window.location.host}/s/</span>
              <Input
                autoFocus
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveSlug()}
                className="h-7 border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none"
                placeholder="ward-survey"
              />
            </div>
            <Button size="sm" onClick={handleSaveSlug} disabled={updatePoll.isPending}>
              {updatePoll.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create branded link"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Letters, numbers and dashes only. We'll tidy it up and make sure it's unique.
            </p>
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Branded link + editable slug */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Branded link</Label>
              {editingSlug ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1.5 text-sm">
                    <span className="text-muted-foreground shrink-0">{window.location.host}/s/</span>
                    <Input
                      autoFocus
                      value={slugDraft}
                      onChange={(e) => setSlugDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveSlug()}
                      className="h-7 border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none"
                      placeholder="ward-survey"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveSlug} disabled={updatePoll.isPending}>
                      {updatePoll.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingSlug(false)}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Letters, numbers and dashes only. We'll tidy it up and make sure it's unique.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">{link}</code>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 shrink-0"
                    title="Edit link"
                    onClick={() => {
                      setSlugDraft(slug);
                      setEditingSlug(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 shrink-0"
                    title="Copy link"
                    onClick={() => copyLink("copy")}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>

            {/* Social buttons */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Share to</Label>
              <div className="grid grid-cols-2 gap-2">
                {socials.map((s) => (
                  <a key={s.key} href={s.href()} target="_blank" rel="noreferrer" className="contents">
                    <Button className={`w-full gap-2 ${s.className}`} type="button">
                      {s.icon} {s.label}
                    </Button>
                  </a>
                ))}
              </div>
              <Button variant="outline" className="w-full gap-2 mt-2" onClick={nativeShare}>
                <Share2 className="h-4 w-4" /> More / device share
              </Button>
            </div>

            {/* QR code */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">QR code</Label>
              <div className="flex items-center gap-4">
                <div className="rounded-lg border bg-white p-2 shrink-0">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Poll QR code" className="h-28 w-28" />
                  ) : (
                    <div className="h-28 w-28 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={downloadPng} disabled={!qrDataUrl}>
                    <Download className="h-4 w-4" /> PNG
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={downloadSvg} disabled={!link}>
                    <Download className="h-4 w-4" /> SVG
                  </Button>
                  <p className="text-[11px] text-muted-foreground max-w-[12rem]">
                    Print on posters or flyers — scanning opens the poll directly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
