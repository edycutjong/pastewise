import Link from "next/link";

// Three pages only: the Fill screen, the receipt, the bench. Plain links so the static export stays static.
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
    </nav>
  );
}
