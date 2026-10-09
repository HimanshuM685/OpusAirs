"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function Deferred({ children, height = 300 }: { children: ReactNode; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "120px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={{ minHeight: height }}>{visible ? children : <div className="chart-placeholder" style={{ height }} aria-hidden="true" />}</div>;
}
