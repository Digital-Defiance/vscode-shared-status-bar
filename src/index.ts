import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem | undefined;
const activeExtensions = new Set<string>();
let commandDisposable: vscode.Disposable | undefined;

export function registerExtension(extensionId: string): void {
  const wasEmpty = activeExtensions.size === 0;
  const previousSize = activeExtensions.size;

  // Check if extension is already registered
  activeExtensions.add(extensionId);

  // Only proceed if count actually changed (new extension added)
  const countChanged = activeExtensions.size !== previousSize;

  // Register command when first extension registers
  if (wasEmpty && activeExtensions.size > 0) {
    try {
      commandDisposable = vscode.commands.registerCommand(
        "mcp-acs.showMenu",
        showMenuCommand
      );
      // Add command to status bar if it already exists
      if (statusBarItem) {
        statusBarItem.command = "mcp-acs.showMenu";
      }
    } catch (error) {
      console.error("Failed to register mcp-acs.showMenu command:", error);
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
    return;
  }

  // Remove the extension
  activeExtensions.delete(extensionId);

  // Dispose command when last extension unregisters
  if (activeExtensions.size === 0 && commandDisposable) {
    try {
      commandDisposable.dispose();
      commandDisposable = undefined;
    } catch (error) {
      console.error("Failed to dispose mcp-acs.showMenu command:", error);
    }
  }

  // Update status bar visibility based on count
  updateStatusBar();
}

async function showMenuCommand(): Promise<void> {
  try {
    const extensionIds = Array.from(activeExtensions);
    await vscode.window.showQuickPick(extensionIds, {
      placeHolder: "Active MCP Extensions",
      canPickMany: false,
    });
  } catch (error) {
    console.error("Failed to show quick pick menu:", error);
    vscode.window.showErrorMessage("Failed to display MCP extensions menu");
  }
}

function updateStatusBar(): void {
  if (activeExtensions.size === 0) {
    statusBarItem?.hide();
    return;
  }

  if (!statusBarItem) {
    try {
      statusBarItem = vscode.window.createStatusBarItem(
        "mcp-acs.shared-status",
        vscode.StatusBarAlignment.Right,
        100
      );
      // Only set command if it's registered
      if (commandDisposable) {
        statusBarItem.command = "mcp-acs.showMenu";
      }
    } catch (error) {
      console.error("Failed to create status bar item:", error);
      return;
    }
  }

  statusBarItem.text = "$(layers) MCP";
  statusBarItem.tooltip = `MCP Extensions (${activeExtensions.size} active)`;
  statusBarItem.show();
}

export function dispose(): void {
  try {
    commandDisposable?.dispose();
    commandDisposable = undefined;
  } catch (error) {
    console.error("Failed to dispose command:", error);
  }

  try {
    statusBarItem?.dispose();
    statusBarItem = undefined;
  } catch (error) {
    console.error("Failed to dispose status bar item:", error);
  }

  activeExtensions.clear();
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
