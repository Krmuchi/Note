import { test, expect } from '@playwright/test'

test.describe('笔记应用功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('创建和编辑知识库', async ({ page }) => {
    // 创建知识库
    await page.click('[data-testid="create-notebook-btn"]')
    await page.fill('[data-testid="notebook-title-input"]', '测试知识库')
    await page.click('[data-testid="confirm-btn"]')
    
    // 验证知识库创建成功
    await expect(page.locator('[data-testid="notebook-list"]')).toContainText('测试知识库')
    
    // 编辑知识库标题
    await page.click('[data-testid="edit-notebook-btn"]')
    await page.fill('[data-testid="notebook-title-input"]', '更新后的知识库')
    await page.click('[data-testid="confirm-btn"]')
    
    await expect(page.locator('[data-testid="notebook-list"]')).toContainText('更新后的知识库')
  })

  test('创建和编辑文档', async ({ page }) => {
    // 先创建知识库
    await page.click('[data-testid="create-notebook-btn"]')
    await page.fill('[data-testid="notebook-title-input"]', '测试知识库')
    await page.click('[data-testid="confirm-btn"]')
    
    // 创建文档
    await page.click('[data-testid="create-doc-btn"]')
    await page.fill('[data-testid="doc-title-input"]', '测试文档')
    await page.fill('[data-testid="doc-content-textarea"]', '# Hello World\n\n这是测试内容')
    
    // 验证保存
    await page.waitForSelector('[data-testid="save-status"]:has-text("已保存")')
    
    // 验证文档内容
    await expect(page.locator('[data-testid="doc-title"]')).toContainText('测试文档')
  })

  test('搜索功能', async ({ page }) => {
    // 创建测试数据
    await page.click('[data-testid="create-notebook-btn"]')
    await page.fill('[data-testid="notebook-title-input"]', '测试知识库')
    await page.click('[data-testid="confirm-btn"]')
    
    await page.click('[data-testid="create-doc-btn"]')
    await page.fill('[data-testid="doc-title-input"]', 'JavaScript 入门')
    await page.fill('[data-testid="doc-content-textarea"]', 'JavaScript 是一种编程语言')
    
    // 搜索文档
    await page.click('[data-testid="search-btn"]')
    await page.fill('[data-testid="search-input"]', 'JavaScript')
    await page.press('[data-testid="search-input"]', 'Enter')
    
    // 验证搜索结果
    await expect(page.locator('[data-testid="search-results"]')).toContainText('JavaScript 入门')
  })

  test('标签管理', async ({ page }) => {
    // 创建标签
    await page.click('[data-testid="open-tag-panel-btn"]')
    await page.click('[data-testid="create-tag-btn"]')
    await page.fill('[data-testid="tag-name-input"]', '编程')
    await page.click('[data-testid="confirm-btn"]')
    
    // 验证标签创建成功
    await expect(page.locator('[data-testid="tag-list"]')).toContainText('编程')
  })

  test('收藏功能', async ({ page }) => {
    // 创建测试文档
    await page.click('[data-testid="create-notebook-btn"]')
    await page.fill('[data-testid="notebook-title-input"]', '测试知识库')
    await page.click('[data-testid="confirm-btn"]')
    
    await page.click('[data-testid="create-doc-btn"]')
    await page.fill('[data-testid="doc-title-input"]', '测试文档')
    
    // 切换收藏状态
    await page.click('[data-testid="favorite-btn"]')
    
    // 验证收藏成功
    await expect(page.locator('[data-testid="favorite-btn"]')).toHaveClass(/active/)
  })
})