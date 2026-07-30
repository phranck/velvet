import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  ONBOARDING_SESSION_STORAGE_KEY,
  clearOnboardingDraft,
  loadOnboardingDraft,
  persistOnboardingDraft,
  type OnboardingSessionStorage,
} from "../src/onboarding/onboarding-session.js";
import { createOnboardingDraft } from "../src/onboarding/state.js";

class MemoryStorage implements OnboardingSessionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("preserves incomplete onboarding input for an authentication return", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.customDomain = "status.example.com";
  draft.services[0].name = "Website";
  draft.services[0].headers.push({
    id: "header",
    name: "Authorization",
    secret: "API_HEALTH_TOKEN",
  });
  const storage = new MemoryStorage();

  assert.equal(persistOnboardingDraft(draft, storage), true);
  assert.deepEqual(loadOnboardingDraft(storage), draft);
});

test("restores older setup sessions without a custom-domain field", () => {
  const draft = createOnboardingDraft();
  const legacyDraft: Partial<ReturnType<typeof createOnboardingDraft>> =
    structuredClone(draft);
  delete legacyDraft.customDomain;
  const storage = new MemoryStorage();
  storage.setItem(
    ONBOARDING_SESSION_STORAGE_KEY,
    JSON.stringify({ version: 1, draft: legacyDraft }),
  );

  assert.equal(loadOnboardingDraft(storage)?.customDomain, "");
});

test("discards malformed onboarding storage and clears completed setup data", () => {
  const storage = new MemoryStorage();
  storage.setItem(ONBOARDING_SESSION_STORAGE_KEY, '{"version":1,"draft":[]}');

  assert.equal(loadOnboardingDraft(storage), null);
  assert.equal(storage.getItem(ONBOARDING_SESSION_STORAGE_KEY), null);

  persistOnboardingDraft(createOnboardingDraft(), storage);
  clearOnboardingDraft(storage);
  assert.equal(storage.getItem(ONBOARDING_SESSION_STORAGE_KEY), null);
});

test("starts fresh when browser session storage is unavailable", () => {
  const storage: OnboardingSessionStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(loadOnboardingDraft(storage), null);
  assert.equal(persistOnboardingDraft(createOnboardingDraft(), storage), false);
  assert.doesNotThrow(() => clearOnboardingDraft(storage));
});
