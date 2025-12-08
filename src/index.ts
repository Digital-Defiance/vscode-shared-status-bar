import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem | undefined;
const activeExtensions = new Set<string>();
let commandDisposable: vscode.Disposable | undefined;
let diagnosticCommandDisposable: vscode.Disposable | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let lastError: string | null = null;

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  if (outputChannel) {
    outputChannel.appendLine(logMessage);
  }
  console.log(logMessage);
}

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

export function setOutputChannel(channel: vscode.OutputChannel): void {
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

export function registerExtension(extensionId: string): void {
  const wasEmpty = activeExtensions.size === 0;
  const previousSize = activeExtensions.size;

  // Check if extension is already registered
  activeExtensions.add(extensionId);

  // Only proceed if count actually changed (new extension added)
  const countChanged = activeExtensions.size !== previousSize;

  if (countChanged) {
    log(
      `Extension registered: ${extensionId} (total: ${activeExtensions.size})`
    );
  } else {
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

  // Only update status bar if count changed
  if (countChanged) {
    updateStatusBar();
  }
}

export function unregisterExtension(extensionId: string): void {
  // Only proceed if the extension was actually registered
  const wasRegistered = activeExtensions.has(extensionId);
  if (!wasRegistered) {
    // Extension wasn't registered, nothing to do
    log(`Extension not registered, ignoring unregister: ${extensionId}`);
    return;
  }

  // Remove the extension
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

  // Update status bar visibility based on count
  updateStatusBar();
}

async function showMenuCommand(): Promise<void> {
  try {
    log(`Showing menu with ${activeExtensions.size} extensions`);
    const extensionIds = Array.from(activeExtensions);
    await vscode.window.showQuickPick(extensionIds, {
      placeHolder: "Active MCP Extensions",
      canPickMany: false,
    });
  } catch (error) {
    logError("Failed to show quick pick menu:", error);
    vscode.window.showErrorMessage("Failed to display MCP extensions menu");
  }
}

function formatDiagnosticOutput(info: DiagnosticInfo): string {
  const lines = [
    "=== MCP ACS Shared Status Bar Diagnostics ===",
    "",
    `Active Extension Count: ${info.activeExtensionCount}`,
    `Status Bar Exists: ${info.statusBarExists}`,
    `Status Bar Visible: ${info.statusBarVisible}`,
    `Command Registered: ${info.commandRegistered}`,
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
      `MCP ACS Diagnostics: ${diagnosticInfo.activeExtensionCount} extension(s) active. Check output channel for details.`
    );

    log("Diagnostics displayed successfully");
  } catch (error) {
    logError("Failed to show diagnostics:", error);
    vscode.window.showErrorMessage("Failed to display diagnostics");
  }
}

function updateStatusBar(): void {
  if (activeExtensions.size === 0) {
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

  if (!statusBarItem) {
    try {
      log("Creating status bar item");
      statusBarItem = vscode.window.createStatusBarItem(
        "mcp-acs.shared-status",
        vscode.StatusBarAlignment.Right,
        100
      );

      // Verify status bar item exists after creation
      if (!statusBarItem) {
        const errorMsg = "Status bar item creation returned undefined";
        log(`ERROR: ${errorMsg}`);
        lastError = errorMsg;
        return;
      }

      log("Status bar item created successfully");
      // Only set command if it's registered
      if (commandDisposable) {
        statusBarItem.command = "mcp-acs.showMenu";
      }
    } catch (error) {
      logError("Failed to create status bar item:", error);
      return;
    }
  }

  statusBarItem.text = "$(layers) MCP";
  statusBarItem.tooltip = `MCP Extensions (${activeExtensions.size} active)`;
  log(`Showing status bar with ${activeExtensions.size} active extension(s)`);
  try {
    statusBarItem.show();
    // Verify visibility state after show
    log("Status bar shown successfully");
  } catch (error) {
    logError("Failed to show status bar item:", error);
  }
}

export function dispose(): void {
  log("Disposing shared status bar");

  try {
    commandDisposable?.dispose();
    commandDisposable = undefined;
  } catch (error) {
    logError("Failed to dispose command:", error);
  }

  try {
    diagnosticCommandDisposable?.dispose();
    diagnosticCommandDisposable = undefined;
  } catch (error) {
    logError("Failed to dispose diagnostic command:", error);
  }

  try {
    statusBarItem?.dispose();
    statusBarItem = undefined;
  } catch (error) {
    logError("Failed to dispose status bar item:", error);
  }

  activeExtensions.clear();
  lastError = null;
  log("Shared status bar disposed");
}

export function getStatusBarItem(): vscode.StatusBarItem | undefined {
  return statusBarItem;
}

export function getActiveExtensionCount(): number {
  return activeExtensions.size;
}

export function getCommandDisposable(): vscode.Disposable | undefined {
  return commandDisposable;
}

export interface DiagnosticInfo {
  activeExtensionCount: number;
  registeredExtensions: string[];
  statusBarExists: boolean;
  statusBarVisible: boolean;
  commandRegistered: boolean;
  lastError: string | null;
}

export function getDiagnosticInfo(): DiagnosticInfo {
  return {
    activeExtensionCount: activeExtensions.size,
    registeredExtensions: Array.from(activeExtensions),
    statusBarExists: statusBarItem !== undefined,
    statusBarVisible: statusBarItem !== undefined && activeExtensions.size > 0,
    commandRegistered: commandDisposable !== undefined,
    lastError: lastError,
  };
}
