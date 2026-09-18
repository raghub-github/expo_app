/**
 * Ambient typings for Node's built-in test runner used by `*.test.ts`.
 * Expo's app tsconfig does not pull `@types/node` by default; these modules
 * keep the IDE happy without changing RN/DOM globals.
 */
declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): void;
    match(value: string, regexp: RegExp, message?: string | Error): void;
    doesNotMatch(value: string, regexp: RegExp, message?: string | Error): void;
    throws(fn: () => unknown, error?: unknown, message?: string | Error): void;
    doesNotThrow(fn: () => unknown, message?: string | Error): void;
    rejects(block: Promise<unknown> | (() => Promise<unknown>), error?: unknown): Promise<void>;
    fail(message?: string | Error): never;
  };
  export default assert;
}

declare module "node:test" {
  type TestFn = (t?: unknown) => void | Promise<void>;
  export function describe(name: string, fn: TestFn): void;
  export function it(name: string, fn: TestFn): void;
  export function test(name: string, fn?: TestFn): void;
  export function before(fn: TestFn): void;
  export function after(fn: TestFn): void;
  export function beforeEach(fn: TestFn): void;
  export function afterEach(fn: TestFn): void;
  export function mock: unknown;
}
