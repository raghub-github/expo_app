"use client";

export function GatiSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <div
        className="relative flex h-28 w-28 items-center justify-center"
        aria-label="Loading"
      >
        {/* Outer animated ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#D8F2ED] via-transparent to-[#EAF4F7]" />
        <div className="absolute inset-[3px] rounded-full border-[3px] border-[#D6E7E5]" />
        <div className="absolute inset-[4px] rounded-full border-[3px] border-transparent border-t-[#121212] border-r-[#0D5C4A] animate-spin [animation-duration:1.1s]" />

        {/* Inner circle with GM mark */}
        <div className="relative flex h-18 w-18 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(18,18,18,0.12)] ring-1 ring-[#D6E7E5]">
          <span className="text-3xl font-semibold tracking-tight text-[#121212]">
            GM
          </span>
        </div>
      </div>
    </div>
  );
}

