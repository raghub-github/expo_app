export function LoginHeroCharts() {
  const bars = [42, 68, 55, 90, 72, 84, 60, 96, 78, 88, 70, 92];
  const line = "M0 70 C 40 62, 70 88, 110 48 S 180 20, 230 36 S 310 80, 360 28 S 430 50, 480 18";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -right-10 top-10 w-[540px] opacity-80 blur-[7px]">
        <svg viewBox="0 0 480 160" className="h-[220px] w-full">
          <defs>
            <linearGradient id="loginArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#98BDFF" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#98BDFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L480 160 L0 160 Z`} fill="url(#loginArea)" />
          <path d={line} fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>

      <div className="absolute bottom-28 left-6 flex h-40 items-end gap-2 opacity-70 blur-[6px]">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-4 rounded-t-md bg-white/35"
            style={{ height: `${h}%`, background: i % 3 === 0 ? "rgba(152,189,255,0.7)" : "rgba(255,255,255,0.32)" }}
          />
        ))}
      </div>

      <div className="absolute right-10 bottom-16 h-36 w-36 opacity-60 blur-[8px]">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="#98BDFF"
            strokeWidth="6"
            strokeDasharray="55 88"
            strokeLinecap="round"
          />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="#F3797E"
            strokeWidth="6"
            strokeDasharray="22 88"
            strokeDashoffset="-55"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-[#4B49AC]/55 via-[#3A3894]/35 to-[#2C2A78]/80" />
    </div>
  );
}
