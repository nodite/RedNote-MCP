import { GetNoteDetail } from '../noteDetail'

jest.mock('playwright')
jest.mock('../../utils/logger')

// jest.requireMock at runtime: real playwright types don't export mockPage
const { mockPage } = jest.requireMock('playwright')

const mockNoteData = {
  title: '测试标题',
  content: '测试内容',
  tags: ['tag1', 'tag2'],
  author: '测试作者',
  imgs: ['https://img1.jpg'],
  videos: [],
  url: '',
  likes: 10000,
  comments: 500,
}

describe('GetNoteDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPage.waitForSelector.mockResolvedValue(undefined)
    mockPage.evaluate.mockResolvedValue(mockNoteData)
  })

  it('waits for .note-container selector', async () => {
    await GetNoteDetail(mockPage as any)
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.note-container')
  })

  it('waits for .media-container selector', async () => {
    await GetNoteDetail(mockPage as any)
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('.media-container')
  })

  it('returns object matching NoteDetail interface', async () => {
    const result = await GetNoteDetail(mockPage as any)
    expect(result).toMatchObject({
      title: '测试标题',
      content: '测试内容',
      tags: ['tag1', 'tag2'],
      author: '测试作者',
      imgs: ['https://img1.jpg'],
      videos: [],
      likes: 10000,
      comments: 500,
    })
  })

  it('returns url as empty string (caller sets url after)', async () => {
    const result = await GetNoteDetail(mockPage as any)
    expect(result.url).toBe('')
  })
})
