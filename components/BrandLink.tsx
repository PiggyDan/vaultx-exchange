import Link from "next/link";

export function VaultLogo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="none" stroke="#F0B90B" strokeWidth="2.5" />
      <rect x="12" y="12" width="8" height="8" transform="rotate(45 16 16)" fill="#F0B90B" />
    </svg>
  );
}

/** VaultX logo + wordmark, linking home. */
export default function BrandLink() {
  return (
    <Link
      href="/"
      aria-label="VaultX home"
      className="flex shrink-0 items-center gap-2 rounded-md transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F0B90B]"
    >
      <VaultLogo />
      <span className="text-lg font-bold tracking-tight text-[#F0B90B]">VaultX</span>
    </Link>
  );
}
