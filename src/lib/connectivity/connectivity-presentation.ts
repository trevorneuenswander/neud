import type { InternetConnectivityTone } from "@/lib/connectivity/internet-connectivity";

export function connectivityToneClassName(tone: InternetConnectivityTone): string {
  switch (tone) {
    case "success":
      return "text-success";
    case "destructive":
      return "text-destructive";
    default:
      return "text-muted opacity-70";
  }
}
