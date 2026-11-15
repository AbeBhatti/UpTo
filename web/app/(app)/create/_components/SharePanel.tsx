"use client";

import { useState } from "react";
import type { UpTo } from "@upto/contracts";
import { Banner, Button, Panel, formStyles as s } from "../_shared/form";
import c from "./create.module.css";

/** Shown after publish: what was posted, and UpTo.shareLink() ready to copy. */
export function SharePanel({ upTo, onCreateAnother }: { upTo: UpTo; onCreateAnother?: () => void }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(upTo.shareUrl);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Panel title="Your Up-To is live" lede="Send the link to anyone. They can see it without an account.">
      <div className={c.summary}>
        {/* Server-rendered label, shown verbatim. */}
        <span className={c.summaryTime}>{upTo.timeLabel}</span>
        <span className={c.summaryTitle}>{upTo.title}</span>
        <span className={c.summaryPlace}>{upTo.location}</span>
      </div>

      <div className={c.shareBox}>
        <span className={c.shareUrl} title={upTo.shareUrl}>
          {upTo.shareUrl}
        </span>
        <Button type="button" variant="secondary" onClick={copy}>
          {copied === "copied" ? "Copied" : "Copy link"}
        </Button>
      </div>
      {copied === "failed" ? <Banner tone="danger">Couldn&apos;t copy. Select the link and copy it yourself.</Banner> : null}

      <div className={s.actions}>
        <a className={`${s.button} ${s.primary}`} href={`/u/${encodeURIComponent(upTo.shareSlug)}`}>
          Open share page
        </a>
        {onCreateAnother ? (
          <Button type="button" variant="secondary" onClick={onCreateAnother}>
            Post another
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
