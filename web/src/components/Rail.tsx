"use client";
// The channel list: where the reader is, and the way to every other section.
import { useEffect, useState } from "react";

type Section = { id: string; key: string; name: string };

export default function Rail({ sections: SECTIONS }: { sections: Section[] }) {
  const [active, setActive] = useState("");

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [SECTIONS]);

  const current = SECTIONS.find((s) => s.id === active);
  const links = SECTIONS.map((s) => (
    <li key={s.id}>
      <a href={`#${s.id}`} aria-current={s.id === active ? "true" : undefined}>
        <span className="rail-key">{s.key}</span>{s.name}
      </a>
    </li>
  ));

  return (
    <>
      <nav className="rail" aria-label="Sections"><ol>{links}</ol></nav>
      <details className="rail-mobile">
        <summary><span>{current ? `${current.key ? current.key + " · " : ""}${current.name}` : "Contents"}</span><span>Sections <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></span></summary>
        <nav aria-label="Sections (compact)"><ol onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement).open = false}>{links}</ol></nav>
      </details>
    </>
  );
}
