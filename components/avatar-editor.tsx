"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { removeAvatar, restoreGoogleAvatar, setUploadedAvatar } from "@/lib/client-actions";
import { getBrowserClient } from "@/lib/supabase/client";
import { Avatar } from "./avatar";
import { Sheet } from "./sheet";
import { toast } from "./toast";

const SIZE = 400;

/** Center-crop to a square and re-encode as JPEG: small upload, consistent look, no EXIF/location data. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("unreadable");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(SIZE, side);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!blob) throw new Error("unreadable");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarEditor({
  id,
  name,
  src,
  googlePhoto,
}: {
  id: string;
  name: string;
  src: string | null;
  googlePhoto: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(src);
  const usingGoogle = !!current && !!googlePhoto && current === googlePhoto;

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Choose a photo", "error");
    setOpen(false);
    setBusy(true);
    try {
      const blob = await toSquareJpeg(file);
      const path = `${id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await getBrowserClient().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const res = await setUploadedAvatar(path);
      if (!res.ok) return toast(res.error, "error");
      setCurrent(res.data!.url);
      toast("Photo updated");
      router.refresh();
    } catch (e) {
      toast((e as Error).message === "unreadable" ? "That photo couldn't be read. Try a JPEG or PNG." : "Upload failed. Try again.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; data?: { url: string } }>, next: (d?: { url: string }) => string | null, msg: string) {
    setOpen(false);
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "Try again", "error");
    setCurrent(next(res.data));
    toast(msg);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative shrink-0 rounded-full" aria-label="Change profile photo">
        <Avatar id={id} name={name} src={current} size={72} />
        <span className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white shadow-[0_0_0_3px_var(--color-mist)]" aria-hidden>
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      <Sheet open={open} onClose={() => setOpen(false)} title="Profile photo">
        <div className="space-y-2">
          <button onClick={() => input.current?.click()} className="h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white">
            Choose a photo
          </button>
          {googlePhoto && !usingGoogle && (
            <button
              onClick={() => run(restoreGoogleAvatar, (d) => d?.url ?? null, "Using your Google photo")}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-mist text-[16px] font-bold"
            >
              <Avatar id={id} name={name} src={googlePhoto} size={28} />
              Use your Google photo
            </button>
          )}
          {current && (
            <button onClick={() => run(removeAvatar, () => null, "Photo removed")} className="h-14 w-full rounded-2xl text-[16px] font-bold text-ember">
              Remove photo
            </button>
          )}
        </div>
        <p className="mt-4 text-[14px] leading-snug text-ink-3">Your partners see this next to your check-ins.</p>
      </Sheet>
    </>
  );
}
