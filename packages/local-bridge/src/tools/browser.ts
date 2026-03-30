/**
 * BrowserTool — headless browser automation using Playwright.
 *
 * Provides visual verification, screenshot capture, element interaction,
 * and console error monitoring for web testing and automation.
 *
 * Security:
 *   - Only allows localhost URLs by default
 *   - Configurable domain whitelist
 *   - Timeout enforcement (30s default)
 *   - Auto-close on idle (5 min timeout)
 *   - Only one browser session at a time
 */

import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';

/**
 * Browser configuration options
 */
export interface BrowserOptions {
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Allowed domains for navigation (default: ['localhost', '127.0.0.1', '::1']) */
  allowedDomains?: string[];
  /** Idle timeout before auto-closing browser in milliseconds (default: 300000) */
  idleTimeout?: number;
}

/**
 * Result of a browser action
 */
export interface BrowserActionResult {
  success: boolean;
  data?: string | Buffer | unknown;
  error?: string;
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  /** Capture full page (default: false) */
  fullPage?: boolean;
  /** CSS selector for specific element screenshot */
  selector?: string;
}

/**
 * Navigation result with page info
 */
export interface NavigationResult extends BrowserActionResult {
  title?: string;
  url?: string;
}

/**
 * Console error entry
 */
export interface ConsoleError {
  message: string;
  type: string;
  timestamp: Date;
}

/**
 * Browser session state
 */
interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  consoleErrors: ConsoleError[];
  lastActivity: Date;
  idleTimer?: ReturnType<typeof setTimeout>;
}

/**
 * BrowserTool — headless browser automation
 *
 * @example
 * ```typescript
 * const browser = new BrowserTool();
 * await browser.launch();
 * await browser.navigate('http://localhost:3000');
 * const screenshot = await browser.screenshot();
 * await browser.close();
 * ```
 */
export class BrowserTool {
  private session: BrowserSession | null = null;
  private options: Required<BrowserOptions>;
  private launchTimer?: ReturnType<typeof setTimeout>;

  constructor(options: BrowserOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      viewport: options.viewport ?? { width: 1280, height: 720 },
      allowedDomains: options.allowedDomains ?? ['localhost', '127.0.0.1', '::1'],
      idleTimeout: options.idleTimeout ?? 300000, // 5 minutes
    };
  }

  /**
   * Check if browser is currently launched
   */
  isLaunched(): boolean {
    return this.session !== null;
  }

  /**
   * Launch a new browser session
   * @throws Error if browser is already launched
   */
  async launch(): Promise<void> {
    if (this.session) {
      throw new Error('Browser is already launched. Close the current session first.');
    }

    try {
      const browser = await chromium.launch({
        headless: this.options.headless,
      });

      const context = await browser.newContext({
        viewport: this.options.viewport,
      });

      const page = await context.newPage();
      const consoleErrors: ConsoleError[] = [];

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push({
            message: msg.text(),
            type: msg.type(),
            timestamp: new Date(),
          });
        }
      });

      // Capture page errors
      page.on('pageerror', (error) => {
        consoleErrors.push({
          message: error.message,
          type: 'pageerror',
          timestamp: new Date(),
        });
      });

      const session: BrowserSession = {
        browser,
        context,
        page,
        consoleErrors,
        lastActivity: new Date(),
      };

      this.session = session;
      this.resetIdleTimer();
    } catch (error) {
      throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Ensure browser is launched, throw if not
   */
  private ensureLaunched(): BrowserSession {
    if (!this.session) {
      throw new Error('Browser is not launched. Call launch() first.');
    }
    this.resetIdleTimer();
    return this.session;
  }

  /**
   * Validate URL against allowed domains
   */
  private validateUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      // Check if hostname is in allowed domains or is an IP address
      const isAllowed = this.options.allowedDomains.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });

      if (!isAllowed) {
        throw new Error(
          `URL "${url}" is not in the allowed domains. ` +
            `Allowed: ${this.options.allowedDomains.join(', ')}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('allowed domains')) {
        throw error;
      }
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<NavigationResult> {
    try {
      const session = this.ensureLaunched();

      this.validateUrl(url);

      try {
        await session.page.goto(url, {
          timeout: this.options.timeout,
          waitUntil: 'networkidle',
        });

        const title = await session.page.title();
        const finalUrl = session.page.url();

        return {
          success: true,
          title,
          url: finalUrl,
        };
      } catch (error) {
        return {
          success: false,
          error: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<BrowserActionResult> {
    try {
      const session = this.ensureLaunched();

      try {
        let screenshotBuffer: Buffer;

        if (options.selector) {
          // Screenshot specific element
          const element = await session.page.locator(options.selector);
          screenshotBuffer = await element.screenshot({
            timeout: this.options.timeout,
          });
        } else {
          // Screenshot page or full page
          screenshotBuffer = await session.page.screenshot({
            fullPage: options.fullPage ?? false,
            timeout: this.options.timeout,
          });
        }

        // Convert to base64 for JSON transmission
        const base64 = screenshotBuffer.toString('base64');

        return {
          success: true,
          data: `data:image/png;base64,${base64}`,
        };
      } catch (error) {
        return {
          success: false,
          error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get text content from page or specific element
   */
  async getText(selector?: string): Promise<BrowserActionResult> {
    try {
      const session = this.ensureLaunched();

      try {
        let text: string;

        if (selector) {
          const element = await session.page.locator(selector);
          text = await element.textContent({ timeout: this.options.timeout }) || '';
        } else {
          text = await session.page.evaluate(() => document.body.innerText);
        }

        return {
          success: true,
          data: text.trim(),
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to get text: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<BrowserActionResult> {
    try {
      const session = this.ensureLaunched();

      try {
        await session.page.click(selector, {
          timeout: this.options.timeout,
        });

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Type text into an input element
   */
  async type(selector: string, text: string): Promise<BrowserActionResult> {
    try {
      const session = this.ensureLaunched();

      try {
        await session.page.fill(selector, text, {
          timeout: this.options.timeout,
        });

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get accumulated console errors
   */
  getConsoleErrors(): ConsoleError[] {
    const session = this.ensureLaunched();
    return session.consoleErrors;
  }

  /**
   * Clear console errors
   */
  clearConsoleErrors(): void {
    const session = this.ensureLaunched();
    session.consoleErrors = [];
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    const session = this.ensureLaunched();
    return await session.page.title();
  }

  /**
   * Wait for an element to appear
   */
  async waitFor(selector: string, timeout?: number): Promise<BrowserActionResult> {
    try {
      const session = this.ensureLaunched();

      try {
        await session.page.waitForSelector(selector, {
          timeout: timeout ?? this.options.timeout,
        });

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Wait failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate(script: string): Promise<BrowserActionResult> {
    try {
      const session = this.ensureLaunched();

      try {
        const result = await session.page.evaluate(script);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          error: `Evaluate failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reset the idle timer
   */
  private resetIdleTimer(): void {
    if (this.launchTimer) {
      clearTimeout(this.launchTimer);
    }

    this.launchTimer = setTimeout(async () => {
      if (this.session) {
        console.info('[browser] Idle timeout reached, closing browser');
        await this.close();
      }
    }, this.options.idleTimeout);

    if (this.session) {
      this.session.lastActivity = new Date();
    }
  }

  /**
   * Close the browser session
   */
  async close(): Promise<void> {
    if (!this.session) {
      return;
    }

    if (this.launchTimer) {
      clearTimeout(this.launchTimer);
      this.launchTimer = undefined;
    }

    try {
      await this.session.page.close();
      await this.session.context.close();
      await this.session.browser.close();
    } catch (error) {
      console.error('[browser] Error closing browser:', error);
    } finally {
      this.session = null;
    }
  }

  /**
   * Get current session info
   */
  getSessionInfo(): { launched: boolean; lastActivity?: Date; errorCount: number } {
    if (!this.session) {
      return { launched: false, errorCount: 0 };
    }

    return {
      launched: true,
      lastActivity: this.session.lastActivity,
      errorCount: this.session.consoleErrors.length,
    };
  }
}

/**
 * Default singleton instance for the bridge
 */
let defaultBrowser: BrowserTool | null = null;

/**
 * Get or create the default browser instance
 */
export function getDefaultBrowser(options?: BrowserOptions): BrowserTool {
  if (!defaultBrowser) {
    defaultBrowser = new BrowserTool(options);
  }
  return defaultBrowser;
}

/**
 * Close the default browser instance
 */
export async function closeDefaultBrowser(): Promise<void> {
  if (defaultBrowser) {
    await defaultBrowser.close();
    defaultBrowser = null;
  }
}
