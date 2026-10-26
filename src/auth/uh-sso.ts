/** University of Hawaiʻi (Lāmakū) login entry point. Licensed under MIT; see LICENSE. */

import type { Page } from "playwright";
import { PurdueSSOFlow } from "./purdue-sso.js";
import type { RememberMfaResult } from "./microsoft-session.js";

const UH_HOST = "lamaku.hawaii.edu";

/**
 * Lāmakū's login page offers two sign-ins: this button for UH accounts (CAS,
 * then Duo), and a collapsed "Guests Login" form for Brightspace's own local
 * accounts. `.{1,2}` stands in for the ʻokina so either spelling matches.
 */
const UH_LOGIN_BUTTON = /University of Hawai.{1,2}i Login/i;

export function isUHBrightspace(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === UH_HOST;
  } catch {
    return false;
  }
}

/** Reuse the shared credential and MFA flow; only UH's first click differs. */
export class UHSSOFlow {
  private readonly common: PurdueSSOFlow;

  constructor(config: ConstructorParameters<typeof PurdueSSOFlow>[0]) {
    this.common = new PurdueSSOFlow(config);
  }

  hasCredentials(): boolean {
    return this.common.hasCredentials();
  }

  rememberMfaResult(): RememberMfaResult | undefined {
    return this.common.rememberMfaResult();
  }

  async prepareLogin(page: Page): Promise<void> {
    await this.startUHLogin(page);
  }

  async identifyAccount(page: Page): Promise<boolean> {
    return this.common.identifyAccount(page);
  }

  async login(page: Page): Promise<boolean> {
    await this.startUHLogin(page);
    return this.common.login(page);
  }

  /**
   * Click the UH button on Brightspace's login page. The sign-in poll calls
   * this again every second while the page is still `/d2l/login`, so a button
   * that has not rendered yet, or a click that lands before the page's scripts
   * are wired, is simply retried rather than treated as a failure.
   */
  private async startUHLogin(page: Page): Promise<void> {
    let current: URL;
    try {
      current = new URL(page.url());
    } catch {
      return;
    }
    if (current.hostname.toLowerCase() !== UH_HOST || !current.pathname.includes("/d2l/login")) return;

    const button = page.getByRole("button", { name: UH_LOGIN_BUTTON }).first();
    if (!await button.isVisible().catch(() => false)) return;
    await button.click().catch(() => {});
  }
}
