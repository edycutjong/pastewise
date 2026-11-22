// email: RFC-lite shape, and present in the paste (case-insensitive).
import { amber, empty, found, type GateResult } from "./types";

export function gateEmail(paste: string, proposed: string): GateResult {
  const v = proposed.trim();
  if (!v) return empty(proposed);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return amber("format", "", proposed);
  const at = paste.toLowerCase().indexOf(v.toLowerCase());
  if (at < 0) return amber("not_in_text", "", proposed);
  return found(paste.slice(at, at + v.length), proposed, [[at, at + v.length]]);
}
