import * as vscode from "vscode";
import { registerExtension, unregisterExtension, dispose, getStatusBarItem, getActiveExtensionCount } from "./index";

describe("Shared Status Bar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    dispose();
  });

  it("creates status bar on first registration", () => {
    registerExtension("test-ext");
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      "mcp-acs.shared-status",
      vscode.StatusBarAlignment.Right,
      100
    );
  });

  it("registers extension successfully", () => {
    registerExtension("test-ext");
    expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
  });

  it("getStatusBarItem returns the status bar", () => {
    registerExtension("test-ext");
    expect(getStatusBarItem()).toBeDefined();
  });

  it("getActiveExtensionCount returns correct count", () => {
    registerExtension("test-ext-1");
    registerExtension("test-ext-2");
    expect(getActiveExtensionCount()).toBe(2);
  });
});
