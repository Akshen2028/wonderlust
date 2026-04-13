import { createBrowserSupabase } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/lib/constants";

export async function getSignedFileUrl(
  bucket: keyof typeof STORAGE_BUCKETS,
  path: string,
  expiresSec = 3600
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const name = STORAGE_BUCKETS[bucket];
  const { data, error } = await supabase.storage.from(name).createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function buildCoverPath(tripId: string, fileName: string) {
  return `${tripId}/${fileName}`;
}

export function buildDayPhotoPath(tripId: string, tripDayId: string, fileName: string) {
  return `${tripId}/${tripDayId}/${fileName}`;
}
