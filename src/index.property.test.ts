import * as fc from "fast-check";
import * as vscode from "vscode";
import {
  registerExtension,
  unregisterExtension,
  dispose,
  getCommandDisposable,
  getActiveExtensionCount,
  getStatusBarItem,
  setOutputChannel,
  getDiagnosticInfo,
} from "./index";
import { createMockOutputChannel } from "./__mocks__/vscode";

describe("Property-Based Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dispose();
  });

  afterEach(() => {
    dispose();
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 3: Command registration lifecycle
   * Validates: Requirements 3.1, 3.2, 3.3
   *
   * For any sequence of registration operations, the command should be registered
   * if and only if at least one extension is active
   */
  it("Property 3: Command registration lifecycle", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Command should not be registered initially
          expect(getCommandDisposable()).toBeUndefined();

          // Register all extensions
          for (const id of extensionIds) {
            registerExtension(id);
          }

          // Command should be registered when at least one extension is active
          if (getActiveExtensionCount() > 0) {
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
              "mcp-acs.showMenu",
              expect.any(Function)
            );
            expect(getCommandDisposable()).toBeDefined();
          }

          // Unregister all extensions
          for (const id of extensionIds) {
            unregisterExtension(id);
          }

          // Command should be disposed when no extensions are active
          expect(getActiveExtensionCount()).toBe(0);
          expect(getCommandDisposable()).toBeUndefined();

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 9: Command execution safety
   * Validates: Requirements 3.4
   *
   * For any state with at least one active extension, invoking the mcp-acs.showMenu
   * command should complete without throwing errors
   */
  it("Property 9: Command execution safety", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }),
        async (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register extensions
          for (const id of extensionIds) {
            registerExtension(id);
          }

          // Get the command handler that was registered
          const registerCommandMock = vscode.commands
            .registerCommand as jest.Mock;
          if (registerCommandMock.mock.calls.length > 0) {
            const commandHandler = registerCommandMock.mock.calls[0][1];

            // Execute the command - should not throw
            await expect(commandHandler()).resolves.not.toThrow();
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 7: Non-blocking operations
   * Validates: Requirements 1.1, 1.4
   *
   * For any registration or unregistration operation, the function should complete
   * synchronously without blocking the event loop
   */
  it("Property 7: Non-blocking operations", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom("register", "unregister"),
            extensionId: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (operations) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          const startTime = Date.now();

          // Execute all operations synchronously
          for (const op of operations) {
            if (op.action === "register") {
              registerExtension(op.extensionId);
            } else {
              unregisterExtension(op.extensionId);
            }
          }

          const endTime = Date.now();
          const duration = endTime - startTime;

          // All operations should complete very quickly (well under 100ms)
          // Using 50ms as a generous threshold for synchronous operations
          expect(duration).toBeLessThan(50);

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 1: Registration increases count
   * Validates: Requirements 1.1, 1.3
   *
   * For any initial state with N active extensions, calling registerExtension
   * with a new extension ID should result in N+1 active extensions
   */
  it("Property 1: Registration increases count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 0,
          maxLength: 10,
        }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (initialExtensions: string[], newExtension: string) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register initial extensions
          const uniqueInitial = Array.from(new Set(initialExtensions));
          for (const id of uniqueInitial) {
            registerExtension(id);
          }

          const initialCount = getActiveExtensionCount();

          // Register a new extension that's not in the initial set
          // If newExtension is already in the set, this tests idempotency
          const isNewExtension = !uniqueInitial.includes(newExtension);
          registerExtension(newExtension);

          const finalCount = getActiveExtensionCount();

          // If it was a new extension, count should increase by 1
          // If it was already registered, count should stay the same
          if (isNewExtension) {
            expect(finalCount).toBe(initialCount + 1);
          } else {
            expect(finalCount).toBe(initialCount);
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 5: Idempotent registration
   * Validates: Requirements 1.1, 1.3
   *
   * For any extension ID, calling registerExtension multiple times should have
   * the same effect as calling it once
   */
  it("Property 5: Idempotent registration", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (extensionId: string, numRegistrations: number) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register the same extension multiple times
          for (let i = 0; i < numRegistrations; i++) {
            registerExtension(extensionId);
          }

          // Count should be 1 regardless of how many times we registered
          expect(getActiveExtensionCount()).toBe(1);

          // Status bar should have been created
          expect(vscode.window.createStatusBarItem).toHaveBeenCalled();

          // Command should have been registered exactly once
          expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(1);

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 8: Quick pick menu contents
   * Validates: Requirements 2.1, 2.2
   *
   * For any non-empty set of active extensions, invoking the show menu command
   * should display a quick pick with items matching all registered extension IDs
   */
  it("Property 8: Quick pick menu contents", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }),
        async (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register all extensions
          const uniqueExtensions = Array.from(new Set(extensionIds));
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Get the command handler that was registered
          const registerCommandMock = vscode.commands
            .registerCommand as jest.Mock;
          if (registerCommandMock.mock.calls.length > 0) {
            const commandHandler = registerCommandMock.mock.calls[0][1];

            // Execute the command
            await commandHandler();

            // Verify showQuickPick was called with the correct extension IDs
            const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
            expect(showQuickPickMock).toHaveBeenCalled();

            // Get the items passed to showQuickPick
            const callArgs = showQuickPickMock.mock.calls[0];
            const items = callArgs[0];

            // Verify all registered extensions are in the menu
            expect(items).toHaveLength(uniqueExtensions.length);
            for (const id of uniqueExtensions) {
              expect(items).toContain(id);
            }

            // Verify no extra items are in the menu
            for (const item of items) {
              expect(uniqueExtensions).toContain(item);
            }
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 2: Unregistration decreases count
   * Validates: Requirements 1.1, 1.3
   *
   * For any state with N > 0 active extensions, calling unregisterExtension
   * with an existing extension ID should result in N-1 active extensions
   */
  it("Property 2: Unregistration decreases count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register all extensions (unique set)
          const uniqueExtensions = Array.from(new Set(extensionIds));
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          const initialCount = getActiveExtensionCount();
          expect(initialCount).toBe(uniqueExtensions.length);

          // Pick a random extension to unregister
          if (uniqueExtensions.length > 0) {
            const extensionToRemove = uniqueExtensions[0];
            unregisterExtension(extensionToRemove);

            const finalCount = getActiveExtensionCount();

            // Count should decrease by 1
            expect(finalCount).toBe(initialCount - 1);

            // Unregistering the same extension again should not change count
            unregisterExtension(extensionToRemove);
            expect(getActiveExtensionCount()).toBe(finalCount);
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 6: Dispose cleanup
   * Validates: Requirements 4.3, 4.4
   *
   * For any state, calling dispose() should result in zero active extensions,
   * no status bar item, and no registered command
   */
  it("Property 6: Dispose cleanup", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 0,
          maxLength: 10,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register extensions to create some state
          const uniqueExtensions = Array.from(new Set(extensionIds));
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Verify state was created (if there were extensions)
          if (uniqueExtensions.length > 0) {
            expect(getActiveExtensionCount()).toBeGreaterThan(0);
            expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
            expect(vscode.commands.registerCommand).toHaveBeenCalled();
          }

          // Call dispose
          dispose();

          // Verify complete cleanup:
          // 1. Active extensions count should be zero
          expect(getActiveExtensionCount()).toBe(0);

          // 2. Command disposable should be undefined
          expect(getCommandDisposable()).toBeUndefined();

          // 3. If command was registered, it should have been disposed
          if (uniqueExtensions.length > 0) {
            // Get the mock disposable that was returned by registerCommand
            const registerCommandMock = vscode.commands
              .registerCommand as jest.Mock;
            if (registerCommandMock.mock.results.length > 0) {
              const mockDisposable = registerCommandMock.mock.results[0].value;
              expect(mockDisposable.dispose).toHaveBeenCalled();
            }
          }

          // 4. Calling dispose again should be safe (idempotent)
          expect(() => dispose()).not.toThrow();
          expect(getActiveExtensionCount()).toBe(0);
          expect(getCommandDisposable()).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: vscode-shared-status-bar-fix, Property 4: Status bar visibility
   * Validates: Requirements 2.3, 2.4
   *
   * For any state, the status bar item should be visible if and only if
   * at least one extension is active
   */
  it("Property 4: Status bar visibility", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 0,
          maxLength: 10,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register extensions
          const uniqueExtensions = Array.from(new Set(extensionIds));
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          const statusBar = getStatusBarItem();
          const activeCount = getActiveExtensionCount();

          if (activeCount > 0) {
            // Status bar should exist and be shown
            expect(statusBar).toBeDefined();
            expect(statusBar?.show).toHaveBeenCalled();

            // Tooltip should show correct count
            expect(statusBar?.tooltip).toBe(
              `MCP Extensions (${activeCount} active)`
            );
          } else {
            // Status bar should not exist yet (no extensions registered)
            expect(statusBar).toBeUndefined();
          }

          // Now unregister all extensions one by one
          for (const id of uniqueExtensions) {
            unregisterExtension(id);
          }

          // After unregistering all, status bar should be hidden
          if (uniqueExtensions.length > 0 && statusBar) {
            expect(statusBar.hide).toHaveBeenCalled();
          }

          // Verify count is zero
          expect(getActiveExtensionCount()).toBe(0);

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 4: Registration logging is complete
   * Validates: Requirements 2.1
   *
   * For any extension ID, calling registerExtension should result in a log entry
   * containing that extension ID
   */
  it("Property 4: Registration logging is complete", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (extensionId: string) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Create a mock output channel to capture logs
          const mockChannel = createMockOutputChannel();
          setOutputChannel(mockChannel as any);

          // Clear the mock after setOutputChannel call
          mockChannel.appendLine.mockClear();

          // Spy on console.log to capture logs
          const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

          // Register the extension
          registerExtension(extensionId);

          // Verify that a log entry was created
          // Check both output channel and console.log
          const outputChannelCalls = mockChannel.appendLine.mock.calls;
          const consoleLogCalls = consoleLogSpy.mock.calls;

          // At least one log call should contain the extension ID
          const hasOutputChannelLog = outputChannelCalls.some((call) =>
            call[0].includes(extensionId)
          );
          const hasConsoleLog = consoleLogCalls.some((call) =>
            call[0].includes(extensionId)
          );

          expect(hasOutputChannelLog || hasConsoleLog).toBe(true);

          // Verify the log contains "registered" or similar text
          const hasRegistrationLog =
            outputChannelCalls.some(
              (call) =>
                call[0].includes(extensionId) &&
                call[0].toLowerCase().includes("register")
            ) ||
            consoleLogCalls.some(
              (call) =>
                call[0].includes(extensionId) &&
                call[0].toLowerCase().includes("register")
            );

          expect(hasRegistrationLog).toBe(true);

          // Cleanup
          consoleLogSpy.mockRestore();
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 5: Visibility changes are logged
   * Validates: Requirements 2.3
   *
   * For any sequence of operations that change visibility, each change should
   * produce a corresponding log entry
   */
  it("Property 5: Visibility changes are logged", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 5,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Create a mock output channel to capture logs
          const mockChannel = createMockOutputChannel();
          setOutputChannel(mockChannel as any);

          // Clear the mock after setOutputChannel call
          mockChannel.appendLine.mockClear();

          // Spy on console.log to capture logs
          const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

          const uniqueExtensions = Array.from(new Set(extensionIds));

          // Register all extensions (should cause visibility change to shown)
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Clear logs before unregistering
          const logsAfterRegister = [
            ...mockChannel.appendLine.mock.calls,
            ...consoleLogSpy.mock.calls,
          ];

          // Check that we have a log about showing the status bar
          const hasShowLog = logsAfterRegister.some((call) =>
            call[0].toLowerCase().includes("show")
          );
          expect(hasShowLog).toBe(true);

          // Clear mocks
          mockChannel.appendLine.mockClear();
          consoleLogSpy.mockClear();

          // Unregister all extensions (should cause visibility change to hidden)
          for (const id of uniqueExtensions) {
            unregisterExtension(id);
          }

          const logsAfterUnregister = [
            ...mockChannel.appendLine.mock.calls,
            ...consoleLogSpy.mock.calls,
          ];

          // Check that we have a log about hiding the status bar
          const hasHideLog = logsAfterUnregister.some((call) =>
            call[0].toLowerCase().includes("hid")
          );
          expect(hasHideLog).toBe(true);

          // Cleanup
          consoleLogSpy.mockRestore();
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 7: Status bar item is singleton
   * Validates: Requirements 3.4
   *
   * For any sequence of registrations, only one status bar item should ever be created
   */
  it("Property 7: Status bar item is singleton", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          const uniqueExtensions = Array.from(new Set(extensionIds));

          // Register all extensions one by one
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Verify createStatusBarItem was called exactly once
          // regardless of how many extensions were registered
          const createStatusBarItemMock = vscode.window
            .createStatusBarItem as jest.Mock;
          expect(createStatusBarItemMock).toHaveBeenCalledTimes(1);

          // Verify we only have one status bar item instance
          const statusBar = getStatusBarItem();
          expect(statusBar).toBeDefined();

          // Store reference to the status bar item
          const firstStatusBarItem = statusBar;

          // Register more extensions
          for (let i = 0; i < 5; i++) {
            registerExtension(`additional-extension-${i}`);
          }

          // Verify createStatusBarItem was still only called once
          expect(createStatusBarItemMock).toHaveBeenCalledTimes(1);

          // Verify we still have the same status bar item instance
          const currentStatusBar = getStatusBarItem();
          expect(currentStatusBar).toBe(firstStatusBarItem);

          // Unregister all extensions
          for (const id of uniqueExtensions) {
            unregisterExtension(id);
          }
          for (let i = 0; i < 5; i++) {
            unregisterExtension(`additional-extension-${i}`);
          }

          // Register new extensions again
          jest.clearAllMocks();
          for (let i = 0; i < 3; i++) {
            registerExtension(`new-extension-${i}`);
          }

          // After clearing and re-registering, status bar should be reused
          // (not created again since it wasn't disposed)
          expect(createStatusBarItemMock).toHaveBeenCalledTimes(0);

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 1: Status bar visibility matches registration state
   * Validates: Requirements 1.1, 1.4
   *
   * For any sequence of extension registrations and unregistrations, the status bar
   * should be visible if and only if at least one extension is registered
   */
  it("Property 1: Status bar visibility matches registration state", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom("register", "unregister"),
            extensionId: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (operations) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Track which extensions are currently registered
          const registeredExtensions = new Set<string>();

          // Execute operations and verify visibility after each
          for (const op of operations) {
            if (op.action === "register") {
              registerExtension(op.extensionId);
              registeredExtensions.add(op.extensionId);
            } else {
              unregisterExtension(op.extensionId);
              registeredExtensions.delete(op.extensionId);
            }

            // Verify visibility matches registration state
            const statusBar = getStatusBarItem();
            const activeCount = getActiveExtensionCount();

            // Active count should match our tracked set
            expect(activeCount).toBe(registeredExtensions.size);

            if (registeredExtensions.size > 0) {
              // Status bar should exist and be shown
              expect(statusBar).toBeDefined();
              expect(statusBar?.show).toHaveBeenCalled();
              expect(statusBar?.text).toBe("$(layers) MCP");
            } else {
              // If no extensions, status bar might exist but should be hidden
              if (statusBar) {
                expect(statusBar.hide).toHaveBeenCalled();
              }
            }
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 2: Tooltip reflects accurate count
   * Validates: Requirements 1.2, 1.5
   *
   * For any number of registered extensions, the tooltip should display the exact
   * count of active extensions
   */
  it("Property 2: Tooltip reflects accurate count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 15,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          const uniqueExtensions = Array.from(new Set(extensionIds));

          // Register extensions one by one and verify tooltip after each
          for (let i = 0; i < uniqueExtensions.length; i++) {
            registerExtension(uniqueExtensions[i]);

            const statusBar = getStatusBarItem();
            const activeCount = getActiveExtensionCount();

            // Verify count is correct
            expect(activeCount).toBe(i + 1);

            // Verify tooltip reflects the current count
            expect(statusBar).toBeDefined();
            expect(statusBar?.tooltip).toBe(`MCP Extensions (${i + 1} active)`);
          }

          // Now unregister extensions one by one and verify tooltip updates
          for (let i = uniqueExtensions.length - 1; i >= 0; i--) {
            unregisterExtension(uniqueExtensions[i]);

            const statusBar = getStatusBarItem();
            const activeCount = getActiveExtensionCount();

            // Verify count is correct
            expect(activeCount).toBe(i);

            if (i > 0) {
              // Verify tooltip reflects the current count
              expect(statusBar?.tooltip).toBe(`MCP Extensions (${i} active)`);
            }
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 3: Quick pick shows all registered extensions
   * Validates: Requirements 1.3
   *
   * For any set of registered extension IDs, clicking the status bar should display
   * a quick pick containing exactly those IDs
   */
  it("Property 3: Quick pick shows all registered extensions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }),
        async (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Register all extensions
          const uniqueExtensions = Array.from(new Set(extensionIds));
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Get the command handler that was registered
          const registerCommandMock = vscode.commands
            .registerCommand as jest.Mock;
          if (registerCommandMock.mock.calls.length > 0) {
            const commandHandler = registerCommandMock.mock.calls[0][1];

            // Execute the command
            await commandHandler();

            // Verify showQuickPick was called with the correct extension IDs
            const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
            expect(showQuickPickMock).toHaveBeenCalled();

            // Get the items passed to showQuickPick
            const callArgs = showQuickPickMock.mock.calls[0];
            const items = callArgs[0];

            // Verify all registered extensions are in the menu
            expect(items).toHaveLength(uniqueExtensions.length);
            for (const id of uniqueExtensions) {
              expect(items).toContain(id);
            }

            // Verify no extra items are in the menu
            for (const item of items) {
              expect(uniqueExtensions).toContain(item);
            }

            // Verify the quick pick options are correct
            const options = callArgs[1];
            expect(options).toHaveProperty(
              "placeHolder",
              "Active MCP Extensions"
            );
            expect(options).toHaveProperty("canPickMany", false);
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-status-bar-visibility, Property 8: Diagnostic reports match actual state
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4
   *
   * For any system state, the diagnostic info should accurately reflect the number
   * of registered extensions, status bar existence, and visibility
   */
  it("Property 8: Diagnostic reports match actual state", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 0,
          maxLength: 10,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          const uniqueExtensions = Array.from(new Set(extensionIds));

          // Register all extensions
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Get diagnostic info
          const diagnosticInfo = getDiagnosticInfo();

          // Verify activeExtensionCount matches actual count
          expect(diagnosticInfo.activeExtensionCount).toBe(
            getActiveExtensionCount()
          );
          expect(diagnosticInfo.activeExtensionCount).toBe(
            uniqueExtensions.length
          );

          // Verify registeredExtensions contains all and only the registered extensions
          expect(diagnosticInfo.registeredExtensions).toHaveLength(
            uniqueExtensions.length
          );
          for (const id of uniqueExtensions) {
            expect(diagnosticInfo.registeredExtensions).toContain(id);
          }

          // Verify statusBarExists matches actual state
          const actualStatusBar = getStatusBarItem();
          expect(diagnosticInfo.statusBarExists).toBe(
            actualStatusBar !== undefined
          );

          // Verify statusBarVisible matches expected state
          // Status bar should be visible if there are active extensions
          if (uniqueExtensions.length > 0) {
            expect(diagnosticInfo.statusBarVisible).toBe(true);
            expect(diagnosticInfo.statusBarExists).toBe(true);
          } else {
            expect(diagnosticInfo.statusBarVisible).toBe(false);
          }

          // Verify commandRegistered matches actual state
          const actualCommand = getCommandDisposable();
          expect(diagnosticInfo.commandRegistered).toBe(
            actualCommand !== undefined
          );

          // Command should be registered if there are active extensions
          if (uniqueExtensions.length > 0) {
            expect(diagnosticInfo.commandRegistered).toBe(true);
          } else {
            expect(diagnosticInfo.commandRegistered).toBe(false);
          }

          // Now unregister half of the extensions and verify again
          const halfPoint = Math.floor(uniqueExtensions.length / 2);
          for (let i = 0; i < halfPoint; i++) {
            unregisterExtension(uniqueExtensions[i]);
          }

          const diagnosticInfoAfterUnregister = getDiagnosticInfo();
          const expectedRemainingCount = uniqueExtensions.length - halfPoint;

          expect(diagnosticInfoAfterUnregister.activeExtensionCount).toBe(
            expectedRemainingCount
          );
          expect(
            diagnosticInfoAfterUnregister.registeredExtensions
          ).toHaveLength(expectedRemainingCount);

          // Verify visibility state after partial unregister
          if (expectedRemainingCount > 0) {
            expect(diagnosticInfoAfterUnregister.statusBarVisible).toBe(true);
            expect(diagnosticInfoAfterUnregister.commandRegistered).toBe(true);
          } else {
            expect(diagnosticInfoAfterUnregister.statusBarVisible).toBe(false);
            expect(diagnosticInfoAfterUnregister.commandRegistered).toBe(false);
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });
});
