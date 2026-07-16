import Image from "next/image";
import Link from "next/link";
import { HMG_LOGO_PATH } from "@/lib/branding/logo";

type HmgLogoProps = {
  showText?: boolean;
  compact?: boolean;
  href?: string | undefined;
  className?: string;
  hasLogo?: boolean;
};

export function HmgLogo({
  showText = true,
  compact = false,
  href = "/",
  className = "",
  hasLogo = false,
}: HmgLogoProps) {
  const content = (
    <div className={`flex items-center gap-3 ${className}`}>
      {hasLogo ? (
        <Image
          src={HMG_LOGO_PATH}
          alt="HMG"
          width={compact ? 28 : 36}
          height={compact ? 28 : 36}
          className="h-auto w-auto max-h-9 shrink-0"
          style={{
            width: "auto",
            height: "auto",
            maxHeight: compact ? 28 : 36,
          }}
          priority
        />
      ) : (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-surface-raised text-xs font-semibold text-foreground"
          aria-hidden="true"
        >
          HMG
        </span>
      )}
      {showText && !compact ? (
        <span className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
          HMG Graphics Server
        </span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex cursor-pointer rounded focus-visible:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}
