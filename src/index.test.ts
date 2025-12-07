import * as vscode from "vscode";
import { registerExtension, unregisterExtension, dispose } from "./index";

describe("Shared Status Bar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    dispose();
  });

  it("creates status bar on first registration", async () => {
    registerExtension("test-ext");
    await Promise.resolve();
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      "mcp-acs.shared-status",
      vscode.StatusBarAlignment.Right,
      100
    );
  });

  it("registers extension successfully", async () => {
    registerExtension("test-ext");
    await Promise.resolve();
    expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
  });
});
