import * as fc from "fast-check";
import * as vscode from "vscode";
import {
  registerExtension,
  unregisterExtension,
  dispose,
  getCommandDisposable,
  getActiveExtensionCount,
  getStatusBarItem,
} from "./index";

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
});
