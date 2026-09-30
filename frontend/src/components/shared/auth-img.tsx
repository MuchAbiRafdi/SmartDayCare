"use client";
import * as React from "react";
import { api } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

/* Gambar dari endpoint terlindung (/api/photos/...). Saat sesi dibawa lewat header, tag <img>
   biasa tidak bisa menyertakannya, jadi berkas diambil dengan fetch lalu ditampilkan dari blob.
   Pada jalur cookie, src dipakai langsung. */
export function AuthImg({ src, alt, className, loading }: { src: string; alt: string; className?: string; loading?: "lazy" | "eager" }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!getSessionToken()) {
      setUrl(src);
      return;
    }
    let objectUrl: string | null = null;
    let live = true;
    api
      .blob(src)
      .then((b) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (!url) return <span className={className} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} loading={loading} decoding="async" />;
}
