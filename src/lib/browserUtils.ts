import type { InAppBrowserInspectEvent } from './kodeks'

export function normalizeBrowserUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function isLocalDevUrl(raw: string) {
  const normalized = normalizeBrowserUrl(raw)
  if (!normalized) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.toLowerCase()

    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
      return true
    }

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!ipv4) {
      return false
    }

    const [a, b, c, d] = ipv4.slice(1).map((value) => Number(value))
    if ([a, b, c, d].some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      return false
    }

    if (a === 10) {
      return true
    }
    if (a === 192 && b === 168) {
      return true
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true
    }

    return false
  } catch {
    return false
  }
}

function selectedElementLabel(payload: InAppBrowserInspectEvent) {
  return (payload.selector || payload.tag || 'selected element').trim() || 'selected element'
}

function normalizedTextSnippet(payload: InAppBrowserInspectEvent) {
  return (payload.textSnippet || '').trim() || '-'
}

export function buildBrowserInspectComposerDraft(payload: InAppBrowserInspectEvent) {
  const selectedElement = selectedElementLabel(payload)

  const lines = [
    'Inspect selection from in-app browser:',
    `Selected element to edit: ${selectedElement}`,
    `- URL: ${payload.pageUrl || '-'}`,
    `- Selector: ${payload.selector || '-'}`,
    `- Element: ${payload.tag || '-'}`,
    `- Text: ${normalizedTextSnippet(payload)}`,
    '',
    'Use this context to locate the element and apply the requested UI change.',
  ]

  return lines.join('\n')
}

export function buildBrowserInspectClipboardText(payload: InAppBrowserInspectEvent) {
  const selectedElement = selectedElementLabel(payload)
  return `Element: ${selectedElement}\nSelector: ${payload.selector || '-'}\nText: ${normalizedTextSnippet(payload)}\nURL: ${payload.pageUrl || '-'}`
}

export function buildBrowserInspectChatMessageText(payload: InAppBrowserInspectEvent) {
  const selectedElement = selectedElementLabel(payload)

  return [
    `Element selected in browser: ${selectedElement}`,
    `- Selector: ${payload.selector || '-'}`,
    `- Element: ${payload.tag || '-'}`,
    `- Text: ${normalizedTextSnippet(payload)}`,
    `- URL: ${payload.pageUrl || '-'}`,
  ].join('\n')
}
