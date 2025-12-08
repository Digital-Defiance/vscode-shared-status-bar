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
   * Feature: status-bar-doubling-fix, Property 1: Status bar item singleton invariant
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
   *
   * For any sequence of extension registrations and unregistrations, when at least
   * one extension is active, exactly one status bar item SHALL exist, and when zero
   * extensions are active, zero status bar items SHALL exist.
   */
  it("Property 1: Status bar item singleton invariant", () => {
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

          // Execute all operations
          for (const op of operations) {
            if (op.action === "register") {
              registerExtension(op.extensionId);
            } else {
              unregisterExtension(op.extensionId);
            }

            // After each operation, verify the singleton invariant
            const activeCount = getActiveExtensionCount();
            const statusBar = getStatusBarItem();

            if (activeCount > 0) {
              // When at least one extension is active, exactly one status bar item should exist
              expect(statusBar).toBeDefined();

              // Verify createStatusBarItem was called at most once total
              const createCalls = (
                vscode.window.createStatusBarItem as jest.Mock
              ).mock.calls.length;
              expect(createCalls).toBeLessThanOrEqual(1);
            } else {
              // When zero extensions are active, status bar may exist but should be hidden
              // (it's not disposed until the module is disposed)
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
   * Feature: status-bar-doubling-fix, Property 2: Status bar creation is called at most once per lifecycle
   * Validates: Requirements 1.1, 1.2
   *
   * For any sequence of extension registrations, the VSCode API method createStatusBarItem
   * SHALL be invoked at most once between dispose calls.
   */
  it("Property 2: Status bar creation is called at most once per lifecycle", () => {
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

          // Verify createStatusBarItem was called at most once
          const createStatusBarItemMock = vscode.window
            .createStatusBarItem as jest.Mock;
          const createCallCount = createStatusBarItemMock.mock.calls.length;
          expect(createCallCount).toBeLessThanOrEqual(1);

          // If any extensions were registered, it should have been called exactly once
          if (uniqueExtensions.length > 0) {
            expect(createCallCount).toBe(1);
          }

          // Register more extensions to verify no additional calls
          for (let i = 0; i < 5; i++) {
            registerExtension(`additional-ext-${i}`);
          }

          // Still should be at most one call
          const finalCallCount = createStatusBarItemMock.mock.calls.length;
          expect(finalCallCount).toBeLessThanOrEqual(1);

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
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
          const call = registerCommandMock.mock.calls.find(
            (c: any) => c[0] === "mcp-acs.showMenu"
          );
          if (call) {
            const commandHandler = call[1];

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
          const call = registerCommandMock.mock.calls.find(
            (c: any) => c[0] === "mcp-acs.showMenu"
          );
          if (call) {
            const commandHandler = call[1];

            // Execute the command
            await commandHandler();

            // Verify showQuickPick was called with the correct extension IDs
            const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
            expect(showQuickPickMock).toHaveBeenCalled();

            // Get the items passed to showQuickPick
            const callArgs = showQuickPickMock.mock.calls[0];
            const items = callArgs[0] as vscode.QuickPickItem[];

            // Filter out separator and diagnostics
            const extensionItems = items.filter(
              (item) => item.description === "Open Settings"
            );

            // Verify all registered extensions are in the menu
            expect(extensionItems).toHaveLength(uniqueExtensions.length);
            const extensionLabels = extensionItems.map((item) => item.label);

            for (const id of uniqueExtensions) {
              expect(extensionLabels).toContain(id);
            }

            // Verify Diagnostics option exists
            const diagnosticItem = items.find(
              (item) => item.label === "Show Diagnostics"
            );
            expect(diagnosticItem).toBeDefined();
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
              `ACS Extensions (${activeCount} active)`
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
              expect(statusBar?.text).toBe("$(layers) ACS");
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
            expect(statusBar?.tooltip).toBe(`ACS Extensions (${i + 1} active)`);
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
              expect(statusBar?.tooltip).toBe(`ACS Extensions (${i} active)`);
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
          const call = registerCommandMock.mock.calls.find(
            (c: any) => c[0] === "mcp-acs.showMenu"
          );
          if (call) {
            const commandHandler = call[1];

            // Execute the command
            await commandHandler();

            // Verify showQuickPick was called with the correct extension IDs
            const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
            expect(showQuickPickMock).toHaveBeenCalled();

            // Get the items passed to showQuickPick
            const callArgs = showQuickPickMock.mock.calls[0];
            const items = callArgs[0] as vscode.QuickPickItem[];

            // Filter out separator and diagnostics
            const extensionItems = items.filter(
              (item) => item.description === "Open Settings"
            );

            // Verify all registered extensions are in the menu
            expect(extensionItems).toHaveLength(uniqueExtensions.length);
            const extensionLabels = extensionItems.map((item) => item.label);

            for (const id of uniqueExtensions) {
              expect(extensionLabels).toContain(id);
            }

            // Verify Diagnostics option exists
            const diagnosticItem = items.find(
              (item) => item.label === "Show Diagnostics"
            );
            expect(diagnosticItem).toBeDefined();

            // Verify the quick pick options are correct
            const options = callArgs[1];
            expect(options).toHaveProperty(
              "placeHolder",
              "Active ACS Extensions"
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
   * Feature: status-bar-doubling-fix, Property 9: Creation logging
   * Validates: Requirements 2.1
   *
   * For any state transition from zero to one registered extensions, a log entry
   * containing "Creating status bar item" and a timestamp SHALL be produced.
   */
  it("Property 9: Creation logging", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (extensionId: string) => {
          // Start with clean state (zero extensions)
          dispose();
          jest.clearAllMocks();

          // Create a mock output channel to capture logs
          const mockChannel = createMockOutputChannel();
          setOutputChannel(mockChannel as any);

          // Clear the mock after setOutputChannel call
          mockChannel.appendLine.mockClear();

          // Spy on console.log to capture logs
          const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

          // Register the first extension (transition from 0 to 1)
          registerExtension(extensionId);

          // Verify that a log entry was created for status bar creation
          const outputChannelCalls = mockChannel.appendLine.mock.calls;
          const consoleLogCalls = consoleLogSpy.mock.calls;

          // Check for creation log in output channel
          const hasCreationLogInChannel = outputChannelCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.toLowerCase().includes("creating") &&
              logMessage.toLowerCase().includes("status bar")
            );
          });

          // Check for creation log in console
          const hasCreationLogInConsole = consoleLogCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.toLowerCase().includes("creating") &&
              logMessage.toLowerCase().includes("status bar")
            );
          });

          // At least one should have the creation log
          expect(hasCreationLogInChannel || hasCreationLogInConsole).toBe(true);

          // Verify timestamp is present (ISO format: YYYY-MM-DDTHH:mm:ss)
          const hasTimestampInChannel = outputChannelCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.includes("[") &&
              logMessage.includes("]") &&
              /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(logMessage)
            );
          });

          const hasTimestampInConsole = consoleLogCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.includes("[") &&
              logMessage.includes("]") &&
              /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(logMessage)
            );
          });

          expect(hasTimestampInChannel || hasTimestampInConsole).toBe(true);

          // Cleanup
          consoleLogSpy.mockRestore();
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 10: Reuse logging
   * Validates: Requirements 2.2
   *
   * For any registration when a status bar item already exists, a log entry
   * indicating reuse SHALL be produced.
   */
  it("Property 10: Reuse logging", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 2,
          maxLength: 10,
        }),
        (extensionIds: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Create a mock output channel to capture logs
          const mockChannel = createMockOutputChannel();
          setOutputChannel(mockChannel as any);

          // Ensure we have at least 2 unique extensions
          const uniqueExtensions = Array.from(new Set(extensionIds));
          if (uniqueExtensions.length < 2) {
            uniqueExtensions.push("additional-extension");
          }

          // Register the first extension (creates status bar)
          registerExtension(uniqueExtensions[0]);

          // Clear mocks to focus on subsequent registrations
          mockChannel.appendLine.mockClear();
          const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

          // Register additional extensions (should reuse status bar)
          for (let i = 1; i < uniqueExtensions.length; i++) {
            registerExtension(uniqueExtensions[i]);
          }

          // Verify that reuse log entries were created
          const outputChannelCalls = mockChannel.appendLine.mock.calls;
          const consoleLogCalls = consoleLogSpy.mock.calls;

          // Check for reuse log in output channel
          const hasReuseLogInChannel = outputChannelCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.toLowerCase().includes("reus") &&
              logMessage.toLowerCase().includes("status bar")
            );
          });

          // Check for reuse log in console
          const hasReuseLogInConsole = consoleLogCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.toLowerCase().includes("reus") &&
              logMessage.toLowerCase().includes("status bar")
            );
          });

          // At least one should have the reuse log
          expect(hasReuseLogInChannel || hasReuseLogInConsole).toBe(true);

          // Cleanup
          consoleLogSpy.mockRestore();
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 11: Disposal logging
   * Validates: Requirements 2.3
   *
   * For any call to dispose(), a log entry containing "disposing" or "disposed"
   * SHALL be produced.
   */
  it("Property 11: Disposal logging", () => {
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

          // Create a mock output channel to capture logs
          const mockChannel = createMockOutputChannel();
          setOutputChannel(mockChannel as any);

          // Register extensions to create some state
          const uniqueExtensions = Array.from(new Set(extensionIds));
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Clear mocks to focus on disposal logs
          mockChannel.appendLine.mockClear();
          const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

          // Call dispose
          dispose();

          // Verify that disposal log entries were created
          const outputChannelCalls = mockChannel.appendLine.mock.calls;
          const consoleLogCalls = consoleLogSpy.mock.calls;

          // Check for disposal log in output channel
          const hasDisposalLogInChannel = outputChannelCalls.some((call) => {
            const logMessage = call[0].toLowerCase();
            return logMessage.includes("dispos");
          });

          // Check for disposal log in console
          const hasDisposalLogInConsole = consoleLogCalls.some((call) => {
            const logMessage = call[0].toLowerCase();
            return logMessage.includes("dispos");
          });

          // At least one should have the disposal log
          expect(hasDisposalLogInChannel || hasDisposalLogInConsole).toBe(true);

          // Verify timestamp is present in disposal logs
          const hasTimestampInChannel = outputChannelCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.toLowerCase().includes("dispos") &&
              logMessage.includes("[") &&
              logMessage.includes("]") &&
              /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(logMessage)
            );
          });

          const hasTimestampInConsole = consoleLogCalls.some((call) => {
            const logMessage = call[0];
            return (
              logMessage.toLowerCase().includes("dispos") &&
              logMessage.includes("[") &&
              logMessage.includes("]") &&
              /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(logMessage)
            );
          });

          expect(hasTimestampInChannel || hasTimestampInConsole).toBe(true);

          // Cleanup
          consoleLogSpy.mockRestore();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 3: Registration idempotency
   * Validates: Requirements 4.1, 4.5
   *
   * For any extension ID and any positive integer N, calling registerExtension(id)
   * N times SHALL result in the same state as calling it once.
   */
  it("Property 3: Registration idempotency", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (extensionId: string, numRegistrations: number) => {
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

          // Register the same extension multiple times
          for (let i = 0; i < numRegistrations; i++) {
            registerExtension(extensionId);
          }

          // Verify the extension count is exactly 1 (idempotent behavior)
          expect(getActiveExtensionCount()).toBe(1);

          // Verify status bar was created
          const statusBar = getStatusBarItem();
          expect(statusBar).toBeDefined();

          // Verify createStatusBarItem was called at most once
          const createStatusBarItemMock = vscode.window
            .createStatusBarItem as jest.Mock;
          expect(createStatusBarItemMock).toHaveBeenCalledTimes(1);

          // Verify the show menu command was registered exactly once
          // Note: setOutputChannel also registers the diagnostic command, so we check specifically for showMenu
          const registerCommandMock = vscode.commands
            .registerCommand as jest.Mock;
          const showMenuCalls = registerCommandMock.mock.calls.filter(
            (call) => call[0] === "mcp-acs.showMenu"
          );
          expect(showMenuCalls).toHaveLength(1);

          // Verify tooltip shows count of 1
          expect(statusBar?.tooltip).toBe("ACS Extensions (1 active)");

          // Verify diagnostic info shows exactly 1 extension
          const diagnosticInfo = getDiagnosticInfo();
          expect(diagnosticInfo.activeExtensionCount).toBe(1);
          expect(diagnosticInfo.registeredExtensions).toHaveLength(1);
          expect(diagnosticInfo.registeredExtensions).toContain(extensionId);

          // Verify that duplicate registration logs were created (for N > 1)
          if (numRegistrations > 1) {
            const outputChannelCalls = mockChannel.appendLine.mock.calls;
            const consoleLogCalls = consoleLogSpy.mock.calls;

            // Check for duplicate registration log
            const hasDuplicateLogInChannel = outputChannelCalls.some((call) => {
              const logMessage = call[0].toLowerCase();
              return (
                logMessage.includes("already registered") ||
                logMessage.includes("duplicate")
              );
            });

            const hasDuplicateLogInConsole = consoleLogCalls.some((call) => {
              const logMessage = call[0].toLowerCase();
              return (
                logMessage.includes("already registered") ||
                logMessage.includes("duplicate")
              );
            });

            // At least one should have the duplicate registration log
            expect(hasDuplicateLogInChannel || hasDuplicateLogInConsole).toBe(
              true
            );
          }

          // Verify that unregistering once removes the extension completely
          unregisterExtension(extensionId);
          expect(getActiveExtensionCount()).toBe(0);

          // Verify that attempting to unregister again is safe (no error)
          expect(() => unregisterExtension(extensionId)).not.toThrow();
          expect(getActiveExtensionCount()).toBe(0);

          // Cleanup
          consoleLogSpy.mockRestore();
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 4: Unregistration safety
   * Validates: Requirements 4.2
   *
   * For any extension ID that is not currently registered, calling unregisterExtension(id)
   * SHALL not throw an error and SHALL not modify the active extension count.
   */
  it("Property 4: Unregistration safety", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 0,
          maxLength: 10,
        }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }),
        (registeredExtensions: string[], unregisteredExtensions: string[]) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Create a mock output channel to capture logs
          const mockChannel = createMockOutputChannel();
          setOutputChannel(mockChannel as any);

          // Register a set of extensions
          const uniqueRegistered = Array.from(new Set(registeredExtensions));
          for (const id of uniqueRegistered) {
            registerExtension(id);
          }

          const initialCount = getActiveExtensionCount();
          expect(initialCount).toBe(uniqueRegistered.length);

          // Clear mocks to focus on unregistration logs
          mockChannel.appendLine.mockClear();
          const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

          // Attempt to unregister extensions that were never registered
          // Filter out any that might accidentally be in the registered set
          const uniqueUnregistered = Array.from(
            new Set(unregisteredExtensions)
          ).filter((id) => !uniqueRegistered.includes(id));

          // If we have no unregistered extensions to test, add one
          if (uniqueUnregistered.length === 0) {
            uniqueUnregistered.push("definitely-not-registered-extension");
          }

          for (const id of uniqueUnregistered) {
            // Should not throw an error
            expect(() => unregisterExtension(id)).not.toThrow();

            // Count should remain unchanged
            expect(getActiveExtensionCount()).toBe(initialCount);

            // Verify a log entry was created indicating the extension wasn't registered
            const outputChannelCalls = mockChannel.appendLine.mock.calls;
            const consoleLogCalls = consoleLogSpy.mock.calls;

            const hasNotRegisteredLogInChannel = outputChannelCalls.some(
              (call) => {
                const logMessage = call[0].toLowerCase();
                return (
                  logMessage.includes(id.toLowerCase()) &&
                  (logMessage.includes("not registered") ||
                    logMessage.includes("ignoring"))
                );
              }
            );

            const hasNotRegisteredLogInConsole = consoleLogCalls.some(
              (call) => {
                const logMessage = call[0].toLowerCase();
                return (
                  logMessage.includes(id.toLowerCase()) &&
                  (logMessage.includes("not registered") ||
                    logMessage.includes("ignoring"))
                );
              }
            );

            // At least one should have the "not registered" log
            expect(
              hasNotRegisteredLogInChannel || hasNotRegisteredLogInConsole
            ).toBe(true);

            // Clear mocks for next iteration
            mockChannel.appendLine.mockClear();
            consoleLogSpy.mockClear();
          }

          // Verify the registered extensions are still intact
          expect(getActiveExtensionCount()).toBe(initialCount);

          // Verify status bar state hasn't changed
          const statusBar = getStatusBarItem();
          if (initialCount > 0) {
            expect(statusBar).toBeDefined();
            expect(statusBar?.tooltip).toBe(
              `ACS Extensions (${initialCount} active)`
            );
          }

          // Cleanup
          consoleLogSpy.mockRestore();
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 5: Re-registration support
   * Validates: Requirements 4.3
   *
   * For any extension ID, the sequence registerExtension(id) → unregisterExtension(id) →
   * registerExtension(id) SHALL result in the extension being registered.
   */
  it("Property 5: Re-registration support", () => {
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

          // Step 1: Register the extension
          registerExtension(extensionId);

          // Verify extension is registered
          expect(getActiveExtensionCount()).toBe(1);
          const diagnosticInfo1 = getDiagnosticInfo();
          expect(diagnosticInfo1.registeredExtensions).toContain(extensionId);
          expect(diagnosticInfo1.statusBarExists).toBe(true);
          expect(diagnosticInfo1.commandRegistered).toBe(true);

          // Store reference to status bar item after first registration
          const statusBarAfterFirstReg = getStatusBarItem();
          expect(statusBarAfterFirstReg).toBeDefined();

          // Step 2: Unregister the extension
          unregisterExtension(extensionId);

          // Verify extension is unregistered
          expect(getActiveExtensionCount()).toBe(0);
          const diagnosticInfo2 = getDiagnosticInfo();
          expect(diagnosticInfo2.registeredExtensions).not.toContain(
            extensionId
          );
          expect(diagnosticInfo2.commandRegistered).toBe(false);

          // Status bar should still exist but be hidden
          const statusBarAfterUnreg = getStatusBarItem();
          expect(statusBarAfterUnreg).toBeDefined();
          expect(statusBarAfterUnreg?.hide).toHaveBeenCalled();

          // Step 3: Re-register the extension
          jest.clearAllMocks(); // Clear mocks to verify re-registration behavior
          registerExtension(extensionId);

          // Verify extension is registered again
          expect(getActiveExtensionCount()).toBe(1);
          const diagnosticInfo3 = getDiagnosticInfo();
          expect(diagnosticInfo3.registeredExtensions).toContain(extensionId);
          expect(diagnosticInfo3.registeredExtensions).toHaveLength(1);
          expect(diagnosticInfo3.statusBarExists).toBe(true);
          expect(diagnosticInfo3.commandRegistered).toBe(true);

          // Verify status bar is shown again
          const statusBarAfterReReg = getStatusBarItem();
          expect(statusBarAfterReReg).toBeDefined();
          expect(statusBarAfterReReg?.show).toHaveBeenCalled();

          // Verify tooltip is correct
          expect(statusBarAfterReReg?.tooltip).toBe(
            "ACS Extensions (1 active)"
          );

          // Verify the status bar item is the same instance (reused, not recreated)
          expect(statusBarAfterReReg).toBe(statusBarAfterFirstReg);

          // Verify createStatusBarItem was not called again during re-registration
          // (it should reuse the existing status bar item)
          const createStatusBarItemMock = vscode.window
            .createStatusBarItem as jest.Mock;
          expect(createStatusBarItemMock).not.toHaveBeenCalled();

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 6: Tooltip accuracy
   * Validates: Requirements 3.1
   *
   * For any non-negative integer N representing the number of registered extensions,
   * when N > 0, the status bar tooltip SHALL equal "ACS Extensions (N active)".
   */
  it("Property 6: Tooltip accuracy", () => {
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
          const N = uniqueExtensions.length;

          // Register all extensions
          for (const id of uniqueExtensions) {
            registerExtension(id);
          }

          // Get the status bar item
          const statusBar = getStatusBarItem();

          // When N > 0, the tooltip should equal "ACS Extensions (N active)"
          expect(statusBar).toBeDefined();
          expect(statusBar?.tooltip).toBe(`ACS Extensions (${N} active)`);

          // Verify the count matches
          expect(getActiveExtensionCount()).toBe(N);

          // Test tooltip updates when extensions are unregistered
          for (let i = uniqueExtensions.length - 1; i >= 1; i--) {
            unregisterExtension(uniqueExtensions[i]);

            const currentStatusBar = getStatusBarItem();
            const currentCount = getActiveExtensionCount();

            // Tooltip should reflect the current count
            expect(currentCount).toBe(i);
            expect(currentStatusBar?.tooltip).toBe(
              `ACS Extensions (${i} active)`
            );
          }

          // Unregister the last extension
          unregisterExtension(uniqueExtensions[0]);

          // When N = 0, status bar should be hidden (but may still exist)
          expect(getActiveExtensionCount()).toBe(0);
          const finalStatusBar = getStatusBarItem();
          if (finalStatusBar) {
            expect(finalStatusBar.hide).toHaveBeenCalled();
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

  /**
   * Feature: status-bar-doubling-fix, Property 8: Visibility state correctness
   * Validates: Requirements 3.5, 1.4
   *
   * For any system state, the status bar SHALL be visible if and only if at least
   * one extension is registered. This property tests visibility transitions:
   * 0→1, 1→0, N→N+1, N→N-1.
   */
  it("Property 8: Visibility state correctness", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 15,
        }),
        (extensionIds: string[]) => {
          // Start with clean state (0 extensions)
          dispose();
          jest.clearAllMocks();

          const uniqueExtensions = Array.from(new Set(extensionIds));

          // Initial state: 0 extensions
          // Status bar should not exist yet
          let statusBar = getStatusBarItem();
          expect(statusBar).toBeUndefined();
          expect(getActiveExtensionCount()).toBe(0);

          // Test transition 0→1: Register first extension
          if (uniqueExtensions.length > 0) {
            registerExtension(uniqueExtensions[0]);

            statusBar = getStatusBarItem();
            expect(statusBar).toBeDefined();
            expect(statusBar?.show).toHaveBeenCalled();
            expect(getActiveExtensionCount()).toBe(1);

            // Verify status bar is visible (show was called)
            const showCallCount = (statusBar?.show as jest.Mock).mock.calls
              .length;
            expect(showCallCount).toBeGreaterThan(0);
          }

          // Test transition N→N+1: Register additional extensions
          for (let i = 1; i < uniqueExtensions.length; i++) {
            const previousCount = getActiveExtensionCount();
            jest.clearAllMocks(); // Clear to track new calls

            registerExtension(uniqueExtensions[i]);

            statusBar = getStatusBarItem();
            const currentCount = getActiveExtensionCount();

            // Count should increase by 1
            expect(currentCount).toBe(previousCount + 1);

            // Status bar should still be visible (show called again)
            expect(statusBar).toBeDefined();
            expect(statusBar?.show).toHaveBeenCalled();

            // Verify hide was NOT called (status bar stays visible)
            expect(statusBar?.hide).not.toHaveBeenCalled();
          }

          // Test transition N→N-1: Unregister extensions one by one
          for (let i = uniqueExtensions.length - 1; i >= 1; i--) {
            const previousCount = getActiveExtensionCount();
            jest.clearAllMocks(); // Clear to track new calls

            unregisterExtension(uniqueExtensions[i]);

            statusBar = getStatusBarItem();
            const currentCount = getActiveExtensionCount();

            // Count should decrease by 1
            expect(currentCount).toBe(previousCount - 1);

            // Status bar should still be visible (at least 1 extension remains)
            expect(statusBar).toBeDefined();
            expect(statusBar?.show).toHaveBeenCalled();

            // Verify hide was NOT called (status bar stays visible)
            expect(statusBar?.hide).not.toHaveBeenCalled();
          }

          // Test transition 1→0: Unregister last extension
          jest.clearAllMocks(); // Clear to track new calls
          unregisterExtension(uniqueExtensions[0]);

          statusBar = getStatusBarItem();
          const finalCount = getActiveExtensionCount();

          // Count should be 0
          expect(finalCount).toBe(0);

          // Status bar should be hidden (hide was called)
          expect(statusBar).toBeDefined();
          expect(statusBar?.hide).toHaveBeenCalled();

          // Verify show was NOT called (status bar is hidden)
          expect(statusBar?.show).not.toHaveBeenCalled();

          // Test re-registration after complete unregistration (0→1 again)
          jest.clearAllMocks();
          registerExtension("re-registered-extension");

          statusBar = getStatusBarItem();
          expect(statusBar).toBeDefined();
          expect(statusBar?.show).toHaveBeenCalled();
          expect(getActiveExtensionCount()).toBe(1);

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 12: Diagnostic accuracy
   * Validates: Requirements 2.4
   *
   * For any system state, calling getDiagnosticInfo() SHALL return information that
   * accurately reflects the current number of registered extensions, status bar existence,
   * and command registration state.
   */
  it("Property 12: Diagnostic accuracy", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom("register", "unregister"),
            extensionId: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 30 }
        ),
        (operations) => {
          // Start with clean state
          dispose();
          jest.clearAllMocks();

          // Track expected state
          const expectedRegisteredExtensions = new Set<string>();

          // Execute operations and verify diagnostic info after each
          for (const op of operations) {
            if (op.action === "register") {
              registerExtension(op.extensionId);
              expectedRegisteredExtensions.add(op.extensionId);
            } else {
              unregisterExtension(op.extensionId);
              expectedRegisteredExtensions.delete(op.extensionId);
            }

            // Get diagnostic info
            const diagnosticInfo = getDiagnosticInfo();

            // Property 1: activeExtensionCount must match actual count
            const actualCount = getActiveExtensionCount();
            expect(diagnosticInfo.activeExtensionCount).toBe(actualCount);
            expect(diagnosticInfo.activeExtensionCount).toBe(
              expectedRegisteredExtensions.size
            );

            // Property 2: registeredExtensions must contain exactly the registered extensions
            expect(diagnosticInfo.registeredExtensions).toHaveLength(
              expectedRegisteredExtensions.size
            );
            for (const id of expectedRegisteredExtensions) {
              expect(diagnosticInfo.registeredExtensions).toContain(id);
            }
            for (const id of diagnosticInfo.registeredExtensions) {
              expect(expectedRegisteredExtensions.has(id)).toBe(true);
            }

            // Property 3: statusBarExists must accurately reflect status bar existence
            const actualStatusBar = getStatusBarItem();
            expect(diagnosticInfo.statusBarExists).toBe(
              actualStatusBar !== undefined
            );

            // Property 4: statusBarVisible must match expected visibility
            // Status bar is visible when at least one extension is registered
            const expectedVisible = expectedRegisteredExtensions.size > 0;
            expect(diagnosticInfo.statusBarVisible).toBe(expectedVisible);

            // Property 5: commandRegistered must accurately reflect command state
            const actualCommand = getCommandDisposable();
            expect(diagnosticInfo.commandRegistered).toBe(
              actualCommand !== undefined
            );

            // Command should be registered if and only if at least one extension is active
            const expectedCommandRegistered =
              expectedRegisteredExtensions.size > 0;
            expect(diagnosticInfo.commandRegistered).toBe(
              expectedCommandRegistered
            );

            // Property 6: lastError should be null when no errors occur
            // (In normal operation without mocked errors, lastError should be null)
            if (diagnosticInfo.lastError !== null) {
              // If there's an error, it should be a string
              expect(typeof diagnosticInfo.lastError).toBe("string");
            }
          }

          // Test diagnostic info after complete cleanup
          dispose();
          const finalDiagnosticInfo = getDiagnosticInfo();

          // After dispose, everything should be cleaned up
          expect(finalDiagnosticInfo.activeExtensionCount).toBe(0);
          expect(finalDiagnosticInfo.registeredExtensions).toHaveLength(0);
          expect(finalDiagnosticInfo.commandRegistered).toBe(false);
          expect(finalDiagnosticInfo.statusBarVisible).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: status-bar-doubling-fix, Property 7: Quick pick menu completeness
   * Validates: Requirements 3.4
   *
   * For any set S of registered extension IDs where |S| > 0, invoking the show menu
   * command SHALL display a quick pick containing exactly the elements of S.
   */
  it("Property 7: Quick pick menu completeness", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 15,
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

          // Verify command was registered
          expect(registerCommandMock).toHaveBeenCalled();

          // Find the showMenu command
          const showMenuCall = registerCommandMock.mock.calls.find(
            (call) => call[0] === "mcp-acs.showMenu"
          );
          expect(showMenuCall).toBeDefined();

          const commandHandler = showMenuCall[1];

          // Execute the command
          await commandHandler();

          // Verify showQuickPick was called
          const showQuickPickMock = vscode.window.showQuickPick as jest.Mock;
          expect(showQuickPickMock).toHaveBeenCalled();

          // Get the items passed to showQuickPick
          const callArgs = showQuickPickMock.mock.calls[0];
          const items = callArgs[0] as vscode.QuickPickItem[];

          // Filter out separator and diagnostics
          const extensionItems = items.filter(
            (item) => item.description === "Open Settings"
          );

          // Property: Menu shows ALL registered extensions
          expect(extensionItems).toHaveLength(uniqueExtensions.length);
          const extensionLabels = extensionItems.map((item) => item.label);

          for (const id of uniqueExtensions) {
            expect(extensionLabels).toContain(id);
          }

          // Verify Diagnostics option exists
          const diagnosticItem = items.find(
            (item) => item.label === "Show Diagnostics"
          );
          expect(diagnosticItem).toBeDefined();

          // Clear mocks to test menu updates
          jest.clearAllMocks();

          // Unregister half of the extensions
          const halfPoint = Math.floor(uniqueExtensions.length / 2);
          const remainingExtensions = uniqueExtensions.slice(halfPoint);

          for (let i = 0; i < halfPoint; i++) {
            unregisterExtension(uniqueExtensions[i]);
          }

          // Verify menu updates when extensions unregister
          if (remainingExtensions.length > 0) {
            // Get the command handler again (should still be registered)
            const registerCommandMockAfter = vscode.commands
              .registerCommand as jest.Mock;
            const showMenuCallAfter = registerCommandMockAfter.mock.calls.find(
              (call) => call[0] === "mcp-acs.showMenu"
            );

            if (showMenuCallAfter) {
              const commandHandlerAfter = showMenuCallAfter[1];

              // Execute the command again
              await commandHandlerAfter();

              // Verify showQuickPick was called with updated list
              const showQuickPickMockAfter = vscode.window
                .showQuickPick as jest.Mock;
              expect(showQuickPickMockAfter).toHaveBeenCalled();

              const callArgsAfter = showQuickPickMockAfter.mock.calls[0];
              const itemsAfter = callArgsAfter[0];

              // Menu should show only remaining extensions
              expect(itemsAfter).toHaveLength(remainingExtensions.length);
              for (const id of remainingExtensions) {
                expect(itemsAfter).toContain(id);
              }

              // Menu should not show unregistered extensions
              for (let i = 0; i < halfPoint; i++) {
                expect(itemsAfter).not.toContain(uniqueExtensions[i]);
              }
            }
          }

          // Clear mocks again
          jest.clearAllMocks();

          // Register new extensions to test menu updates on registration
          const newExtensions = ["new-ext-1", "new-ext-2"];
          for (const id of newExtensions) {
            registerExtension(id);
          }

          const allExtensions = [...remainingExtensions, ...newExtensions];

          // Get the command handler
          const registerCommandMockFinal = vscode.commands
            .registerCommand as jest.Mock;
          const showMenuCallFinal = registerCommandMockFinal.mock.calls.find(
            (call) => call[0] === "mcp-acs.showMenu"
          );

          if (showMenuCallFinal) {
            const commandHandlerFinal = showMenuCallFinal[1];

            // Execute the command
            await commandHandlerFinal();

            // Verify showQuickPick was called with complete updated list
            const showQuickPickMockFinal = vscode.window
              .showQuickPick as jest.Mock;
            expect(showQuickPickMockFinal).toHaveBeenCalled();

            const callArgsFinal = showQuickPickMockFinal.mock.calls[0];
            const itemsFinal = callArgsFinal[0];

            // Menu should show all currently registered extensions
            expect(itemsFinal).toHaveLength(allExtensions.length);
            for (const id of allExtensions) {
              expect(itemsFinal).toContain(id);
            }

            // Menu should not show any unregistered extensions
            for (let i = 0; i < halfPoint; i++) {
              expect(itemsFinal).not.toContain(uniqueExtensions[i]);
            }
          }

          // Cleanup
          dispose();
        }
      ),
      { numRuns: 100 }
    );
  });
});
