"use client";
// The no-Nano path. Nothing is sent until the person presses "Send this one": the sheet shows the exact text
// and its size first. State-aware copy: "can't run it" vs "not ready yet" (PREFER modes do not wait for a download).
import { useState } from "react";
import Modal from "./Modal";
import Replay, { type ReplayData } from "./Replay";

export type ConsentState = "ask" | "sending" | "failed";

export default function ConsentSheet(props: {
  open: boolean;
  availability: string | null;
  message: string;
  killSwitch: boolean;
  state: ConsentState;
  replay: ReplayData;
  onSend: () => void;
  onDecline: () => void;
}) {
  const { open, availability, message, killSwitch, state, replay, onSend, onDecline } = props;
  const [showReplay, setShowReplay] = useState(false);
  const notReady = availability === "downloadable" || availability === "downloading";
  const bytes = new TextEncoder().encode(message).length;
  return (
    <Modal open={open} onClose={onDecline} label="Send this one message to the cloud?">
      <h2 className="cap">{notReady ? "The on-device model isn't ready yet" : "This laptop can't run the on-device model"}</h2>
      {killSwitch ? (
        <p className="big" data-testid="consent-off">
          The cloud path is off right now, so nothing can be sent and nothing was. You can type the form by hand
          {notReady ? ", or wait for the on-device model to finish" : ", or open the page in Chrome with the built-in model"}.
        </p>
      ) : (
        <>
          <p className="big">
            {notReady ? "The on-device model isn't ready yet. " : ""}Send <em>this one message</em> to the cloud to fill the form?
          </p>
          <p className="fine">Exactly this text would be sent — {message.length.toLocaleString("en-US")} characters, {bytes.toLocaleString("en-US")} bytes:</p>
          <pre className="consent-text" data-testid="consent-text">
            {message}
          </pre>
          <p className="fine">Nothing is sent unless you press Send this one. After it, the receipt shows these bytes as “sent with your Yes”, and the badge shows where the fill really ran.</p>
        </>
      )}
      {state === "failed" && (
        <p className="notice" role="status" data-testid="consent-failed">
          The cloud didn&apos;t answer, so nothing was filled. A new try needs a new Yes.
        </p>
      )}
      <div className="modal-actions">
        {!killSwitch && (
          <button type="button" className="primary" onClick={onSend} disabled={state === "sending"} data-testid="consent-send">
            {state === "sending" ? "Sending…" : "Send this one"}
          </button>
        )}
        <button type="button" className="ghost" onClick={onDecline} data-testid="consent-decline">
          I&apos;ll type it
        </button>
      </div>
      <details>
        <summary>How to get the on-device model</summary>
        <p className="fine">
          Tested on Chrome 157 on a Mac. Built-in AI needs about 22 GB of free disk. Open <span className="mono">chrome://flags</span>, search for “Gemma 4 for Built-in AI” (the flag the
          hackathon FAQ names), enable it, relaunch Chrome and press Fill again — the first run downloads the model once.
        </p>
      </details>
      <button type="button" className="linkish" onClick={() => setShowReplay((v) => !v)} aria-expanded={showReplay}>
        {showReplay ? "Hide the recorded run" : "Watch a recorded run"}
      </button>
      {showReplay && <Replay data={replay} />}
    </Modal>
  );
}
