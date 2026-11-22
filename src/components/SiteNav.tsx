import Link from "next/link";

// Three app pages (Fill, receipt, bench) plus the static /about and /pitch pages, which live in public/ outside the Next router,
// so they get plain <a> links (a client-side Link would look for a route payload that does not exist).
export default function SiteNav({ current }: { current: "fill" | "receipt" | "bench" }) {
  const items: { id: typeof current; href: string; text: string }[] = [
    { id: "fill", href: "/", text: "Fill" },
    { id: "receipt", href: "/receipt/", text: "Receipt" },
    { id: "bench", href: "/bench/", text: "Bench" },
  ];
  return (
    <nav className="site-nav" aria-label="Pages">
      {items.map((i) => (
        <Link key={i.id} href={i.href} aria-current={i.id === current ? "page" : undefined}>
          {i.text}
        </Link>
      ))}
      <a href="/about/">About</a>
      <a href="/pitch/">Pitch deck</a>
    </nav>
  );
}
