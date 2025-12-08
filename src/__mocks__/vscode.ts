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
