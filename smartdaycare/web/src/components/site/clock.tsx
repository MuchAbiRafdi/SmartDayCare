"use client";
import * as React from "react";

/** Jam WIB yang berdetak di klien; server merender placeholder yang sama panjang. */
export function Clock({ className }: { className?: string }) {
  const [t, setT] = React.useState<string>("");
  React.useEffect(() => {
    const f = () =>
      setT(
        new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta" })
          .format(new Date())
          .replace(/\./g, ":"),
      );
    f();
    const i = window.setInterval(f, 1000);
    return () => window.clearInterval(i);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      {t ? t + " WIB" : "\u2007\u2007:\u2007\u2007:\u2007\u2007 WIB"}
    </span>
  );
}
