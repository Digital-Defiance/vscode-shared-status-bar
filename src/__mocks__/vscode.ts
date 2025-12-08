export const window = {
  createStatusBarItem: jest.fn(() => ({
    text: "",
    tooltip: "",
    command: "",
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
  showQuickPick: jest.fn(() => Promise.resolve(undefined)),
  showErrorMessage: jest.fn(() => Promise.resolve(undefined)),
  showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
};

export const commands = {
  registerCommand: jest.fn((command: string, callback: () => void) => ({
    dispose: jest.fn(),
  })),
};

export const StatusBarAlignment = {
  Right: 2,
  Left: 1,
};

export const QuickPickItemKind = {
  Separator: -1,
  Default: 0,
};

export interface OutputChannel {
  appendLine: jest.Mock;
  dispose: jest.Mock;
  show: jest.Mock;
}

export function createMockOutputChannel(): OutputChannel {
  return {
    appendLine: jest.fn(),
    dispose: jest.fn(),
    show: jest.fn(),
  };
}
