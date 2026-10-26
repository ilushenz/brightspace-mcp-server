import { describe, expect, it, vi } from "vitest";
import { createSSOFlow } from "../../src/auth/sso-flow.js";
import { UHSSOFlow, isUHBrightspace } from "../../src/auth/uh-sso.js";
import { PurdueSSOFlow } from "../../src/auth/purdue-sso.js";
import type { AppConfig } from "../../src/types/index.js";

const UH_URL = "https://lamaku.hawaii.edu";

describe("University of Hawaiʻi sign-in entry point", () => {
  it("routes only Lāmakū's exact Brightspace host to its handler", () => {
    expect(isUHBrightspace(UH_URL)).toBe(true);
    expect(isUHBrightspace(`${UH_URL}/d2l/home`)).toBe(true);
    expect(isUHBrightspace(`${UH_URL}.example.org`)).toBe(false);
    expect(isUHBrightspace("https://purdue.brightspace.com")).toBe(false);
    expect(isUHBrightspace("not a url")).toBe(false);
    expect(createSSOFlow({ baseUrl: UH_URL } as AppConfig)).toBeInstanceOf(UHSSOFlow);
    expect(createSSOFlow({ baseUrl: "https://purdue.brightspace.com" } as AppConfig)).toBeInstanceOf(PurdueSSOFlow);
  });

  it("clicks the UH button on the login page, not the Guests Login form", async () => {
    const click = vi.fn(async () => {});
    const page = {
      url: () => `${UH_URL}/d2l/login?sessionExpired=0&target=%2fd2l%2fhome`,
      getByRole: vi.fn(() => ({ first: () => ({ isVisible: async () => true, click }) })),
    };
    await new UHSSOFlow({ baseUrl: UH_URL }).prepareLogin(page as never);
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: expect.any(RegExp) });
    const matcher = (page.getByRole.mock.calls[0] as unknown as [string, { name: RegExp }])[1].name;
    // Both spellings of the ʻokina match; the local-account "Guests Login" header and its "Log In" button do not.
    expect(matcher.test("University of Hawaiʻi Login")).toBe(true);
    expect(matcher.test("University of Hawai‘i Login")).toBe(true);
    expect(matcher.test("University of Hawaiʻi Guests Login")).toBe(false);
    expect(matcher.test("Log In")).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it("retries quietly when the button has not rendered yet instead of failing the sign-in", async () => {
    const click = vi.fn(async () => {});
    const page = {
      url: () => `${UH_URL}/d2l/login`,
      getByRole: vi.fn(() => ({ first: () => ({ isVisible: async () => false, click }) })),
    };
    await expect(new UHSSOFlow({ baseUrl: UH_URL }).prepareLogin(page as never)).resolves.toBeUndefined();
    expect(click).not.toHaveBeenCalled();
  });

  it("swallows a click that races the page's scripts so the next poll can retry it", async () => {
    const page = {
      url: () => `${UH_URL}/d2l/login`,
      getByRole: vi.fn(() => ({
        first: () => ({ isVisible: async () => true, click: async () => { throw new Error("detached"); } }),
      })),
    };
    await expect(new UHSSOFlow({ baseUrl: UH_URL }).prepareLogin(page as never)).resolves.toBeUndefined();
  });

  it("does not look for the button once past Lāmakū's login page", async () => {
    for (const url of ["https://authn.hawaii.edu/cas/login", `${UH_URL}/d2l/home`]) {
      const page = { url: () => url, getByRole: vi.fn() };
      await new UHSSOFlow({ baseUrl: UH_URL }).prepareLogin(page as never);
      expect(page.getByRole).not.toHaveBeenCalled();
    }
  });

  it("shares the default flow's credential check", () => {
    expect(new UHSSOFlow({ baseUrl: UH_URL, username: "student", password: "dummy" }).hasCredentials()).toBe(true);
    expect(new UHSSOFlow({ baseUrl: UH_URL, username: "student" }).hasCredentials()).toBe(false);
  });
});
