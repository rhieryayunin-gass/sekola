"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslations } from "../i18n/i18n-provider";

export function HeroVideo() {
  const { locale } = useTranslations();
  const id = locale === "id-ID";
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const player = video.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!motion.matches) void player?.play().catch(() => {});
    const stop = () => { if (motion.matches) player?.pause(); };
    motion.addEventListener("change", stop);
    return () => motion.removeEventListener("change", stop);
  }, []);
  return <div className="p6-hero-video">
    <video ref={video} muted loop playsInline preload="none" poster="/videos/osekola-human-hero-poster.webp"
      aria-label={id ? "OSEKOLA: presensi wajah, chat guru dan orang tua, kolaborasi tim, dan pembayaran tagihan" : "OSEKOLA: face attendance, parent and teacher chat, team collaboration, and bill payments"}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
      <source src="/videos/osekola-human-hero.webm" type="video/webm"/>
      <source src="/videos/osekola-human-hero.mp4" type="video/mp4"/>
    </video>
    <button type="button" className="p6-video-toggle" aria-label={playing ? (id ? "Jeda video" : "Pause video") : (id ? "Putar video" : "Play video")}
      onClick={() => { if (video.current?.paused) void video.current.play().catch(() => {}); else video.current?.pause(); }}>
      {playing ? <Pause size={18} aria-hidden="true"/> : <Play size={18} aria-hidden="true"/>}
    </button>
  </div>;
}
