/** GatiMitra partner auth brand palette (login / register shell). */
export const GM = {
  sidebar: '#006B4F',
  gati: '#00A88F',
  gatiDark: '#009078',
  gatiDarker: '#008670',
  mitra: '#F5A623',
  white: '#FFFFFF',
  secondary: '#E5F5F0',
  wave: '#2B8C76',
} as const;

export const GM_POPPINS = 'font-[family-name:var(--font-auth-poppins)]';

export const GM_BTN =
  'bg-[#00A88F] hover:bg-[#009078] active:bg-[#008670] focus-visible:ring-[#00A88F]/40';

export const GM_LINK = 'text-[#00A88F] hover:text-[#009078]';

export const GM_FOCUS_RING = 'focus:border-[#00A88F] focus:ring-[#00A88F]/30';

export const GM_FOCUS_RING_SOFT = 'focus:ring-[#00A88F]/25 focus:border-[#00A88F]';

type GatiMitraWordProps = {
  className?: string;
};

/** Brand wordmark — Poppins Bold, Gati green + Mitra orange. */
export function GatiMitraWord({ className = '' }: GatiMitraWordProps) {
  return (
    <span className={`${GM_POPPINS} font-bold ${className}`}>
      <span style={{ color: GM.gati }}>Gati</span>
      <span style={{ color: GM.mitra }}>Mitra</span>
    </span>
  );
}
