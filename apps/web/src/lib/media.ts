export type MediaContext = { user_id: string; tenant_id: string | null; tenant_name: string | null; is_owner: boolean; is_platform_admin: boolean; can_upload_learning: boolean };
export type MediaBucket = "tenant-media" | "tenant-learning" | "platform-media";
export function mediaUrl(bucket: MediaBucket, path: string, version?: number | string | null) {
  return `/api/media/file?bucket=${bucket}&path=${encodeURIComponent(path)}${version ? `&v=${version}` : ""}`;
}
export const imageTypes = ["image/png", "image/jpeg", "image/webp"];
export function validateMedia(file: File, bucket: MediaBucket) {
  const allowed = bucket === "tenant-learning" ? [...imageTypes, "application/pdf", "video/mp4"] : imageTypes;
  if (!allowed.includes(file.type)) return "type";
  if (file.size > (bucket === "tenant-learning" ? 20 : 5) * 1024 * 1024 || file.size === 0) return "size";
  return null;
}
