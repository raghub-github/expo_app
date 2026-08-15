import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isOnboardingTaskExpired,
  isOnboardingTaskVisible,
  toOnboardingTaskDto,
  type OnboardingTaskRow,
} from "./merchant-onboarding-tasks.js";

const NOW = new Date("2026-08-15T15:00:00.000Z");

function row(over: Partial<OnboardingTaskRow> = {}): OnboardingTaskRow {
  return {
    store_id: 1,
    task_key: "ONBOARDING_BENEFITS",
    status: "INCOMPLETE",
    completed_at: null,
    expires_at: "2026-08-20T23:59:59.000Z",
    created_at: "2026-08-05T10:00:00.000Z",
    updated_at: "2026-08-05T10:00:00.000Z",
    completed_by: null,
    metadata: { started_at: "2026-08-05T10:00:00.000Z" },
    ...over,
  };
}

describe("merchant onboarding task visibility", () => {
  it("hides the card when status is unknown / missing", () => {
    const dto = toOnboardingTaskDto(null, "ONBOARDING_BENEFITS", NOW);
    assert.equal(dto.status, "NOT_FOUND");
    assert.equal(dto.visible, false);
    assert.equal(isOnboardingTaskVisible(null, NOW), false);
  });

  it("shows an incomplete in-window task", () => {
    assert.equal(isOnboardingTaskVisible(row(), NOW), true);
    const dto = toOnboardingTaskDto(row(), "ONBOARDING_BENEFITS", NOW);
    assert.equal(dto.status, "INCOMPLETE");
    assert.equal(dto.visible, true);
    assert.equal(dto.isExpired, false);
  });

  it("hides a completed task forever, even after expiry", () => {
    const completed = row({
      status: "COMPLETED",
      completed_at: "2026-08-15T10:20:00.000Z",
      expires_at: "2026-08-14T23:59:59.000Z",
    });
    assert.equal(isOnboardingTaskExpired(completed.expires_at, NOW), true);
    assert.equal(isOnboardingTaskVisible(completed, NOW), false);
    const dto = toOnboardingTaskDto(completed, "ONBOARDING_BENEFITS", NOW);
    assert.equal(dto.status, "COMPLETED");
    assert.equal(dto.completedAt, "2026-08-15T10:20:00.000Z");
    assert.equal(dto.isExpired, true);
    assert.equal(dto.visible, false);
  });

  it("hides an incomplete expired task without changing completion status", () => {
    const expiredIncomplete = row({
      status: "INCOMPLETE",
      completed_at: null,
      expires_at: "2026-08-14T23:59:59.000Z",
    });
    const dto = toOnboardingTaskDto(expiredIncomplete, "ONBOARDING_BENEFITS", NOW);
    assert.equal(dto.status, "INCOMPLETE");
    assert.equal(dto.isExpired, true);
    assert.equal(dto.visible, false);
  });

  it("never treats missing expiry as expired", () => {
    assert.equal(isOnboardingTaskExpired(null, NOW), false);
    assert.equal(isOnboardingTaskVisible(row({ expires_at: null }), NOW), true);
  });
});
