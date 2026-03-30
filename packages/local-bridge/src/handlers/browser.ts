/**
 * BROWSER handler — headless browser automation via Playwright.
 *
 * Provides visual verification, screenshot capture, element interaction,
 * and console error monitoring for web testing and automation.
 *
 * Expects message types:
 *   - BROWSER_LAUNCH    { headless?, timeout?, viewport?, allowedDomains? }
 *   - BROWSER_NAVIGATE  { url }
 *   - BROWSER_SCREENSHOT { fullPage?, selector? }
 *   - BROWSER_CLICK     { selector }
 *   - BROWSER_TYPE      { selector, text }
 *   - BROWSER_TEXT      { selector? }
 *   - BROWSER_WAIT      { selector, timeout? }
 *   - BROWSER_EVALUATE  { script }
 *   - BROWSER_TITLE     {}
 *   - BROWSER_ERRORS    {}
 *   - BROWSER_CLOSE     {}
 *
 * Emits response types:
 *   - BROWSER_RESULT    { success, data?, error?, ... }
 *
 * Security:
 *   - Only allows navigation to localhost URLs by default
 *   - Configurable domain whitelist via allowedDomains
 *   - Timeout enforcement (30s default)
 *   - Auto-close on idle (5 min timeout)
 *   - Only one browser session at a time
 */

import { WebSocket } from "ws";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";
import { getDefaultBrowser, closeDefaultBrowser, type BrowserOptions } from "../tools/browser.js";

/**
 * Browser message types
 */
const BROWSER_LAUNCH = "BROWSER_LAUNCH";
const BROWSER_NAVIGATE = "BROWSER_NAVIGATE";
const BROWSER_SCREENSHOT = "BROWSER_SCREENSHOT";
const BROWSER_CLICK = "BROWSER_CLICK";
const BROWSER_TYPE = "BROWSER_TYPE";
const BROWSER_TEXT = "BROWSER_TEXT";
const BROWSER_WAIT = "BROWSER_WAIT";
const BROWSER_EVALUATE = "BROWSER_EVALUATE";
const BROWSER_TITLE = "BROWSER_TITLE";
const BROWSER_ERRORS = "BROWSER_ERRORS";
const BROWSER_CLOSE = "BROWSER_CLOSE";

/**
 * Send a browser result response
 */
function sendResult(
  ws: WebSocket,
  id: string,
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
    [key: string]: unknown;
  }
): void {
  // Remove sender reference from context to avoid circular serialization
  const { sender, ...safeContext } = {} as any;

  ws.send(
    JSON.stringify({
      type: "BROWSER_RESULT",
      id,
      ...result,
    })
  );
}

/**
 * BROWSER_LAUNCH — launch headless browser
 */
export const handleBrowserLaunch: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const headless = (msg["headless"] as boolean | undefined) ?? true;
  const timeout = (msg["timeout"] as number | undefined) ?? 30000;
  const viewport = (msg["viewport"] as { width: number; height: number } | undefined) ?? {
    width: 1280,
    height: 720,
  };
  const allowedDomains = (msg["allowedDomains"] as string[] | undefined) ?? [
    "localhost",
    "127.0.0.1",
    "::1",
  ];

  try {
    const browser = getDefaultBrowser({
      headless,
      timeout,
      viewport,
      allowedDomains,
    });

    if (browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is already launched. Close the current session first.",
      });
      return;
    }

    await browser.launch();

    const sessionInfo = browser.getSessionInfo();

    sendResult(ws, msg.id, {
      success: true,
      data: sessionInfo,
    });
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_NAVIGATE — navigate to URL
 */
export const handleBrowserNavigate: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const url = msg["url"] as string | undefined;

  if (!url) {
    sendResult(ws, msg.id, {
      success: false,
      error: "Missing required field: url",
    });
    return;
  }

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.navigate(url);

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_SCREENSHOT — take screenshot
 */
export const handleBrowserScreenshot: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const fullPage = msg["fullPage"] as boolean | undefined;
  const selector = msg["selector"] as string | undefined;

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.screenshot({ fullPage, selector });

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_CLICK — click element
 */
export const handleBrowserClick: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const selector = msg["selector"] as string | undefined;

  if (!selector) {
    sendResult(ws, msg.id, {
      success: false,
      error: "Missing required field: selector",
    });
    return;
  }

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.click(selector);

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_TYPE — type text into element
 */
export const handleBrowserType: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const selector = msg["selector"] as string | undefined;
  const text = msg["text"] as string | undefined;

  if (!selector || text === undefined) {
    sendResult(ws, msg.id, {
      success: false,
      error: "Missing required fields: selector, text",
    });
    return;
  }

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.type(selector, text);

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_TEXT — get text content
 */
export const handleBrowserText: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const selector = msg["selector"] as string | undefined;

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.getText(selector);

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_WAIT — wait for element
 */
export const handleBrowserWait: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const selector = msg["selector"] as string | undefined;
  const timeout = msg["timeout"] as number | undefined;

  if (!selector) {
    sendResult(ws, msg.id, {
      success: false,
      error: "Missing required field: selector",
    });
    return;
  }

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.waitFor(selector, timeout);

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_EVALUATE — evaluate JavaScript
 */
export const handleBrowserEvaluate: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  const script = msg["script"] as string | undefined;

  if (!script) {
    sendResult(ws, msg.id, {
      success: false,
      error: "Missing required field: script",
    });
    return;
  }

  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const result = await browser.evaluate(script);

    sendResult(ws, msg.id, result);
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_TITLE — get page title
 */
export const handleBrowserTitle: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const title = await browser.getTitle();

    sendResult(ws, msg.id, {
      success: true,
      data: title,
    });
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_ERRORS — get console errors
 */
export const handleBrowserErrors: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched. Call BROWSER_LAUNCH first.",
      });
      return;
    }

    const errors = browser.getConsoleErrors();

    sendResult(ws, msg.id, {
      success: true,
      data: errors,
    });
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * BROWSER_CLOSE — close browser
 */
export const handleBrowserClose: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  _ctx: HandlerContext
): Promise<void> => {
  try {
    const browser = getDefaultBrowser();

    if (!browser.isLaunched()) {
      sendResult(ws, msg.id, {
        success: false,
        error: "Browser is not launched.",
      });
      return;
    }

    await browser.close();

    sendResult(ws, msg.id, {
      success: true,
      data: "Browser closed successfully",
    });
  } catch (error) {
    sendResult(ws, msg.id, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Router for all browser message types
 */
export const handleBrowser: TypedHandler = async (
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext
): Promise<void> => {
  const browserAction = msg["action"] as string | undefined;

  switch (browserAction) {
    case "launch":
      return handleBrowserLaunch(ws, clientId, msg, ctx);
    case "navigate":
      return handleBrowserNavigate(ws, clientId, msg, ctx);
    case "screenshot":
      return handleBrowserScreenshot(ws, clientId, msg, ctx);
    case "click":
      return handleBrowserClick(ws, clientId, msg, ctx);
    case "type":
      return handleBrowserType(ws, clientId, msg, ctx);
    case "text":
      return handleBrowserText(ws, clientId, msg, ctx);
    case "wait":
      return handleBrowserWait(ws, clientId, msg, ctx);
    case "evaluate":
      return handleBrowserEvaluate(ws, clientId, msg, ctx);
    case "title":
      return handleBrowserTitle(ws, clientId, msg, ctx);
    case "errors":
      return handleBrowserErrors(ws, clientId, msg, ctx);
    case "close":
      return handleBrowserClose(ws, clientId, msg, ctx);
    default:
      sendResult(ws, msg.id, {
        success: false,
        error: `Unknown browser action: ${browserAction}`,
      });
  }
};

// Export all individual handlers for registration
export const browserHandlers = {
  BROWSER_LAUNCH: handleBrowserLaunch,
  BROWSER_NAVIGATE: handleBrowserNavigate,
  BROWSER_SCREENSHOT: handleBrowserScreenshot,
  BROWSER_CLICK: handleBrowserClick,
  BROWSER_TYPE: handleBrowserType,
  BROWSER_TEXT: handleBrowserText,
  BROWSER_WAIT: handleBrowserWait,
  BROWSER_EVALUATE: handleBrowserEvaluate,
  BROWSER_TITLE: handleBrowserTitle,
  BROWSER_ERRORS: handleBrowserErrors,
  BROWSER_CLOSE: handleBrowserClose,
};
