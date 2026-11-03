"use client";

import { useEffect } from "react";
import { markAlertSeen } from "@/app/(main)/scans/actions";

/**
 * Marks a product change alert as seen once its page has been shown. A Server
 * Action (POST) after the page loads, so opening the link changes nothing by
 * itself (no state changes on GET).
 */
export function MarkSeen({ alertId }: { alertId: string }) {
  useEffect(() => {
    markAlertSeen(alertId).catch(() => {});
  }, [alertId]);
  return null;
}
