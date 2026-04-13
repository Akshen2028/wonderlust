import { NextRequest, NextResponse } from "next/server";
import { load } from "cheerio";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

function cacheDays() {
  const n = Number(process.env.LINK_PREVIEW_CACHE_DAYS ?? "7");
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const urlString = target.toString();

  const { data: existing } = await supabase
    .from("link_previews")
    .select("*")
    .eq("url", urlString)
    .maybeSingle();

  const ttlMs = cacheDays() * 24 * 60 * 60 * 1000;
  if (existing?.fetched_at) {
    const age = Date.now() - new Date(existing.fetched_at).getTime();
    if (age < ttlMs) {
      return NextResponse.json({ preview: existing, cached: true });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; Wonderlust/1.0; +https://wonderlust.local) AppleWebKit/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ fallback: true, status: res.status });
    }

    const html = await res.text();
    const limited = html.slice(0, 1_500_000);
    const $ = load(limited);

    const meta = (prop: string) =>
      $(`meta[property="${prop}"]`).attr("content") ||
      $(`meta[name="${prop}"]`).attr("content");

    const title =
      meta("og:title") || meta("twitter:title") || $("title").first().text().trim() || null;
    const description =
      meta("og:description") || meta("twitter:description") || meta("description") || null;

    let image =
      meta("og:image") || meta("twitter:image") || meta("twitter:image:src") || null;
    if (image) {
      try {
        image = new URL(image, res.url).toString();
      } catch {
        image = null;
      }
    }

    const siteName = meta("og:site_name") || new URL(res.url).hostname.replace(/^www\./, "");

    const row = {
      url: urlString,
      canonical_url: res.url !== urlString ? res.url : null,
      title,
      description,
      image_url: image,
      site_name: siteName,
      fetched_at: new Date().toISOString(),
      raw_metadata: { status: res.status },
    };

    const { data: upserted, error } = await supabase
      .from("link_previews")
      .upsert(row, { onConflict: "url" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ fallback: true, error: error.message });
    }

    return NextResponse.json({ preview: upserted, cached: false });
  } catch (e) {
    clearTimeout(timeout);
    return NextResponse.json({ fallback: true, error: String(e) });
  }
}
