"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Eye, EyeOff, Save, Trash2, X } from "lucide-react";
import {
  finalizeJobPhotoUpload,
  listJobPhotos,
  requestJobPhotoUpload,
} from "@/app/CanesPressure/crew-actions";
import {
  deleteJobMedia,
  ownerFinalizeJobPhotoUpload,
  ownerListJobMedia,
  ownerRequestJobPhotoUpload,
  setJobMediaCustomerVisible,
  updateJobMediaDetails,
} from "@/app/CanesPressure/crew-owner-actions";
import { preparePhoto, uploadToSignedUrl } from "./photo-utils";
import {
  fmtEt,
  MEDIA_CATEGORY_LABEL,
  type JobMediaCategory,
  type JobMediaItem,
} from "@/lib/canes/types";

// One gallery for both surfaces. The owner variant lazy-loads (the job sheet
// opens for any calendar job, so nothing is fetched until it renders) and gets
// the review controls; the crew variant receives server-fetched items and is
// capture-first. Signed URLs are short-lived — items are always refetched
// after a mutation instead of patched locally.

const CATEGORY_ORDER: JobMediaCategory[] = ["before", "after", "issue", "walkthrough", "reference"];
const CREW_CATEGORIES: JobMediaCategory[] = ["before", "after", "issue"];
const RAW_FILE_MAX_BYTES = 40 * 1024 * 1024;

type Feedback = { ok: boolean; text: string } | null;

export function JobMediaSection({
  jobId,
  variant,
  canUpload,
  initialItems,
}: {
  jobId: string;
  variant: "owner" | "crew";
  canUpload: boolean;
  initialItems?: JobMediaItem[];
}) {
  const owner = variant === "owner";
  const categories = owner ? CATEGORY_ORDER : CREW_CATEGORIES;
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<JobMediaItem[]>(initialItems ?? []);
  const [notice, setNotice] = useState<Feedback>(null);
  const [category, setCategory] = useState<JobMediaCategory>("before");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<JobMediaCategory>("before");
  const [editCaption, setEditCaption] = useState("");

  async function refreshItems(): Promise<void> {
    const res = owner ? await ownerListJobMedia(jobId) : await listJobPhotos(jobId);
    if (res.ok && res.items) setItems(res.items);
    else if (res.notice) setNotice({ ok: false, text: res.notice });
  }

  // The owner sheet lazy-loads once per opened job; crew pages pass server data.
  useEffect(() => {
    if (!owner) return;
    ownerListJobMedia(jobId).then((res) => {
      if (res.ok && res.items) setItems(res.items);
    });
  }, [owner, jobId]);

  async function uploadOne(file: File): Promise<string | null> {
    if (file.size > RAW_FILE_MAX_BYTES) {
      return `${file.name || "A photo"} is too large to process.`;
    }
    try {
      const prepared = await preparePhoto(file);
      const meta = {
        mimeType: "image/jpeg",
        sizeBytes: prepared.original.size,
        category,
      };
      const request = owner ? ownerRequestJobPhotoUpload : requestJobPhotoUpload;
      const authorized = await request(jobId, meta);
      if (!authorized.ok || !authorized.grant) {
        return authorized.notice ?? "The upload could not be authorized.";
      }
      await Promise.all([
        uploadToSignedUrl(authorized.grant.originalUploadUrl, prepared.original),
        uploadToSignedUrl(authorized.grant.thumbnailUploadUrl, prepared.thumbnail),
      ]);
      const finalize = owner ? ownerFinalizeJobPhotoUpload : finalizeJobPhotoUpload;
      const finalized = await finalize({
        jobId,
        mediaId: authorized.grant.mediaId,
        ...meta,
        width: prepared.width,
        height: prepared.height,
        capturedAt: prepared.capturedAt,
      });
      return finalized.ok ? null : (finalized.notice ?? "The upload could not be saved.");
    } catch (error) {
      return error instanceof Error ? error.message : "The upload failed. Try again.";
    }
  }

  async function handleFiles(list: FileList | null): Promise<void> {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    setNotice(null);
    setUploading({ done: 0, total: files.length });
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      const failure = await uploadOne(file);
      if (failure) failures.push(failure);
      setUploading({ done: index + 1, total: files.length });
    }
    setUploading(null);
    await refreshItems();
    const added = files.length - failures.length;
    setNotice(
      failures.length
        ? { ok: false, text: failures[0] + (failures.length > 1 ? ` (+${failures.length - 1} more failed)` : "") }
        : { ok: true, text: added === 1 ? "Photo added." : `${added} photos added.` },
    );
  }

  function openLightbox(item: JobMediaItem): void {
    setActiveId(item.id);
    setEditCategory(item.category);
    setEditCaption(item.caption ?? "");
    setNotice(null);
  }

  async function runOwner(action: () => Promise<{ ok: boolean; notice?: string }>): Promise<void> {
    setBusy(true);
    const res = await action();
    setNotice(res.notice ? { ok: res.ok, text: res.notice } : null);
    if (res.ok) await refreshItems();
    setBusy(false);
  }

  const active = items.find((item) => item.id === activeId) ?? null;
  const groups = CATEGORY_ORDER.map((key) => ({
    key,
    items: items.filter((item) => item.category === key),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="cp-group-label">Photos</p>
        {items.length > 0 && (
          <span className="cp-mono">{items.length} photo{items.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {groups.length === 0 && (
        <p className="mt-2 text-[12.5px] text-[var(--cp-faint)]">
          {canUpload ? "No photos yet. Add before and after shots." : "No photos were added."}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="mt-3">
          <p className="cp-mono">
            {MEDIA_CATEGORY_LABEL[group.key]} · {group.items.length}
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="relative aspect-square cursor-pointer overflow-hidden rounded-md border border-[var(--cp-line)] bg-[var(--cp-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cp-brand)]"
                onClick={() => openLightbox(item)}
                aria-label={`Open ${MEDIA_CATEGORY_LABEL[item.category]} photo`}
              >
                {item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt={item.caption ?? `${MEDIA_CATEGORY_LABEL[item.category]} photo`}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 33vw, 160px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-[11px] text-[var(--cp-faint)]">
                    Unavailable
                  </span>
                )}
                {owner && item.visibility === "customer" && (
                  <span className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
                    <Eye aria-hidden size={11} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {canUpload && (
        <div className="mt-3 space-y-2 rounded-md bg-[var(--cp-bg)] p-3">
          <div>
            <p className="cp-label">Photo type</p>
            <div className={`grid gap-1.5 ${owner ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3"}`}>
              {categories.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="cp-slot"
                  data-selected={key === category}
                  onClick={() => setCategory(key)}
                >
                  {MEDIA_CATEGORY_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="cp-btn cp-btn-primary min-h-11 w-full cursor-pointer"
            disabled={uploading !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Camera aria-hidden size={16} />
            {uploading ? `Uploading ${uploading.done}/${uploading.total}…` : "Add photos"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      )}

      <div className="mt-2 min-h-5">
        {notice && (
          <p
            role="status"
            className="text-[12.5px] font-medium"
            style={{ color: notice.ok ? "var(--cp-good)" : "var(--cp-danger)" }}
          >
            {notice.text}
          </p>
        )}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-black/90 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          <div className="flex items-center justify-between gap-3 text-white">
            <p className="text-[13px] font-semibold">
              {MEDIA_CATEGORY_LABEL[active.category]}
              <span className="ml-2 font-normal text-white/70">
                {active.uploadedBy ?? "Office"} · {fmtEt(active.capturedAt ?? active.createdAt)}
              </span>
            </p>
            <button
              type="button"
              className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md hover:bg-white/10"
              onClick={() => setActiveId(null)}
              aria-label="Close photo"
            >
              <X aria-hidden size={20} />
            </button>
          </div>

          <div className="relative mt-2 min-h-0 flex-1">
            {active.fullUrl ? (
              <Image
                src={active.fullUrl}
                alt={active.caption ?? `${MEDIA_CATEGORY_LABEL[active.category]} photo`}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
              />
            ) : (
              <p className="flex h-full items-center justify-center text-[13px] text-white/70">
                This photo could not be loaded. Close and reopen the gallery.
              </p>
            )}
          </div>

          {active.caption && !owner && (
            <p className="mt-2 text-center text-[13px] text-white/85">{active.caption}</p>
          )}

          {owner && (
            <div className="mx-auto mt-3 w-full max-w-xl space-y-2 rounded-lg bg-[var(--cp-surface)] p-3">
              <div className="flex gap-2">
                <select
                  className="cp-select flex-1"
                  value={editCategory}
                  disabled={busy}
                  onChange={(event) => setEditCategory(event.target.value as JobMediaCategory)}
                >
                  {CATEGORY_ORDER.map((key) => (
                    <option key={key} value={key}>{MEDIA_CATEGORY_LABEL[key]}</option>
                  ))}
                </select>
                <input
                  className="cp-input flex-[2]"
                  value={editCaption}
                  maxLength={500}
                  placeholder="Caption (shown to the customer later)"
                  disabled={busy}
                  onChange={(event) => setEditCaption(event.target.value)}
                />
                <button
                  type="button"
                  className="cp-btn cp-btn-sm cursor-pointer"
                  disabled={
                    busy ||
                    (editCategory === active.category && editCaption === (active.caption ?? ""))
                  }
                  onClick={() =>
                    runOwner(() =>
                      updateJobMediaDetails(active.id, {
                        category: editCategory,
                        caption: editCaption,
                      }),
                    )
                  }
                >
                  <Save aria-hidden size={14} /> Save
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="cp-btn cp-btn-sm flex-1 cursor-pointer"
                  disabled={busy}
                  onClick={() =>
                    runOwner(() =>
                      setJobMediaCustomerVisible(active.id, active.visibility !== "customer"),
                    )
                  }
                >
                  {active.visibility === "customer" ? (
                    <>
                      <EyeOff aria-hidden size={14} /> Hide from customer
                    </>
                  ) : (
                    <>
                      <Eye aria-hidden size={14} /> Approve for customer
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="cp-btn cp-btn-sm cp-btn-danger cursor-pointer"
                  disabled={busy}
                  onClick={() =>
                    runOwner(async () => {
                      const res = await deleteJobMedia(active.id);
                      if (res.ok) setActiveId(null);
                      return res;
                    })
                  }
                >
                  <Trash2 aria-hidden size={14} /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
