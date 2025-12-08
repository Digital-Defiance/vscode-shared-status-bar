import * as vscode from "vscode";
import {
  registerExtension,
  unregisterExtension,
  dispose,
  getStatusBarItem,
  getActiveExtensionCount,
} from "./index";

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

  it("unregistering non-existent extension does not affect count", () => {
    registerExtension("test-ext-1");
    registerExtension("test-ext-2");
    expect(getActiveExtensionCount()).toBe(2);

    // Unregister an extension that was never registered
    unregisterExtension("non-existent-ext");

    // Count should remain unchanged
    expect(getActiveExtensionCount()).toBe(2);
  });

  it("unregistering existing extension decreases count", () => {
    registerExtension("test-ext-1");
    registerExtension("test-ext-2");
    expect(getActiveExtensionCount()).toBe(2);

    unregisterExtension("test-ext-1");
    expect(getActiveExtensionCount()).toBe(1);

    unregisterExtension("test-ext-2");
    expect(getActiveExtensionCount()).toBe(0);
  });

  it("status bar is hidden when all extensions unregistered", () => {
    registerExtension("test-ext-1");
    const statusBar = getStatusBarItem();
    expect(statusBar).toBeDefined();

    unregisterExtension("test-ext-1");

    // Status bar should be hidden
    expect(statusBar?.hide).toHaveBeenCalled();
  });

  it("status bar command is set after command registration", () => {
    registerExtension("test-ext-1");
    const statusBar = getStatusBarItem();

    // Status bar should exist
    expect(statusBar).toBeDefined();

    // Command should be registered
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      "mcp-acs.showMenu",
      expect.any(Function)
    );

    // Status bar should have the command set
    expect(statusBar?.command).toBe("mcp-acs.showMenu");
  });

  it("status bar works correctly in test environment", () => {
    // This test verifies Requirement 4.1 and 4.2
    // The status bar should function identically in test mode

    // Register first extension
    registerExtension("test-ext-1");

    // Status bar should be created and shown (Requirement 4.2)
    expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
    const statusBar = getStatusBarItem();
    expect(statusBar).toBeDefined();
    expect(statusBar?.show).toHaveBeenCalled();

    // Register second extension
    registerExtension("test-ext-2");
    expect(getActiveExtensionCount()).toBe(2);

    // Unregister extensions
    unregisterExtension("test-ext-1");
    expect(getActiveExtensionCount()).toBe(1);

    unregisterExtension("test-ext-2");
    expect(getActiveExtensionCount()).toBe(0);

    // Status bar should be hidden
    expect(statusBar?.hide).toHaveBeenCalled();
  });

  it("sequential tests start with clean state", () => {
    // This test verifies Requirement 4.4
    // Each test should start with a clean state

    // After dispose in afterEach, state should be clean
    expect(getActiveExtensionCount()).toBe(0);
    expect(getStatusBarItem()).toBeUndefined();

    // Register an extension
    registerExtension("test-ext");
    expect(getActiveExtensionCount()).toBe(1);

    // The afterEach will clean this up for the next test
  });

  describe("Error Handling", () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("handles command registration failure gracefully", () => {
      // Mock registerCommand to throw an error
      const originalRegisterCommand = vscode.commands.registerCommand;
      (vscode.commands.registerCommand as any) = jest.fn(() => {
        throw new Error("Command registration failed");
      });

      // Should not throw, extension should continue loading
      expect(() => registerExtension("test-ext")).not.toThrow();

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to register mcp-acs.showMenu command:",
        expect.any(Error)
      );

      // Extension should still be registered
      expect(getActiveExtensionCount()).toBe(1);

      // Status bar should still be created
      expect(getStatusBarItem()).toBeDefined();

      // Restore original mock
      vscode.commands.registerCommand = originalRegisterCommand;
    });

    it("handles status bar creation failure gracefully", () => {
      // Mock createStatusBarItem to throw an error
      const originalCreateStatusBarItem = vscode.window.createStatusBarItem;
      (vscode.window.createStatusBarItem as any) = jest.fn(() => {
        throw new Error("Status bar creation failed");
      });

      // Should not throw, extension should continue loading
      expect(() => registerExtension("test-ext")).not.toThrow();

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create status bar item:",
        expect.any(Error)
      );

      // Extension should still be registered
      expect(getActiveExtensionCount()).toBe(1);

      // Status bar should be undefined
      expect(getStatusBarItem()).toBeUndefined();

      // Restore original mock
      vscode.window.createStatusBarItem = originalCreateStatusBarItem;
    });

    it("handles quick pick display failure gracefully", async () => {
      // Mock showQuickPick to throw an error
      const originalShowQuickPick = vscode.window.showQuickPick;
      (vscode.window.showQuickPick as any) = jest.fn(() => {
        throw new Error("Quick pick failed");
      });

      registerExtension("test-ext");

      // Get the command callback
      const registerCommandCalls = (
        vscode.commands.registerCommand as jest.Mock
      ).mock.calls;
      const showMenuCallback = registerCommandCalls[0][1];

      // Should not throw when command is invoked
      await expect(showMenuCallback()).resolves.not.toThrow();

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to show quick pick menu:",
        expect.any(Error)
      );

      // Error message should be shown to user
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to display ACS extensions menu"
      );

      // Restore original mock
      vscode.window.showQuickPick = originalShowQuickPick;
    });

    it("handles command disposal errors gracefully", () => {
      registerExtension("test-ext");

      // Mock the command disposable to throw on dispose
      const commandDisposableMock = (
        vscode.commands.registerCommand as jest.Mock
      ).mock.results[0].value;
      commandDisposableMock.dispose = jest.fn(() => {
        throw new Error("Command disposal failed");
      });

      // Should not throw when unregistering
      expect(() => unregisterExtension("test-ext")).not.toThrow();

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to dispose mcp-acs.showMenu command:",
        expect.any(Error)
      );

      // Extension should still be unregistered
      expect(getActiveExtensionCount()).toBe(0);
    });

    it("handles status bar disposal errors gracefully", () => {
      registerExtension("test-ext");
      const statusBar = getStatusBarItem();

      // Mock status bar dispose to throw an error
      if (statusBar) {
        statusBar.dispose = jest.fn(() => {
          throw new Error("Status bar disposal failed");
        });
      }

      // Should not throw when disposing
      expect(() => dispose()).not.toThrow();

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to dispose status bar item:",
        expect.any(Error)
      );

      // State should still be cleaned up
      expect(getActiveExtensionCount()).toBe(0);
    });

    it("handles multiple disposal errors gracefully", () => {
      registerExtension("test-ext");
      const statusBar = getStatusBarItem();

      // Mock both command and status bar dispose to throw errors
      const commandDisposableMock = (
        vscode.commands.registerCommand as jest.Mock
      ).mock.results[0].value;
      commandDisposableMock.dispose = jest.fn(() => {
        throw new Error("Command disposal failed");
      });

      if (statusBar) {
        statusBar.dispose = jest.fn(() => {
          throw new Error("Status bar disposal failed");
        });
      }

      // Should not throw when disposing
      expect(() => dispose()).not.toThrow();

      // Both errors should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to dispose command:",
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to dispose status bar item:",
        expect.any(Error)
      );

      // State should still be cleaned up
      expect(getActiveExtensionCount()).toBe(0);
    });

    it("continues operation after command registration failure", () => {
      // Mock registerCommand to throw an error
      const originalRegisterCommand = vscode.commands.registerCommand;
      (vscode.commands.registerCommand as any) = jest.fn(() => {
        throw new Error("Command registration failed");
      });

      // Register first extension (command registration will fail)
      registerExtension("test-ext-1");
      expect(getActiveExtensionCount()).toBe(1);

      // Restore the mock
      vscode.commands.registerCommand = originalRegisterCommand;

      // Register second extension (should work normally)
      registerExtension("test-ext-2");
      expect(getActiveExtensionCount()).toBe(2);

      // Status bar should still be functional
      const statusBar = getStatusBarItem();
      expect(statusBar).toBeDefined();
      expect(statusBar?.text).toBe("$(layers) ACS");
    });
  });
});
