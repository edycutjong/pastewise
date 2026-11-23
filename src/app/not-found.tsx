import Link from "next/link";

// Branded 404 for the static export (out/404.html): say what exists instead of a framework default.
export default function NotFound() {
  return (
    <main className="notfound">
      <p className="cap">Nº 404</p>
      <h1>Not in the order book</h1>
      <p>This page does not exist. The fill screen, the network receipt and the bench numbers are one click away.</p>
      <p>
        <Link href="/">Fill a message</Link> · <Link href="/receipt/">Network receipt</Link> · <Link href="/bench/">Bench numbers</Link> ·{" "}
        <a href="/about/">About Pastewise</a>
      </p>
    </main>
  );
}
