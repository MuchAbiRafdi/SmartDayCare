"use client";

import * as React from "react";

/**
 * Pembungkus tabel yang bisa digulir mendatar di layar sempit.
 * Saat isinya benar-benar lebih lebar dari wadahnya, wadah menjadi bisa difokus
 * (tab stop) supaya pengguna papan ketik dapat menggesernya; di layar lebar
 * tidak ada tab stop tambahan.
 */
export function TableWrap({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="table-wrap" role="region" aria-label={label} tabIndex={scrollable ? 0 : undefined}>
      {children}
    </div>
  );
}
