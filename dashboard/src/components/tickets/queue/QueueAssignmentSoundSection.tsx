"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULT_URL = "/notification.wav";

export function QueueAssignmentSoundSection({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [soundUrl, setSoundUrl] = useState(DEFAULT_URL);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets/queue-assignment-sound", { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as {
        success?: boolean;
        data?: { enabled?: boolean; soundUrl?: string };
        error?: string;
      };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Load failed");
      setEnabled(j.data?.enabled !== false);
      setSoundUrl(String(j.data?.soundUrl ?? DEFAULT_URL));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (patch: { enabled?: boolean; soundUrl?: string }) => {
      setSaving(true);
      try {
        const res = await fetch("/api/tickets/queue-assignment-sound", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(patch),
        });
        const j = (await res.json()) as {
          success?: boolean;
          data?: { enabled?: boolean; soundUrl?: string };
          error?: string;
        };
        if (!res.ok || !j.success) throw new Error(j.error ?? "Save failed");
        if (j.data) {
          setEnabled(j.data.enabled !== false);
          setSoundUrl(String(j.data.soundUrl ?? DEFAULT_URL));
        }
        void queryClient.invalidateQueries({ queryKey: ["queueAssignmentSound"] });
        toast("Queue alert sound updated", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Save failed", "error");
      } finally {
        setSaving(false);
      }
    },
    [toast, queryClient]
  );

  const preview = () => {
    try {
      const a = new Audio(soundUrl);
      a.volume = 0.65;
      void a.play().catch(() => toast("Could not play (check URL or browser autoplay)", "error"));
    } catch {
      toast("Could not play preview", "error");
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch("/api/tickets/queue-assignment-sound/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = (await res.json()) as { success?: boolean; data?: { url?: string }; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Upload failed");
      const url = String(j.data?.url ?? "");
      if (!url.startsWith("/")) throw new Error("Invalid upload response");
      await persist({ soundUrl: url });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    }
  };

  const wrapClass = embedded ? "" : "rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6";

  if (loading) {
    return (
      <div className={wrapClass}>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`${wrapClass} space-y-5`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => void persist({ enabled: e.target.checked })}
        />
        Play sound when a new ticket appears in an agent&apos;s queue list (same tab; respects filters / page).
      </label>
      <div>
        <label htmlFor="queue-sound-url" className="block text-xs font-medium text-gray-600">
          Sound file path (served from this site)
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="queue-sound-url"
            type="text"
            value={soundUrl}
            disabled={saving}
            onChange={(e) => setSoundUrl(e.target.value)}
            className="w-full min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900"
            placeholder={DEFAULT_URL}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void persist({ soundUrl: soundUrl.trim() || DEFAULT_URL })}
            className="shrink-0 rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-900"
          >
            Save URL
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          Default: <code className="rounded bg-gray-100 px-1">{DEFAULT_URL}</code> — place the file under{" "}
          <code className="rounded bg-gray-100 px-1">public/</code> or upload below.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={preview}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          Test sound
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setSoundUrl(DEFAULT_URL);
            void persist({ soundUrl: DEFAULT_URL });
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          Reset to default
        </button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">
          <input type="file" accept=".wav,.mp3,.ogg,.mpeg,.m4a,audio/*" className="hidden" onChange={onUpload} disabled={saving} />
          Upload new sound
        </label>
      </div>
    </div>
  );
}
