"use client";

export function GatiSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50">
      <div
        className="relative flex h-28 w-28 items-center justify-center"
        aria-label="Loading"
      >
        {/* Outer animated ring */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-100 via-transparent to-indigo-50" />
        <div className="absolute inset-[3px] rounded-full border-[3px] border-indigo-100/70" />
        <div className="absolute inset-[4px] rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-indigo-500 animate-spin [animation-duration:1.1s]" />

        {/* Inner circle with GM mark */}
        <div className="relative flex h-18 w-18 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(79,70,229,0.32)]">
          <span className="text-3xl font-semibold tracking-tight text-indigo-600">
            GM
          </span>
        </div>
      </div>
    </div>
  );
}

