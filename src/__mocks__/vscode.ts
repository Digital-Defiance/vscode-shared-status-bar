export const window = {
  createStatusBarItem: jest.fn(() => ({
    text: "",
    tooltip: "",
    command: "",
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
};

export const StatusBarAlignment = {
  Right: 2,
  Left: 1,
};
