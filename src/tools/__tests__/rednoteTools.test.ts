import { RedNoteTools } from '../rednoteTools'

jest.mock('rebrowser-playwright')
jest.mock('../../utils/logger')

// jest.requireMock at runtime: real playwright types don't export mockPage/mockBrowser
const { mockPage, mockBrowser, mockContext } = jest.requireMock('rebrowser-playwright')

jest.mock('../../auth/authManager', () => {
  const { mockBrowser: mb } = jest.requireMock('rebrowser-playwright')
  return {
    AuthManager: jest.fn().mockImplementation(() => ({
      getBrowser: jest.fn().mockResolvedValue(mb),
      getCookies: jest.fn().mockResolvedValue([]),
    })),
  }
})

jest.mock('../noteDetail', () => ({
  GetNoteDetail: jest.fn().mockResolvedValue({
    title: '测试标题',
    content: '测试内容',
    tags: ['tag1'],
    author: '测试作者',
    imgs: [],
    videos: [],
    url: '',
    likes: 100,
    comments: 10,
  }),
}))

jest.mock('../../browser/browserFactory', () => ({
  BrowserFactory: {
    launch: jest.fn(),
    newStealthContext: jest.fn(),
  },
}))

jest.mock('../../browser/humanMouse', () => ({
  HumanMouse: jest.fn().mockImplementation(() => ({
    click: jest.fn().mockResolvedValue(undefined),
    moveTo: jest.fn().mockResolvedValue(undefined),
    randomMove: jest.fn(),
  })),
}))

const { HumanMouse: MockHumanMouse } = jest.requireMock('../../browser/humanMouse')

describe('RedNoteTools', () => {
  let tools: RedNoteTools

  beforeEach(() => {
    jest.clearAllMocks()
    const { BrowserFactory } = jest.requireMock('../../browser/browserFactory')
    BrowserFactory.newStealthContext.mockResolvedValue(mockContext)
    BrowserFactory.launch.mockResolvedValue(mockBrowser)
    mockContext.newPage.mockResolvedValue(mockPage)  // re-wire after clearAllMocks
    tools = new RedNoteTools()
  })

  describe('initialize', () => {
    it('succeeds when page.evaluate returns true (logged in)', async () => {
      mockPage.evaluate.mockResolvedValue(true)
      await expect(tools.initialize()).resolves.toBeUndefined()
    })

    it('throws "Not logged in" when page.evaluate returns false', async () => {
      mockPage.evaluate.mockResolvedValue(false)
      await expect(tools.initialize()).rejects.toThrow('Not logged in')
    })
  })

  describe('searchNotes', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      mockPage.evaluate.mockResolvedValue(true) // initialize() login check
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('returns notes array matching mock data', async () => {
      const mockNoteElement = { $: jest.fn().mockResolvedValue({}) }
      mockPage.$$.mockResolvedValue([mockNoteElement, mockNoteElement])
      mockPage.evaluate
        .mockResolvedValueOnce(true) // initialize login check
        .mockResolvedValue({
          title: '标题',
          content: '内容',
          url: 'https://example.com',
          author: '作者',
          likes: 100,
          collects: 50,
          comments: 20,
        })

      const resultPromise = tools.searchNotes('keyword')
      await jest.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ title: '标题', url: 'https://example.com', author: '作者' })

      const mouseInstance = MockHumanMouse.mock.results[0].value
      expect(mouseInstance.click).toHaveBeenCalledWith(expect.anything())
    })

    it('respects limit parameter', async () => {
      const fiveElements = Array.from({ length: 5 }, () => ({ $: jest.fn().mockResolvedValue({}) }))
      mockPage.$$.mockResolvedValue(fiveElements)
      mockPage.evaluate
        .mockResolvedValueOnce(true) // initialize login check
        .mockResolvedValue({ title: 't', content: 'c', url: 'u', author: 'a', likes: 0, collects: 0, comments: 0 })

      const resultPromise = tools.searchNotes('kw', 2)
      await jest.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toHaveLength(2)
    })
  })

  describe('getNoteContent', () => {
    it('returns NoteDetail with url set to original input', async () => {
      mockPage.evaluate.mockResolvedValue(true)

      const url = 'https://www.xiaohongshu.com/explore/test123'
      const result = await tools.getNoteContent(url)

      expect(mockPage.goto).toHaveBeenCalledWith(url)
      expect(result.url).toBe(url)
    })
  })

  describe('cleanup', () => {
    it('calls page.close, context.close, and browser.close after initialize', async () => {
      mockPage.evaluate.mockResolvedValue(true)
      await tools.initialize()

      jest.clearAllMocks()
      // Re-wire after clearAllMocks so cleanup() can still call close without errors
      mockPage.close.mockResolvedValue(undefined)
      mockContext.close.mockResolvedValue(undefined)
      mockBrowser.close.mockResolvedValue(undefined)
      await tools.cleanup()

      expect(mockPage.close).toHaveBeenCalledTimes(1)
      expect(mockContext.close).toHaveBeenCalledTimes(1)
      expect(mockBrowser.close).toHaveBeenCalledTimes(1)
    })
  })
})
