export const OTP_BOXES = 6;

export function emptyOtpCells(length = OTP_BOXES): string[] {
  return Array.from({ length }, () => "");
}

export function otpCellsToCode(cells: string[]): string {
  return cells.join("");
}

export function otpCellsComplete(cells: string[]): boolean {
  return cells.length >= OTP_BOXES && cells.slice(0, OTP_BOXES).every((d) => /^\d$/.test(d));
}

export function otpCellsFromCode(code: string): string[] {
  const nums = String(code ?? "").replace(/\D/g, "").slice(0, OTP_BOXES);
  const cells = emptyOtpCells();
  for (let i = 0; i < nums.length; i++) cells[i] = nums[i];
  return cells;
}

export type OtpEditResult = { cells: string[]; index: number };

function clampIndex(index: number): number {
  if (index < 0) return 0;
  if (index >= OTP_BOXES) return OTP_BOXES - 1;
  return index;
}

export function applyOtpPaste(cells: string[], startIndex: number, raw: string): OtpEditResult {
  const nums = String(raw ?? "").replace(/\D/g, "");
  const next = cells.slice(0, OTP_BOXES);
  while (next.length < OTP_BOXES) next.push("");
  if (!nums) return { cells: next, index: clampIndex(startIndex) };

  if (nums.length >= OTP_BOXES) {
    for (let i = 0; i < OTP_BOXES; i++) next[i] = nums[i];
    return { cells: next, index: OTP_BOXES - 1 };
  }

  let pos = clampIndex(startIndex);
  for (let k = 0; k < nums.length && pos < OTP_BOXES; k += 1, pos += 1) {
    next[pos] = nums[k];
  }
  return { cells: next, index: pos >= OTP_BOXES ? OTP_BOXES - 1 : pos };
}

/** Backspace: clear focused digit in place; if already empty, clear previous and move there. */
export function applyOtpBackspace(cells: string[], index: number): OtpEditResult {
  const next = cells.slice(0, OTP_BOXES);
  while (next.length < OTP_BOXES) next.push("");
  const i = clampIndex(index);
  if (next[i]) {
    next[i] = "";
    return { cells: next, index: i };
  }
  if (i === 0) return { cells: next, index: 0 };
  next[i - 1] = "";
  return { cells: next, index: i - 1 };
}

/**
 * Single-box text change (type, replace, clear, or multi-digit paste/autofill).
 * Fast typing often lands several keys on the same box — overflow extras into the next boxes.
 */
export function applyOtpInput(cells: string[], index: number, text: string): OtpEditResult {
  const i = clampIndex(index);
  const next = cells.slice(0, OTP_BOXES);
  while (next.length < OTP_BOXES) next.push("");
  const cleaned = String(text ?? "").replace(/\D/g, "");

  if (cleaned.length === 0) {
    if (!next[i]) return { cells: next, index: i };
    next[i] = "";
    return { cells: next, index: i };
  }

  if (cleaned.length > 1) {
    let filledRun = 0;
    for (let k = i; k < OTP_BOXES && next[k]; k += 1) filledRun += 1;
    // After RN resets the field to the first digit, a late "60" must not wipe "630053".
    if (filledRun > cleaned.length && cleaned[0] === next[i]) {
      return { cells: next, index: Math.min(i + filledRun, OTP_BOXES - 1) };
    }
    if (cleaned.length >= OTP_BOXES) {
      return applyOtpPaste(next, 0, cleaned);
    }
    return applyOtpPaste(next, i, cleaned);
  }

  next[i] = cleaned;
  return { cells: next, index: i < OTP_BOXES - 1 ? i + 1 : i };
}
