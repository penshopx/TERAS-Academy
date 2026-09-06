import type { Page } from "playwright";

export type TestIdentityState =
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string };

const identityEventName = "teras:test-identity-change";
const initialIdentityKey = "__TERAS_TEST_IDENTITY__";

export class BrowserTestIdentityHarness {
  private state: TestIdentityState;

  private constructor(
    private readonly page: Page,
    initialUserId: string,
  ) {
    this.state = { status: "signed-in", userId: initialUserId };
  }

  static async createPage(
    owner: { newPage(): Promise<Page> },
    initialUserId: string,
  ): Promise<{ page: Page; identity: BrowserTestIdentityHarness }> {
    const page = await owner.newPage();
    const identity = await BrowserTestIdentityHarness.install(page, initialUserId);
    return { page, identity };
  }

  private static async install(page: Page, initialUserId: string) {
    const harness = new BrowserTestIdentityHarness(page, initialUserId);
    await page.addInitScript(
      ({ key, state }) => {
        Object.defineProperty(globalThis, key, {
          configurable: true,
          writable: true,
          value: state,
        });
      },
      { key: initialIdentityKey, state: harness.state },
    );
    return harness;
  }

  currentState(): TestIdentityState {
    return this.state;
  }

  async signOut() {
    await this.transition({ status: "signed-out" });
  }

  async signIn(userId: string) {
    await this.transition({ status: "signed-in", userId });
  }

  async switchAccount(userId: string) {
    await this.signOut();
    await this.signIn(userId);
  }

  private async transition(state: TestIdentityState) {
    await this.page.evaluate(
      ({ eventName, key, nextState }) => {
        const browserWindow = globalThis as typeof globalThis & {
          dispatchEvent(event: Event): boolean;
        };
        Object.defineProperty(globalThis, key, {
          configurable: true,
          writable: true,
          value: nextState,
        });
        browserWindow.dispatchEvent(new CustomEvent(eventName, { detail: nextState }));
      },
      { eventName: identityEventName, key: initialIdentityKey, nextState: state },
    );
    this.state = state;
  }
}