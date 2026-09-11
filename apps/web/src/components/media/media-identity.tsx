"use client";
import Image from "next/image";
import { useState } from "react";
import { mediaUrl } from "../../lib/media";
import { useMediaContext, useMediaEntries } from "./media-hooks";

function IdentityImage({ path, version, alt }: { path: string; version?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <Image unoptimized src={mediaUrl("tenant-media", path, version)} alt={alt} width={90} height={90} onError={() => setFailed(true)}/>;
}
export function AccountAvatar({ fallback }: { fallback: string }) {
  const { data: ctx } = useMediaContext();
  const prefix = ctx?.tenant_id ? `${ctx.tenant_id}/avatars` : undefined;
  const { data } = useMediaEntries("tenant-media", prefix);
  const file = data?.find(f => f.name === ctx?.user_id);
  return <span className="ose-avatar">{file ? <IdentityImage key={file.updated_at} path={`${prefix}/${file.name}`} version={file.updated_at} alt=""/> : fallback}</span>;
}
export function SchoolIdentity() {
  const { data: ctx } = useMediaContext();
  const prefix = ctx?.tenant_id ? `${ctx.tenant_id}/logos` : undefined;
  const { data } = useMediaEntries("tenant-media", prefix);
  const file = data?.find(f => f.name === "logo");
  if (!ctx?.tenant_id) return null;
  return <div className="ose-school-identity">{file && <IdentityImage key={file.updated_at} path={`${prefix}/logo`} version={file.updated_at} alt=""/>}<span>{ctx.tenant_name}</span></div>;
}
