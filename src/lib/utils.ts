import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nowUnix(): number {
  return Date.now();
}

/**
 * Human-friendly relative time. `unixSec` and `now` are interpreted in the same
 * unit (seconds); beyond a week it falls back to an absolute "02 Jun" date.
 */
export function relativeTime(unixSec: number, now: number): string {
  const diff = now - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diff < 172800) return "yesterday";
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(unixSec * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (groups[k] ??= []).push(item);
  }
  return groups;
}
