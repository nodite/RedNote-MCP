import { GhostCursor } from 'ghost-cursor'  // class export (createCursor is deprecated)
import type { Page } from 'rebrowser-playwright'

export class HumanMouse {
  private cursor: GhostCursor

  constructor(page: Page) {
    // GhostCursor expects a Puppeteer Page type, but Playwright's mouse API is structurally
    // compatible at runtime — the as any cast suppresses the type mismatch
    this.cursor = new GhostCursor(page as any)
  }

  async click(selector: string): Promise<void> {
    // Internally: page.$(selector) to locate element, then Bezier-curve mouse movement + click
    await this.cursor.click(selector)
  }

  async moveTo(x: number, y: number): Promise<void> {
    await this.cursor.moveTo({ x, y })
  }

  randomMove(): void {
    // toggleRandomMove is synchronous — enables continuous random drift during idle time
    this.cursor.toggleRandomMove(true)
  }
}
