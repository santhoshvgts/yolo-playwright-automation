
class BasePage {
  constructor(page) {
    this.page = page;
  }

  async navigate(url, options = { waitUntil: 'networkidle', timeout: 100000000 }) {
    if (!url) {
      throw new Error('URL is undefined. Check BASE_URL in .env file');
    }
    await this.page.goto(url, options);
  }

  async waitForTimeout(ms) {
    await this.page.waitForTimeout(ms);
  }
}

module.exports = { BasePage };
