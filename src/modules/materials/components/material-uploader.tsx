"use client";

import { useActionState, useState } from "react";
import { toggleMaterialAction, type MaterialFormState } from "@/modules/materials/actions";
import { MAX_MATERIAL_BYTES } from "@/modules/materials/schema";
import { Button, Notice, inputClass } from "@/components/ui";

interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: "raw";
}

/** Teacher/admin uploader: signed direct-to-Cloudinary, then a record POST. */
export function MaterialUploader({ courseId }: { courseId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("Uploading…");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (file.size > MAX_MATERIAL_BYTES) {
      setError("File too large (max 30 MB).");
      return;
    }

    setUploading(true);
    setUploadLabel("Uploading…");
    try {
      // 1) ask the server for a signature (also re-checks course-manager RBAC)
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "material", courseId }),
      });
      const signed = (await signRes.json()) as SignedUpload & { error?: string };
      if (!signRes.ok) throw new Error(signed.error ?? "Could not start the upload.");

      // 2) upload straight to Cloudinary (raw endpoint)
      setUploadLabel(`Uploading… ${file.name}`);
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signed.apiKey);
      form.append("timestamp", String(signed.timestamp));
      form.append("signature", signed.signature);
      form.append("folder", signed.folder);
      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${signed.cloudName}/${signed.resourceType}/upload`,
        { method: "POST", body: form },
      );
      const up = (await upRes.json()) as { public_id?: string; error?: { message: string } };
      if (!upRes.ok || !up.public_id) {
        throw new Error(up.error?.message ?? "Upload to storage failed.");
      }

      // 3) record metadata + trigger text extraction
      setUploadLabel("Saving record…");
      const recRes = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          title: title || file.name.replace(/\.[^.]+$/, ""),
          topic,
          cloudinaryPublicId: up.public_id,
          fileName: file.name,
          size: file.size,
        }),
      });
      const rec = (await recRes.json()) as { extraction?: { status: string; message: string }; error?: string };
      if (!recRes.ok) throw new Error(rec.error ?? "Could not save the material.");
      setDone(rec.extraction?.message ? rec.extraction.message : "Material uploaded and indexed.");

      setFile(null);
      setTitle("");
      setTopic("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          File <span className="text-muted">(PDF, DOCX, PPTX, ZIP · max 30 MB)</span>
          <input
            type="file"
            accept=".pdf,.docx,.pptx,.zip"
            required
            disabled={uploading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Week 1 — Intro slides"
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Topic / week <span className="text-muted">(groups the list)</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Week 1"
            className={inputClass}
          />
        </label>
      </div>
      <Button
        type="submit"
        disabled={uploading}
        aria-busy={uploading || undefined}
        className="self-start"
      >
        {uploading ? uploadLabel : "Upload material"}
      </Button>
    </form>
  );
}

/** Hide/unhide control for the uploader or admins. */
export function MaterialVisibilityToggle({ materialId, hidden }: { materialId: string; hidden: boolean }) {
  const [state, formAction, pending] = useActionState(toggleMaterialAction, {} as MaterialFormState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="id" value={materialId} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? (hidden ? "Restoring…" : "Hiding…") : hidden ? "Restore" : "Hide"}
      </Button>
    </form>
  );
}
