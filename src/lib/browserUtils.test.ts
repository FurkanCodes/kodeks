import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBrowserInspectClipboardText,
  buildBrowserInspectChatMessageText,
  buildBrowserInspectComposerDraft,
  isLocalDevUrl,
  normalizeBrowserUrl,
} from './browserUtils.ts'

test('normalizeBrowserUrl accepts valid http/https URLs', () => {
  assert.equal(normalizeBrowserUrl('http://localhost:5173'), 'http://localhost:5173/')
  assert.equal(normalizeBrowserUrl('https://example.com/docs'), 'https://example.com/docs')
})

test('normalizeBrowserUrl rejects invalid or unsupported URLs', () => {
  assert.equal(normalizeBrowserUrl(''), null)
  assert.equal(normalizeBrowserUrl('file:///tmp/index.html'), null)
  assert.equal(normalizeBrowserUrl('localhost:3000'), null)
})

test('isLocalDevUrl matches loopback and private networks', () => {
  assert.equal(isLocalDevUrl('http://localhost:3000'), true)
  assert.equal(isLocalDevUrl('http://127.0.0.1:5173'), true)
  assert.equal(isLocalDevUrl('http://192.168.0.24:8080'), true)
  assert.equal(isLocalDevUrl('http://172.20.10.2:4173'), true)
  assert.equal(isLocalDevUrl('http://10.0.0.8:3000'), true)
})

test('isLocalDevUrl rejects public domains', () => {
  assert.equal(isLocalDevUrl('https://example.com'), false)
  assert.equal(isLocalDevUrl('https://openai.com'), false)
})

test('buildBrowserInspectComposerDraft includes selector and URL context', () => {
  const draft = buildBrowserInspectComposerDraft({
    pageUrl: 'http://localhost:5173/',
    selector: 'h1.hero-title',
    tag: 'h1',
    id: null,
    className: 'hero-title',
    textSnippet: 'Hello world',
    timestamp: Date.now(),
  })

  assert.ok(draft.includes('Selected element to edit: h1.hero-title'))
  assert.ok(draft.includes('- URL: http://localhost:5173/'))
  assert.ok(draft.includes('- Selector: h1.hero-title'))
  assert.ok(draft.includes('- Element: h1'))
  assert.ok(draft.includes('- Text: Hello world'))
  assert.ok(!draft.includes('Component chain'))
})

test('buildBrowserInspectClipboardText returns compact element summary', () => {
  const text = buildBrowserInspectClipboardText({
    pageUrl: 'http://localhost:5173/',
    selector: 'button.primary',
    tag: 'button',
    textSnippet: 'Save',
  })

  assert.ok(text.includes('Element: button.primary'))
  assert.ok(text.includes('Selector: button.primary'))
  assert.ok(text.includes('Text: Save'))
  assert.ok(text.includes('URL: http://localhost:5173/'))
  assert.ok(!text.includes('Component:'))
})

test('buildBrowserInspectChatMessageText includes only hunt element context', () => {
  const text = buildBrowserInspectChatMessageText({
    pageUrl: 'http://localhost:5173/',
    selector: 'button.primary',
    tag: 'button',
    textSnippet: 'Save',
  })

  assert.ok(text.includes('Element selected in browser: button.primary'))
  assert.ok(text.includes('- Selector: button.primary'))
  assert.ok(text.includes('- Element: button'))
  assert.ok(text.includes('- Text: Save'))
  assert.ok(text.includes('- URL: http://localhost:5173/'))
  assert.ok(!text.includes('Component chain'))
})

test('buildBrowserInspectComposerDraft includes React component context when present', () => {
  const draft = buildBrowserInspectComposerDraft({
    pageUrl: 'http://localhost:5173/',
    selector: 'div.card',
    tag: 'div',
    textSnippet: 'Revenue',
    reactComponentName: 'StatCard',
    reactComponentChain: ['StatCard', 'Home', 'ClientPageRoot'],
    reactComponentSource: 'src/components/StatCard.tsx',
  })

  assert.ok(draft.includes('- Component: StatCard'))
  assert.ok(draft.includes('- Component chain: StatCard > Home > ClientPageRoot'))
  assert.ok(draft.includes('- Component file: src/components/StatCard.tsx'))
})

test('buildBrowserInspectClipboardText includes React component context when present', () => {
  const text = buildBrowserInspectClipboardText({
    pageUrl: 'http://localhost:5173/',
    selector: 'div.card',
    tag: 'div',
    textSnippet: 'Revenue',
    reactComponentName: 'StatCard',
    reactComponentChain: ['StatCard', 'Home', 'ClientPageRoot'],
    reactComponentSource: 'src/components/StatCard.tsx',
  })

  assert.ok(text.includes('Component: StatCard'))
  assert.ok(text.includes('Component chain: StatCard > Home > ClientPageRoot'))
  assert.ok(text.includes('Component file: src/components/StatCard.tsx'))
})

test('buildBrowserInspectChatMessageText includes React component context when present', () => {
  const text = buildBrowserInspectChatMessageText({
    pageUrl: 'http://localhost:5173/',
    selector: 'div.card',
    tag: 'div',
    textSnippet: 'Revenue',
    reactComponentName: 'StatCard',
    reactComponentChain: ['StatCard', 'Home', 'ClientPageRoot'],
    reactComponentSource: 'src/components/StatCard.tsx',
  })

  assert.ok(text.includes('- Component: StatCard'))
  assert.ok(text.includes('- Component chain: StatCard > Home > ClientPageRoot'))
  assert.ok(text.includes('- Component file: [StatCard.tsx](src/components/StatCard.tsx)'))
})
