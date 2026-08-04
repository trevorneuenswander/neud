"use client";

import type { BroadArrowDisplayRendererProps } from "@/lib/displays/broad-arrow/renderer-registry";
import styles from "./BroadArrowTicker.module.css";

const SLOT_COUNT = 3;

export function BroadArrowTicker({ data, enabled = true }: BroadArrowDisplayRendererProps) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, index) => data.ticker.next[index] ?? null);

  if (!enabled) {
    return (
      <div className={styles.tickerRoot}>
        <div className={styles.disconnected}>Display Off</div>
      </div>
    );
  }

  return (
    <div className={styles.tickerRoot}>
      <div className={styles.safe}>
        <div className={styles.bar}>
          <span className={styles.label}>
            <span>UP</span>
            <span>NEXT</span>
          </span>
          <div className={styles.pillRow}>
            {slots.map((slot, index) => {
              if (!slot) {
                return (
                  <span
                    key={`empty-${index}`}
                    className={`${styles.pill} ${styles.pillHidden}`}
                    aria-hidden="true"
                  />
                );
              }

              return (
                <span key={`${slot.lot}-${index}`} className={styles.pill}>
                  <span className={styles.lot}>{slot.lot || "Lot —"}</span>
                  <span className={styles.titleScroll} title={slot.title || "—"}>
                    <span className={styles.titleInner}>{slot.title || "—"}</span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
