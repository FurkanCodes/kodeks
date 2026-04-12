export type ExactMarkdownInlineToken =
  | {
      kind: 'image'
      alt: string
      target: string
    }
  | {
      kind: 'link'
      label: string
      target: string
    }

const MARKDOWN_LINK_EXACT_REGEX = /^\[([^\]]+)\]\(([^)]+)\)$/
const MARKDOWN_IMAGE_EXACT_REGEX = /^!\[([^\]]*)\]\(([^)]+)\)$/

export function parseExactMarkdownInlineToken(value: string): ExactMarkdownInlineToken | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const imageMatch = trimmed.match(MARKDOWN_IMAGE_EXACT_REGEX)
  if (imageMatch) {
    return {
      kind: 'image',
      alt: imageMatch[1] || 'Image',
      target: imageMatch[2] || '',
    }
  }

  const linkMatch = trimmed.match(MARKDOWN_LINK_EXACT_REGEX)
  if (linkMatch) {
    return {
      kind: 'link',
      label: linkMatch[1] || linkMatch[2] || '',
      target: linkMatch[2] || '',
    }
  }

  return null
}
