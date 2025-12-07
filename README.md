# VSCode Shared Status Bar

Shared status bar indicator for MCP ACS extensions.

## Usage

```typescript
import { registerExtension, unregisterExtension } from '@ai-capabilities-suite/vscode-shared-status-bar';

export function activate(context: vscode.ExtensionContext) {
  registerExtension('my-extension-id');
  context.subscriptions.push({ dispose: () => unregisterExtension('my-extension-id') });
}
```
