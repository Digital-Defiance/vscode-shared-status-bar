/**
 * Shared Status Bar for MCP ACS Extensions
 *
 * This module implements a singleton pattern for managing a unified status bar item
 * across multiple MCP ACS VSCode extensions. The singleton pattern ensures that only
 * one status bar item exists regardless of how many extensions are active.
 *
 * Key Design Principles:
 * - Singleton Pattern: Only one status bar item exists at any time
 * - Defensive Programming: Explicit checks prevent duplicate status bar items
 * - Idempotent Operations: Registration/unregistration can be called multiple times safely
 * - Comprehensive Logging: All lifecycle events are logged for debugging
 *
 * @module vscode-shared-status-bar
 */

import * as vscode from "vscode";

/**
 * Singleton status bar item instance.
 * This is the single shared status bar item displayed in VSCode.
 * Undefined when no extensions are registered.
 */
let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Set of active extension IDs.
 * Using a Set ensures automatic deduplication of extension IDs,
 * making registration operations naturally idempotent.
 */
const activeExtensions = new Set<string>();

/**
 * Disposable for the show menu command.
 * Created when the first extension registers, disposed when the last unregisters.
 */
let commandDisposable: vscode.Disposable | undefined;

/**
 * Disposable for the register extension command.
 * Created when this extension becomes the owner of the status bar.
 */
let registerCommandDisposable: vscode.Disposable | undefined;

/**
 * Disposable for the unregister extension command.
 * Created when this extension becomes the owner of the status bar.
 */
let unregisterCommandDisposable: vscode.Disposable | undefined;

/**
 * Disposable for the diagnostic command.
 * Created when output channel is set, disposed during cleanup.
 */
let diagnosticCommandDisposable: vscode.Disposable | undefined;

/**
 * Output channel for logging.
 * Optional - if not set, logs only go to console.
 */
let outputChannel: vscode.OutputChannel | undefined;

/**
 * Last error that occurred.
 * Used for diagnostic reporting and troubleshooting.
 */
let lastError: string | null = null;

/**
 * Logs an informational message with timestamp.
 *
 * Messages are logged to both the output channel (if configured) and the console.
 * Each message is prefixed with an ISO timestamp for debugging.
 *
 * @param message - The message to log
 * @internal
 */
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  if (outputChannel) {
    outputChannel.appendLine(logMessage);
  }
  console.log(logMessage);
}

/**
 * Logs an error message with full details including stack trace.
 *
 * Errors are logged to both the output channel (if configured) and the console.
 * The error is also stored in `lastError` for diagnostic reporting.
 *
 * @param message - Descriptive message about the error context
 * @param error - The error object or value that was thrown
 * @internal
 */
function logError(message: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const logMessage = `[${timestamp}] ERROR: ${message}: ${errorMessage}${
    errorStack ? "\n" + errorStack : ""
  }`;

  lastError = `${message}: ${errorMessage}`;

  if (outputChannel) {
    outputChannel.appendLine(logMessage);
  }

  // Log to console in the format expected by tests
  console.error(message, error);
}

/**
 * Sets the output channel for logging.
 *
 * Once configured, all log messages will be written to this output channel
 * in addition to the console. This also registers the diagnostic command
 * (mcp-acs.diagnostics) for troubleshooting.
 *
 * This function is idempotent - calling it multiple times will only use
 * the first output channel provided.
 *
 * @param channel - VSCode output channel to use for logging
 *
 * @example
 * ```typescript
 * const outputChannel = vscode.window.createOutputChannel("MCP ACS");
 * setOutputChannel(outputChannel);
 * ```
 */
export function setOutputChannel(channel: vscode.OutputChannel): void {
  // Only set output channel once (first extension wins)
  if (outputChannel) {
    log("Output channel already configured, ignoring duplicate call");
    return;
  }

  outputChannel = channel;
  log("Output channel configured for shared status bar");

  // Register diagnostic command when output channel is set
  if (!diagnosticCommandDisposable) {
    try {
      diagnosticCommandDisposable = vscode.commands.registerCommand(
        "mcp-acs.diagnostics",
        showDiagnostics
      );
      log("Diagnostic command registered: mcp-acs.diagnostics");
    } catch (error) {
      logError("Failed to register mcp-acs.diagnostics command:", error);
    }
  }
}

/**
 * Registers an extension with the shared status bar.
 *
 * This function is idempotent - calling it multiple times with the same extension ID
 * has no additional effect. The Set data structure automatically handles deduplication.
 *
 * When the first extension registers:
 * - The show menu command (mcp-acs.showMenu) is registered
 * - The status bar item is created and shown
 *
 * When subsequent extensions register:
 * - The extension count is incremented
 * - The status bar tooltip is updated to reflect the new count
 * - The existing status bar item is reused (singleton pattern)
 *
 * @param extensionId - Unique identifier for the extension (e.g., "mcp-debugger")
 *
 * @example
 * ```typescript
 * export async function activate(context: vscode.ExtensionContext) {
 *   await registerExtension("my-extension-id");
 *   context.subscriptions.push({
 *     dispose: () => unregisterExtension("my-extension-id")
 *   });
 * }
 * ```
 */
export async function registerExtension(extensionId: string): Promise<void> {
  // Try to register with an existing owner first
  try {
    // Attempt to execute the registration command provided by the owner
    // If this succeeds, another extension is already managing the status bar
    await vscode.commands.executeCommand(
      "mcp-acs.registerExtension",
      extensionId
    );
    log(`Registered ${extensionId} with existing status bar owner`);
    return;
  } catch (error) {
    // Command not found or failed - we will become the owner
    log(
      `No existing status bar owner found (or command failed), becoming owner for ${extensionId}`
    );
  }

  // We are the owner (or the first one)
  internalRegister(extensionId);

  // Register the registration command so others can register with us
  if (!registerCommandDisposable) {
    try {
      registerCommandDisposable = vscode.commands.registerCommand(
        "mcp-acs.registerExtension",
        (id: string) => {
          log(`Received registration request from: ${id}`);
          internalRegister(id);
        }
      );
      log("Command registered: mcp-acs.registerExtension");
    } catch (error) {
      logError("Failed to register mcp-acs.registerExtension command:", error);
      // If we failed to register, maybe someone else just did?
      // Try to register with them again?
      try {
        await vscode.commands.executeCommand(
          "mcp-acs.registerExtension",
          extensionId
        );
        return;
      } catch (e) {
        // Ignore
      }
    }
  }

  // Register the unregistration command so others can unregister with us
  if (!unregisterCommandDisposable) {
    try {
      unregisterCommandDisposable = vscode.commands.registerCommand(
        "mcp-acs.unregisterExtension",
        (id: string) => {
          log(`Received unregistration request from: ${id}`);
          internalUnregister(id);
        }
      );
      log("Command registered: mcp-acs.unregisterExtension");
    } catch (error) {
      logError(
        "Failed to register mcp-acs.unregisterExtension command:",
        error
      );
    }
  }
}

function internalRegister(extensionId: string): void {
  const wasEmpty = activeExtensions.size === 0;
  const previousSize = activeExtensions.size;

  // Add to Set - automatically handles deduplication (idempotent operation)
  activeExtensions.add(extensionId);

  // Check if this was a new registration or a duplicate
  const countChanged = activeExtensions.size !== previousSize;

  if (countChanged) {
    log(
      `Extension registered: ${extensionId} (total: ${activeExtensions.size})`
    );
  } else {
    // Duplicate registration - log but don't update status bar
    log(
      `Extension already registered: ${extensionId} (duplicate registration ignored)`
    );
  }

  // Register command when first extension registers
  if (wasEmpty && activeExtensions.size > 0) {
    try {
      commandDisposable = vscode.commands.registerCommand(
        "mcp-acs.showMenu",
        showMenuCommand
      );
      log("Command registered: mcp-acs.showMenu");
      // Add command to status bar if it already exists
      if (statusBarItem) {
        statusBarItem.command = "mcp-acs.showMenu";
      }
    } catch (error) {
      logError("Failed to register mcp-acs.showMenu command:", error);
    }
  }

  // Only update status bar if count actually changed
  if (countChanged) {
    updateStatusBar();
  }
}

/**
 * Unregisters an extension from the shared status bar.
 *
 * This function is safe to call even if the extension was never registered or
 * has already been unregistered. It will log a message but not throw an error.
 *
 * When the last extension unregisters:
 * - The show menu command is disposed
 * - The status bar item is hidden (but not disposed, maintaining singleton)
 *
 * @param extensionId - Unique identifier for the extension to unregister
 *
 * @example
 * ```typescript
 * export function deactivate() {
 *   unregisterExtension("my-extension-id");
 * }
 * ```
 */
export async function unregisterExtension(extensionId: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      "mcp-acs.unregisterExtension",
      extensionId
    );
    log(`Unregistered ${extensionId} via owner`);
  } catch (error) {
    // If command fails (e.g. we are owner, or owner died), try local unregister
    internalUnregister(extensionId);
  }
}

function internalUnregister(extensionId: string): void {
  // Defensive check: only proceed if the extension was actually registered
  const wasRegistered = activeExtensions.has(extensionId);
  if (!wasRegistered) {
    // Safe unregistration: log but don't error on non-existent extension
    log(`Extension not registered, ignoring unregister: ${extensionId}`);
    return;
  }

  // Remove the extension from the Set
  activeExtensions.delete(extensionId);
  log(
    `Extension unregistered: ${extensionId} (remaining: ${activeExtensions.size})`
  );

  // Dispose command when last extension unregisters
  if (activeExtensions.size === 0 && commandDisposable) {
    try {
      commandDisposable.dispose();
      commandDisposable = undefined;
      log("Command disposed: mcp-acs.showMenu");
    } catch (error) {
      logError("Failed to dispose mcp-acs.showMenu command:", error);
    }
  }

  // Dispose register command when last extension unregisters
  if (activeExtensions.size === 0 && registerCommandDisposable) {
    try {
      registerCommandDisposable.dispose();
      registerCommandDisposable = undefined;
      log("Command disposed: mcp-acs.registerExtension");
    } catch (error) {
      logError("Failed to dispose mcp-acs.registerExtension command:", error);
    }
  }

  // Dispose unregister command when last extension unregisters
  if (activeExtensions.size === 0 && unregisterCommandDisposable) {
    try {
      unregisterCommandDisposable.dispose();
      unregisterCommandDisposable = undefined;
      log("Command disposed: mcp-acs.unregisterExtension");
    } catch (error) {
      logError("Failed to dispose mcp-acs.unregisterExtension command:", error);
    }
  }

  // Update status bar visibility based on new count
  updateStatusBar();
}

/**
 * Shows the quick pick menu with all registered extensions.
 *
 * This is the command handler for mcp-acs.showMenu, which is invoked when
 * the user clicks on the status bar item.
 *
 * @internal
 */
async function showMenuCommand(): Promise<void> {
  try {
    log(`Showing menu with ${activeExtensions.size} extensions`);
    const extensionIds = Array.from(activeExtensions);
    await vscode.window.showQuickPick(extensionIds, {
      placeHolder: "Active ACS Extensions",
      canPickMany: false,
    });
  } catch (error) {
    logError("Failed to show quick pick menu:", error);
    vscode.window.showErrorMessage("Failed to display ACS extensions menu");
  }
}

/**
 * Formats diagnostic information as a human-readable string.
 *
 * @param info - Diagnostic information to format
 * @returns Formatted diagnostic output
 * @internal
 */
function formatDiagnosticOutput(info: DiagnosticInfo): string {
  const lines = [
    "=== ACS Shared Status Bar Diagnostics ===",
    "",
    `Active Extension Count: ${info.activeExtensionCount}`,
    `Status Bar Exists: ${info.statusBarExists}`,
    `Status Bar Visible: ${info.statusBarVisible}`,
    `Command Registered: ${info.commandRegistered}`,
    `Register Command Registered: ${info.registerCommandRegistered}`,
    "",
    "Registered Extensions:",
  ];

  if (info.registeredExtensions.length === 0) {
    lines.push("  (none)");
  } else {
    info.registeredExtensions.forEach((ext) => {
      lines.push(`  - ${ext}`);
    });
  }

  lines.push("");
  if (info.lastError) {
    lines.push(`Last Error: ${info.lastError}`);
  } else {
    lines.push("Last Error: (none)");
  }

  lines.push("");
  lines.push("===========================================");

  return lines.join("\n");
}

/**
 * Shows diagnostic information about the shared status bar.
 *
 * This is the command handler for mcp-acs.diagnostics, which displays
 * detailed information about the current state for troubleshooting.
 *
 * @internal
 */
async function showDiagnostics(): Promise<void> {
  try {
    const diagnosticInfo = getDiagnosticInfo();
    const output = formatDiagnosticOutput(diagnosticInfo);

    // Output to console
    console.log(output);

    // Output to output channel if available
    if (outputChannel) {
      outputChannel.appendLine(output);
      outputChannel.show();
    }

    // Show information message to user
    vscode.window.showInformationMessage(
      `ACS Diagnostics: ${diagnosticInfo.activeExtensionCount} extension(s) active. Check output channel for details.`
    );

    log("Diagnostics displayed successfully");
  } catch (error) {
    logError("Failed to show diagnostics:", error);
    vscode.window.showErrorMessage("Failed to display diagnostics");
  }
}

/**
 * Updates the status bar item based on the current extension count.
 *
 * This function implements the core singleton pattern logic:
 *
 * **When count is 0:**
 * - Hides the status bar item (if it exists)
 * - Does NOT dispose the item (maintains singleton)
 *
 * **When count > 0 and status bar doesn't exist:**
 * - Creates the singleton status bar item
 * - Logs creation with full details
 * - Defensive check: verifies creation succeeded
 *
 * **When count > 0 and status bar exists:**
 * - Reuses the existing status bar item (singleton pattern)
 * - Updates text and tooltip to reflect current count
 * - Logs reuse to confirm singleton behavior
 *
 * The defensive checks in this function prevent the status bar doubling bug
 * by ensuring we never create a second status bar item.
 *
 * @internal
 */
function updateStatusBar(): void {
  if (activeExtensions.size === 0) {
    // Hide status bar when no extensions are active
    if (statusBarItem) {
      log("Hiding status bar (no active extensions)");
      try {
        statusBarItem.hide();
        // Verify visibility state after hide
        log("Status bar hidden successfully");
      } catch (error) {
        logError("Failed to hide status bar item:", error);
      }
    }
    return;
  }

  // SINGLETON PATTERN: Defensive check to prevent duplicate status bar items
  // This is the key fix for the status bar doubling bug
  if (!statusBarItem) {
    // Status bar doesn't exist - create it (first extension registering)
    try {
      log(
        `Creating status bar item (active extensions: ${activeExtensions.size})`
      );
      statusBarItem = vscode.window.createStatusBarItem(
        "mcp-acs.shared-status",
        vscode.StatusBarAlignment.Right,
        100
      );

      // Defensive check: verify creation succeeded
      if (!statusBarItem) {
        const errorMsg = "Status bar item creation returned undefined";
        log(`ERROR: ${errorMsg}`);
        lastError = errorMsg;
        return;
      }

      log(
        `Status bar item created successfully (ID: mcp-acs.shared-status, alignment: Right, priority: 100)`
      );
      // Only set command if it's registered
      if (commandDisposable) {
        statusBarItem.command = "mcp-acs.showMenu";
      }
    } catch (error) {
      logError("Failed to create status bar item:", error);
      return;
    }
  } else {
    // SINGLETON PATTERN: Status bar already exists - reuse it
    // This prevents creating duplicate status bar items
    log(
      `Reusing existing status bar item (active extensions: ${activeExtensions.size})`
    );
  }

  // Update status bar content
  statusBarItem.text = "$(layers) ACS";
  statusBarItem.tooltip = `ACS Extensions (${activeExtensions.size} active)`;
  log(`Showing status bar with ${activeExtensions.size} active extension(s)`);
  try {
    statusBarItem.show();
    // Verify visibility state after show
    log("Status bar shown successfully");
  } catch (error) {
    logError("Failed to show status bar item:", error);
  }
}

/**
 * Disposes all resources used by the shared status bar.
 *
 * This function cleans up:
 * - The show menu command (mcp-acs.showMenu)
 * - The diagnostic command (mcp-acs.diagnostics)
 * - The status bar item
 * - All registered extensions
 * - Error state
 *
 * Each disposal operation is wrapped in try-catch to ensure that if one
 * disposal fails, the others still execute. This provides robust cleanup
 * even in error conditions.
 *
 * This function is typically called during test cleanup or when the
 * extension host is shutting down.
 */
export function dispose(): void {
  log(
    `Disposing shared status bar (active extensions: ${activeExtensions.size})`
  );

  // Dispose show menu command
  try {
    if (commandDisposable) {
      commandDisposable.dispose();
      log("Command disposed: mcp-acs.showMenu");
    }
    commandDisposable = undefined;
  } catch (error) {
    logError("Failed to dispose command:", error);
  }

  // Dispose diagnostic command
  try {
    if (diagnosticCommandDisposable) {
      diagnosticCommandDisposable.dispose();
      log("Diagnostic command disposed: mcp-acs.diagnostics");
    }
    diagnosticCommandDisposable = undefined;
  } catch (error) {
    logError("Failed to dispose diagnostic command:", error);
  }

  // Dispose status bar item
  try {
    if (statusBarItem) {
      statusBarItem.dispose();
      log("Status bar item disposed");
    }
    statusBarItem = undefined;
  } catch (error) {
    logError("Failed to dispose status bar item:", error);
  }

  // Clear all state
  const extensionCount = activeExtensions.size;
  activeExtensions.clear();
  lastError = null;
  log(
    `Shared status bar disposed successfully (cleared ${extensionCount} extension(s))`
  );
  outputChannel = undefined;
}

/**
 * Gets the singleton status bar item instance.
 *
 * This function is primarily used for testing to verify the singleton pattern
 * is working correctly.
 *
 * @returns The status bar item if it exists, undefined otherwise
 */
export function getStatusBarItem(): vscode.StatusBarItem | undefined {
  return statusBarItem;
}

/**
 * Gets the number of currently registered extensions.
 *
 * This function is primarily used for testing and diagnostics.
 *
 * @returns The count of active extensions
 */
export function getActiveExtensionCount(): number {
  return activeExtensions.size;
}

/**
 * Gets the command disposable for the show menu command.
 *
 * This function is primarily used for testing to verify command registration.
 *
 * @returns The command disposable if registered, undefined otherwise
 */
export function getCommandDisposable(): vscode.Disposable | undefined {
  return commandDisposable;
}

/**
 * Diagnostic information about the shared status bar state.
 *
 * This interface provides a snapshot of the current state for troubleshooting
 * and debugging purposes.
 */
export interface DiagnosticInfo {
  /** Number of currently registered extensions */
  activeExtensionCount: number;

  /** Array of registered extension IDs */
  registeredExtensions: string[];

  /** Whether the status bar item exists */
  statusBarExists: boolean;

  /** Whether the status bar is currently visible */
  statusBarVisible: boolean;

  /** Whether the show menu command is registered */
  commandRegistered: boolean;

  /** Whether the register extension command is registered */
  registerCommandRegistered: boolean;

  /** Last error that occurred, if any */
  lastError: string | null;
}

/**
 * Gets diagnostic information about the current state of the shared status bar.
 *
 * This function provides a snapshot of the internal state for troubleshooting.
 * It's useful for debugging issues with status bar visibility, registration,
 * or command handling.
 *
 * @returns Diagnostic information object
 *
 * @example
 * ```typescript
 * const info = getDiagnosticInfo();
 * console.log(`Active extensions: ${info.activeExtensionCount}`);
 * console.log(`Status bar exists: ${info.statusBarExists}`);
 * console.log(`Status bar visible: ${info.statusBarVisible}`);
 * ```
 */
export function getDiagnosticInfo(): DiagnosticInfo {
  return {
    activeExtensionCount: activeExtensions.size,
    registeredExtensions: Array.from(activeExtensions),
    statusBarExists: statusBarItem !== undefined,
    statusBarVisible: statusBarItem !== undefined && activeExtensions.size > 0,
    commandRegistered: commandDisposable !== undefined,
    registerCommandRegistered: registerCommandDisposable !== undefined,
    lastError: lastError,
  };
}
