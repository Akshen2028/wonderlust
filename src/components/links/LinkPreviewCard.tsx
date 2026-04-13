"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { LinkPreviewRow } from "@/types/db";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  cached?: LinkPreviewRow | null;
  titleOverride?: string | null;
  imageOverride?: string | null;
  descriptionOverride?: string | null;
  compact?: boolean;
};

export function LinkPreviewCard({
  href,
  cached,
  titleOverride,
  imageOverride,
  descriptionOverride,
  compact,
}: Props) {
  const [preview, setPreview] = useState<LinkPreviewRow | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) {
      setPreview(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(href)}`);
        const json = (await res.json()) as { preview?: LinkPreviewRow; fallback?: boolean };
        if (cancelled) return;
        if (json.preview) setPreview(json.preview);
        else setPreview(null);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [href, cached]);

  const domain = useMemo(() => {
    try {
      return new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return "Link";
    }
  }, [href]);

  const title = titleOverride || preview?.title || domain;
  const description = descriptionOverride || preview?.description || null;
  const image = imageOverride || preview?.image_url || null;
  const site = preview?.site_name || domain;

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={cn(
        "group block overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-soft",
        compact ? "max-w-md" : "max-w-xl"
      )}
    >
      <div className={cn("relative w-full overflow-hidden bg-[var(--elevated)]", compact ? "h-36" : "h-52")}>
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--elevated)] to-transparent" />
        ) : image ? (
          <Image
            src={image}
            alt=""
            fill
            className="object-cover transition duration-700 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 640px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            Preview unavailable
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{site}</p>
            <p className="line-clamp-2 font-display text-xl text-white">{title}</p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            Open
          </span>
        </div>
      </div>
      {description && !compact ? (
        <p className="line-clamp-3 px-5 py-4 text-sm text-[var(--muted)]">{description}</p>
      ) : (
        <div className="px-5 py-3 text-xs text-[var(--muted)]">Opens in a new tab</div>
      )}
    </motion.a>
  );
}
