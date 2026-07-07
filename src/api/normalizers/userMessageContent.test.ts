import { describe, expect, it } from 'vitest'
import {
  buildUserMessageContentMessages,
  extractCodexUserRequestText,
  parseUserMessageContent,
} from './userMessageContent'

describe('userMessageContent normalizer', () => {
  it('extracts the final Codex request section from pasted prompt wrappers', () => {
    expect(extractCodexUserRequestText([
      '# Files mentioned by the user:',
      '',
      '## screenshot.png',
      '',
      '## My request for Codex:',
      '真正的需求',
    ].join('\n'))).toBe('真正的需求')
  })

  it('normalizes text, images, skills, and unhandled blocks consistently', () => {
    const parsed = parseUserMessageContent('user-1', [
      { type: 'text', text: 'First line', text_elements: [] },
      { type: 'localImage', path: '/tmp/a b.png' },
      { type: 'image', url: ' https://example.com/image.png ' },
      { type: 'skill', name: ' browser ', path: ' /skills/browser ' },
      { type: 'custom', value: 42 },
    ])

    expect(parsed).toMatchObject({
      text: 'First line',
      images: [
        '/codex-api/local-image?path=%2Ftmp%2Fa%20b.png',
        'https://example.com/image.png',
      ],
      skills: [
        {
          name: 'browser',
          path: '/skills/browser',
          displayName: 'browser',
          description: '',
        },
      ],
    })
    expect(parsed.rawBlocks).toHaveLength(1)
    expect(parsed.rawBlocks[0]).toMatchObject({
      id: 'user-1:user-content:4',
      role: 'user',
      messageType: 'userContent.custom',
      isUnhandled: true,
    })
  })

  it('builds renderable user messages before raw fallback blocks', () => {
    const messages = buildUserMessageContentMessages('user-1', [
      { type: 'text', text: 'hello', text_elements: [] },
      { type: 'unknown' },
    ])

    expect(messages.map((message) => message.id)).toEqual([
      'user-1',
      'user-1:user-content:1',
    ])
    expect(messages[0]).toMatchObject({
      role: 'user',
      text: 'hello',
      messageType: 'userMessage',
    })
  })
})
