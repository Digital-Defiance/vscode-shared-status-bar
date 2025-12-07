import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem | undefined;
const activeExtensions = new Set<string>();

export function registerExtension(extensionId: string): void {
  activeExtensions.add(extensionId);
  // Use Promise.resolve to defer to microtask queue, avoiding extension host blocking
  Promise.resolve().then(() => updateStatusBar());
}

export function unregisterExtension(extensionId: string): void {
  activeExtensions.delete(extensionId);
  Promise.resolve().then(() => updateStatusBar());
}

function updateStatusBar(): void {
  if (activeExtensions.size === 0) {
    statusBarItem?.hide();
    return;
  }

  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      "mcp-acs.shared-status",
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.command = "mcp-acs.showMenu";
  }

  statusBarItem.text = "$(layers) MCP";
  statusBarItem.tooltip = `MCP Extensions (${activeExtensions.size} active)`;
  statusBarItem.show();
}

export function dispose(): void {
  statusBarItem?.dispose();
  statusBarItem = undefined;
  activeExtensions.clear();
}
