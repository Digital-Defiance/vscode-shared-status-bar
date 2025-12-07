import * as vscode from "vscode";
import { registerExtension, unregisterExtension, dispose } from "./index";

describe("Shared Status Bar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    dispose();
  });

  it("creates status bar on first registration", (done) => {
    registerExtension("test-ext");
    setTimeout(() => {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
        "mcp-acs.shared-status",
        vscode.StatusBarAlignment.Right,
        100
      );
      done();
    }, 10);
  });

  it("registers extension successfully", (done) => {
    registerExtension("test-ext");
    setTimeout(() => {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
      done();
    }, 10);
  });
});
