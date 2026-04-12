import assert from 'node:assert/strict'
import test from 'node:test'
import { parseExactMarkdownInlineToken } from './messageMarkdown.ts'

test('parseExactMarkdownInlineToken parses skill markdown links cleanly', () => {
  assert.deepEqual(
    parseExactMarkdownInlineToken('[$critique](/Users/furkan/.agents/skills/critique/SKILL.md)'),
    {
      kind: 'link',
      label: '$critique',
      target: '/Users/furkan/.agents/skills/critique/SKILL.md',
    },
  )
})

test('parseExactMarkdownInlineToken trims wrapped markdown tokens', () => {
  assert.deepEqual(parseExactMarkdownInlineToken(' ![Screenshot](/tmp/demo.png) '), {
    kind: 'image',
    alt: 'Screenshot',
    target: '/tmp/demo.png',
  })
})

test('parseExactMarkdownInlineToken ignores plain inline text', () => {
  assert.equal(parseExactMarkdownInlineToken('review the current sidebar state'), null)
})
