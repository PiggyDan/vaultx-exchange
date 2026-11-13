import Image from "next/image";

interface CoinIconProps {
  base: string;
  size?: number;
  className?: string;
}

/** Official coin logo (public/coins, CC0 icon set). Decorative: always rendered next to the ticker text. */
export default function CoinIcon({ base, size = 16, className = "" }: CoinIconProps) {
  return (
    <Image
      src={`/coins/${base.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 ${className}`}
    />
  );
}
