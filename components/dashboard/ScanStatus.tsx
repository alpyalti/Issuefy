"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardRole } from "./dashboard-role-context";

type Job = { id: string; status: string; stage: string; stale: boolean; delayed: boolean; failed_stages?: string[] };
export default function ScanStatus({ projectId }: { projectId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const prior = useRef<string | null>(null);
  const router = useRouter();
  const role = useDashboardRole();
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const update = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const res = await fetch(`/api/projects/${projectId}/refresh`, { signal: controller.signal });
        if (!res.ok) throw new Error("Scan status is unavailable. Your last results are still shown.");
        const body = await res.json();
        const next = body.job as Job | null;
        setJob(next); setError(null);
        const key = next ? `${next.id}:${next.status}` : null;
        if (prior.current && prior.current !== key) router.refresh();
        prior.current = key;
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Scan status unavailable");
      } finally { fetching = false; }
    };
    void update();
    const timer = setInterval(update, 8000);
    window.addEventListener("scan-queued", update);
    return () => { clearInterval(timer); controller.abort(); window.removeEventListener("scan-queued", update); };
  }, [projectId, router]);
  async function retry() {
    if (!job) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/refresh?jobId=${job.id}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not retry delivery");
      setError(null); window.dispatchEvent(new Event("scan-queued"));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not retry delivery"); }
    finally { setRetrying(false); }
  }
  if (!job && !error) return null;
  const message = job?.stale ? "Scan interrupted or overdue. Its provider outcome is uncertain; it will not be replayed automatically."
    : job?.status === "pending" ? (job.delayed ? "Scan is still queued. Delivery can be retried without reserving another refresh." : "Scan queued. Results have not been refreshed yet.")
    : job?.status === "running" ? `Scan running: ${job.stage}. Previous results remain visible.`
    : job?.status === "partial" ? `Scan finished with errors in ${(job.failed_stages || ["one or more stages"]).join(", ")}. Results may be incomplete; review before starting a new scan.`
    : job?.status === "failed" ? `Scan failed during ${job.stage}. Previous results remain visible. Review before requesting a new scan.`
    : "Latest scan completed.";
  return <section role="status" aria-live="polite" style={{ padding: "12px 16px", border: "1px solid var(--line)", borderRadius: 12, fontSize: 13 }}>
    <p>{error || message}</p>
    {role !== "viewer" && job?.status === "pending" && job.delayed && <button className="btn btn-quiet btn-sm" disabled={retrying} onClick={retry}>
      {retrying ? "Retrying delivery…" : "Retry delivery"}
    </button>}
  </section>;
}
