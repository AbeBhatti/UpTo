/**
 * Shared Lab 5 assertions.
 *
 * `rejects()` checks the error message, not just that parsing failed, so a
 * test cannot pass because the input failed for some unrelated reason.
 */
import assert from "node:assert/strict";

type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Array<{ message: string; path: PropertyKey[] }> } };

export interface Parser<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

function describeIssues(issues: Array<{ message: string; path: PropertyKey[] }>): string {
  return issues.map((i) => `  ${i.path.map(String).join(".") || "(root)"}: ${i.message}`).join("\n");
}

/** Asserts the input parses and returns the parsed (possibly transformed) value. */
export function accepts<T>(schema: Parser<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    assert.fail(`expected input to be accepted, got:\n${describeIssues(result.error.issues)}`);
  }
  return result.data;
}

/**
 * Asserts the input is rejected with an issue whose message equals `expected`
 * (a string) or matches it (a RegExp).
 */
export function rejects(schema: Parser<unknown>, input: unknown, expected: string | RegExp): void {
  const result = schema.safeParse(input);
  if (result.success) {
    assert.fail(`expected input to be rejected with ${String(expected)}, but it was accepted`);
  }
  const matched = result.error.issues.some((i) =>
    typeof expected === "string" ? i.message === expected : expected.test(i.message),
  );
  if (!matched) {
    assert.fail(
      `rejected, but not with ${String(expected)}. Issues were:\n${describeIssues(result.error.issues)}`,
    );
  }
}
