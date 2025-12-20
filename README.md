# VSCode Shared Status Bar

Shared status bar indicator for MCP ACS extensions. This package provides a unified status bar item that displays when any MCP ACS extension is active, showing a count of active extensions and providing quick access to extension information.

## Features

- **Unified Status Bar**: Single status bar item shared across all MCP ACS extensions
- **Active Extension Count**: Displays the number of currently active MCP extensions
- **Quick Pick Menu**: Click the status bar to see all registered extensions
- **Comprehensive Logging**: Optional logging to VS Code output channels for debugging
- **Diagnostic Tools**: Built-in diagnostics to troubleshoot visibility issues
- **Error Handling**: Graceful error handling with detailed error reporting

## Basic Usage

```typescript
import {
  registerExtension,
  unregisterExtension,
} from "@ai-capabilities-suite/vscode-shared-status-bar";

export function activate(context: vscode.ExtensionContext) {
  // Register your extension with the shared status bar
  registerExtension("my-extension-id");

  // Unregister when extension deactivates
  context.subscriptions.push({
    dispose: () => unregisterExtension("my-extension-id"),
  });
}
```

## Advanced Usage

### Enable Logging

To enable detailed logging for debugging, set an output channel:

```typescript
import {
  registerExtension,
  unregisterExtension,
  setOutputChannel,
} from "@ai-capabilities-suite/vscode-shared-status-bar";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Create or reuse an output channel
  const outputChannel = vscode.window.createOutputChannel("MCP ACS");

  // Enable logging to the output channel
  setOutputChannel(outputChannel);

  // Register your extension
  registerExtension("my-extension-id");

  context.subscriptions.push({
    dispose: () => unregisterExtension("my-extension-id"),
  });
}
```

The logging will capture:

- Extension registration and unregistration events
- Status bar creation and updates
- Visibility changes (show/hide)
- Errors with full details
- State verification results

### Use Diagnostic Command

Register a diagnostic command to troubleshoot status bar issues:

```typescript
import {
  registerExtension,
  unregisterExtension,
  getDiagnosticInfo,
} from "@ai-capabilities-suite/vscode-shared-status-bar";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  registerExtension("my-extension-id");

  // Register diagnostic command
  const diagnosticCommand = vscode.commands.registerCommand(
    "my-extension.diagnostics",
    () => {
      const info = getDiagnosticInfo();

      // Display diagnostic information
      const message = [
        `Active Extensions: ${info.activeExtensionCount}`,
        `Registered: ${info.registeredExtensions.join(", ")}`,
        `Status Bar Exists: ${info.statusBarExists}`,
        `Status Bar Visible: ${info.statusBarVisible}`,
        `Command Registered: ${info.commandRegistered}`,
        info.lastError ? `Last Error: ${info.lastError}` : "No errors",
      ].join("\n");

      vscode.window.showInformationMessage(
        `MCP Status Bar Diagnostics:\n${message}`
      );

      console.log("MCP Status Bar Diagnostics:", info);
    }
  );

  context.subscriptions.push(diagnosticCommand, {
    dispose: () => unregisterExtension("my-extension-id"),
  });
}
```

## API Reference

### Functions

#### `registerExtension(extensionId: string): void`

Registers an extension with the shared status bar. If this is the first extension to register, the status bar item will be created and shown.

**Parameters:**

- `extensionId` - Unique identifier for your extension

**Example:**

```typescript
registerExtension("mcp-debugger");
```

#### `unregisterExtension(extensionId: string): void`

Unregisters an extension from the shared status bar. If this is the last extension to unregister, the status bar item will be hidden.

**Parameters:**

- `extensionId` - Unique identifier for your extension

**Example:**

```typescript
unregisterExtension("mcp-debugger");
```

#### `setOutputChannel(channel: vscode.OutputChannel): void`

Sets an output channel for logging. Once set, all operations will be logged to this channel.

**Parameters:**

- `channel` - VS Code output channel for logging

**Example:**

```typescript
const outputChannel = vscode.window.createOutputChannel("MCP ACS");
setOutputChannel(outputChannel);
```

#### `getDiagnosticInfo(): DiagnosticInfo`

Returns diagnostic information about the current state of the shared status bar.

**Returns:**

```typescript
interface DiagnosticInfo {
  activeExtensionCount: number; // Number of registered extensions
  registeredExtensions: string[]; // Array of extension IDs
  statusBarExists: boolean; // Whether status bar item exists
  statusBarVisible: boolean; // Whether status bar is visible
  commandRegistered: boolean; // Whether command is registered
  lastError: string | null; // Last error that occurred, if any
}
```

**Example:**

```typescript
const info = getDiagnosticInfo();
console.log(`Active extensions: ${info.activeExtensionCount}`);
```

#### `dispose(): void`

Disposes all resources (status bar item and command). Called automatically when all extensions unregister.

#### `getStatusBarItem(): vscode.StatusBarItem | undefined`

Returns the status bar item instance, if it exists.

#### `getActiveExtensionCount(): number`

Returns the number of currently registered extensions.

#### `getCommandDisposable(): vscode.Disposable | undefined`

Returns the command disposable, if the command is registered.

## Troubleshooting

### Status Bar Not Appearing

If the status bar item is not appearing in VS Code, follow these steps:

1. **Enable Logging**

   ```typescript
   const outputChannel = vscode.window.createOutputChannel("MCP ACS Debug");
   setOutputChannel(outputChannel);
   ```

   Check the output channel (View → Output → Select "MCP ACS Debug") for error messages.

2. **Run Diagnostics**

   ```typescript
   const info = getDiagnosticInfo();
   console.log("Diagnostic Info:", info);
   ```

   Check the diagnostic output:

   - `activeExtensionCount` should be > 0
   - `statusBarExists` should be `true`
   - `statusBarVisible` should be `true`
   - `commandRegistered` should be `true`
   - `lastError` should be `null`

3. **Verify Extension Activation**

   - Ensure your extension's `activate()` function is being called
   - Check that `registerExtension()` is being called with a valid ID
   - Verify no errors are thrown during activation

4. **Check VS Code Version**

   - Ensure you're using a compatible VS Code version
   - The status bar API requires VS Code 1.50.0 or later

5. **Inspect Status Bar Item**

   ```typescript
   const statusBar = getStatusBarItem();
   if (statusBar) {
     console.log("Status bar text:", statusBar.text);
     console.log("Status bar tooltip:", statusBar.tooltip);
   } else {
     console.log("Status bar item does not exist");
   }
   ```

### Common Issues

#### Issue: Multiple registrations from the same extension

**Symptom:** Extension count is higher than expected

**Solution:** Ensure you only call `registerExtension()` once per extension activation. Duplicate registrations are handled gracefully (treated as a single registration), but it's best practice to register only once.

#### Issue: Status bar disappears unexpectedly

**Symptom:** Status bar shows briefly then disappears

**Solution:** Ensure `unregisterExtension()` is only called during extension deactivation, not during normal operation. Check that you're not accidentally disposing the extension registration.

#### Issue: Command not working when clicking status bar

**Symptom:** Clicking the status bar does nothing

**Solution:**

- Check diagnostic info to verify `commandRegistered` is `true`
- Look for command registration errors in the logs
- Ensure no other extension is conflicting with the command ID

#### Issue: Errors in logs

**Symptom:** `lastError` is not null in diagnostic info

**Solution:**

- Read the full error message from the logs
- Common errors:
  - **"Cannot create status bar item"**: VS Code API issue, try reloading window
  - **"Command already registered"**: Another extension may be using the same command ID
  - **"Cannot read property 'show' of undefined"**: Status bar item creation failed

### Debug Checklist

Use this checklist to systematically debug status bar issues:

- [ ] Extension activation function is called
- [ ] `registerExtension()` is called with correct extension ID
- [ ] Output channel is set and logs are visible
- [ ] Diagnostic info shows `activeExtensionCount > 0`
- [ ] Diagnostic info shows `statusBarExists = true`
- [ ] Diagnostic info shows `statusBarVisible = true`
- [ ] Diagnostic info shows `commandRegistered = true`
- [ ] Diagnostic info shows `lastError = null`
- [ ] Status bar item appears in VS Code status bar (bottom right)
- [ ] Clicking status bar shows quick pick menu
- [ ] Quick pick menu lists all registered extensions

## Architecture

### Singleton Pattern

The shared status bar implements a **singleton pattern** to ensure only one status bar item exists regardless of how many extensions are active. This prevents the "status bar doubling" bug where multiple status bar items could appear.

**Key Design Principles:**

1. **Single Instance**: Only one `statusBarItem` exists at any time
2. **Defensive Checks**: Explicit verification before creating status bar items
3. **Reuse Over Recreation**: Existing status bar items are reused, never duplicated
4. **Comprehensive Logging**: All lifecycle events are logged for debugging

**How It Works:**

```typescript
// When first extension registers:
// - Creates the singleton status bar item
// - Logs: "Creating status bar item"

// When subsequent extensions register:
// - Reuses the existing status bar item
// - Logs: "Reusing existing status bar item"

// When last extension unregisters:
// - Hides the status bar item (but doesn't dispose it)
// - Ready for next registration cycle
```

### Defensive Programming

The implementation includes several defensive checks to prevent bugs:

- **Pre-creation check**: Verifies status bar doesn't exist before creating
- **Post-creation verification**: Confirms creation succeeded
- **Safe unregistration**: Handles unregistering non-existent extensions gracefully
- **Idempotent operations**: Registration/unregistration can be called multiple times safely
- **Error isolation**: Each disposal operation is wrapped in try-catch

## Status Bar Behavior

### Visibility Rules

- **Shown**: When at least one extension is registered
- **Hidden**: When no extensions are registered
- **Updates**: Automatically updates when extensions register/unregister

### Status Bar Appearance

- **Text**: `$(layers) ACS` (uses VS Code codicon)
- **Tooltip**: `ACS Extensions (N active)` where N is the count
- **Position**: Right side of status bar
- **Priority**: 100

### Click Behavior

Clicking the status bar item shows a quick pick menu with:

- List of all registered extension IDs
- Allows users to see which MCP extensions are active

## Examples

### Complete Extension Integration

```typescript
import * as vscode from "vscode";
import {
  registerExtension,
  unregisterExtension,
  setOutputChannel,
  getDiagnosticInfo,
} from "@ai-capabilities-suite/vscode-shared-status-bar";

export function activate(context: vscode.ExtensionContext) {
  // Set up logging
  const outputChannel = vscode.window.createOutputChannel("MCP ACS Debugger");
  setOutputChannel(outputChannel);
  context.subscriptions.push(outputChannel);

  // Register with shared status bar
  registerExtension("mcp-debugger");

  // Register diagnostic command
  const diagnosticCommand = vscode.commands.registerCommand(
    "mcp-debugger.showStatusBarDiagnostics",
    () => {
      const info = getDiagnosticInfo();
      outputChannel.appendLine("=== Status Bar Diagnostics ===");
      outputChannel.appendLine(
        `Active Extensions: ${info.activeExtensionCount}`
      );
      outputChannel.appendLine(
        `Registered: ${info.registeredExtensions.join(", ")}`
      );
      outputChannel.appendLine(`Status Bar Exists: ${info.statusBarExists}`);
      outputChannel.appendLine(`Status Bar Visible: ${info.statusBarVisible}`);
      outputChannel.appendLine(`Command Registered: ${info.commandRegistered}`);
      outputChannel.appendLine(`Last Error: ${info.lastError || "None"}`);
      outputChannel.show();
    }
  );

  // Clean up on deactivation
  context.subscriptions.push(diagnosticCommand, {
    dispose: () => unregisterExtension("mcp-debugger"),
  });
}

export function deactivate() {
  // Cleanup is handled by dispose() in subscriptions
}
```

## License

MIT
