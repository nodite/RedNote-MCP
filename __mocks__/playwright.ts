const mockPage = {
  goto: jest.fn().mockResolvedValue(undefined),
  waitForSelector: jest.fn().mockResolvedValue(undefined),
  evaluate: jest.fn(),
  $: jest.fn().mockResolvedValue(null),
  $$: jest.fn().mockResolvedValue([]),
  $eval: jest.fn(),
  fill: jest.fn().mockResolvedValue(undefined),
  click: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  context: jest.fn().mockReturnValue({
    addCookies: jest.fn().mockResolvedValue(undefined),
  }),
}

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  addCookies: jest.fn().mockResolvedValue(undefined),
  cookies: jest.fn().mockResolvedValue([]),
  close: jest.fn().mockResolvedValue(undefined),
}

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
}

export const chromium = {
  launch: jest.fn().mockResolvedValue(mockBrowser),
}

export { mockPage, mockContext, mockBrowser }
