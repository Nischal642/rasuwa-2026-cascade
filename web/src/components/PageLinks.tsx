"use client";
// The two pages and the code, in the record strip; the page you are on is marked.
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PageLinks({ repo }: { repo: string }) {
  const path = usePathname();
  const here = (p: string) => (path === p || path === `${p}/` ? "page" : undefined);
  return (
    <span className="page-links">
      <Link href="/" aria-current={here("/")}>The study</Link>
      <Link href="/method/" aria-current={here("/method")}>Method, step by step</Link>
      <a href={repo}>Code and data</a>
    </span>
  );
}
