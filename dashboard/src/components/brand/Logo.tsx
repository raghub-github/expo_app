"use client";

import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  variant?: "full" | "icon-only";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  href?: string;
}

/**
 * Logo Component
 * 
 * @param variant - "full" uses logo.png (with text), "icon-only" uses onlylogo.png
 * @param size - Size variant: sm, md, lg, xl
 * @param className - Additional CSS classes
 * @param showText - Whether to show text alongside icon (only for icon-only variant)
 * @param href - Optional link URL (wraps logo in Link if provided)
 */
export function Logo({
  variant = "full",
  size = "md",
  className = "",
  showText = false,
  href,
}: LogoProps) {
  // Size mappings
  const sizeMap = {
    sm: { width: 120, height: 40, iconWidth: 32, iconHeight: 32 },
    md: { width: 160, height: 53, iconWidth: 40, iconHeight: 40 },
    lg: { width: 200, height: 67, iconWidth: 48, iconHeight: 48 },
    xl: { width: 240, height: 80, iconWidth: 100, iconHeight: 100 },
  };

  const dimensions = sizeMap[size];
  const logoPath = variant === "full" ? "/logo.png" : "/onlylogo.png";
  const altText = variant === "full" ? "GatiMitra Logo" : "GatiMitra Icon";

  const logoContent = (
    <div
      className={`flex items-center ${showText && variant === "icon-only" ? "gap-3" : ""} ${className}`}
    >
      <Image
        src={logoPath}
        alt={altText}
        width={variant === "full" ? dimensions.width : dimensions.iconWidth}
        height={variant === "full" ? dimensions.height : dimensions.iconHeight}
        className={`object-contain ${variant === "icon-only" ? "flex-shrink-0" : ""}`}
        priority
        quality={95}
      />
      {showText && variant === "icon-only" && (
        <span className="text-xl font-bold text-white whitespace-nowrap">
          GatiMitra
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {logoContent}
      </Link>
    );
  }

  return logoContent;
}
