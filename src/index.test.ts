import * as vscode from "vscode";
import { registerExtension, unregisterExtension, dispose } from "./index";

describe("Shared Status Bar", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env["VSCODE_TEST_MODE"];
    delete process.env["NODE_ENV"];
  });

  afterEach(() => {
    dispose();
    process.env = originalEnv;
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

  it("skips status bar creation in test mode", () => {
    process.env["VSCODE_TEST_MODE"] = "true";
    registerExtension("test-ext");
    expect(vscode.window.createStatusBarItem).not.toHaveBeenCalled();
  });

  it("skips status bar creation when NODE_ENV is test", () => {
    process.env["NODE_ENV"] = "test";
    registerExtension("test-ext");
    expect(vscode.window.createStatusBarItem).not.toHaveBeenCalled();
  });
});
