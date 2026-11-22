import { describe, expect, it, vi } from "vitest";

// The cloud switch's fresh read: overlapping callers share ONE fetch, and the 60 s throttle is restored exactly once.
const rc = { settings: { minimumFetchIntervalMillis: 60_000 } };
let release: () => void = () => {};
const fetchAndActivate = vi.fn(() => new Promise<boolean>((r) => (release = () => r(true))));
let switchOn = false;
vi.mock("firebase/remote-config", () => ({ fetchAndActivate, getValue: () => ({ asBoolean: () => switchOn }) }));
vi.mock("@/lib/firebase", () => ({ firebase: () => ({ rc }), RC_DEFAULTS: { cloud_kill_switch: false } }));

const { refreshCloudKill } = await import("@/lib/rc");

describe("refreshCloudKill", () => {
  it("two overlapping callers share one fetch; the throttle is back at 60 s afterwards, never left at 0", async () => {
    const a = refreshCloudKill();
    const b = refreshCloudKill();
    expect(fetchAndActivate).toHaveBeenCalledTimes(1);
    expect(rc.settings.minimumFetchIntervalMillis).toBe(0);
    switchOn = true;
    release();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(rc.settings.minimumFetchIntervalMillis).toBe(60_000);
  });
  it("a later call starts a new fetch", async () => {
    fetchAndActivate.mockClear();
    const c = refreshCloudKill();
    expect(fetchAndActivate).toHaveBeenCalledTimes(1); // a fresh fetch, not the settled one from the previous test
    release();
    await c;
    expect(rc.settings.minimumFetchIntervalMillis).toBe(60_000);
  });
});
