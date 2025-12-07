import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem | undefined;
const activeExtensions = new Set<string>();
let updatePending = false;

export function registerExtension(extensionId: string): void {
  activeExtensions.add(extensionId);
  scheduleUpdate();
}

export function unregisterExtension(extensionId: string): void {
  activeExtensions.delete(extensionId);
  scheduleUpdate();
}

function scheduleUpdate(): void {
  if (updatePending) return;
  updatePending = true;
  queueMicrotask(() => {
    updatePending = false;
    updateStatusBar();
  });
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
