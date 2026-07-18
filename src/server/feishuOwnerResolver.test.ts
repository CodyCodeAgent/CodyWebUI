import { describe, expect, it, vi } from 'vitest'
import { resolveFeishuOwnerOpenId } from './feishuOwnerResolver'

describe('Feishu owner resolution', () => {
  it('resolves the scanner email to this application\'s open_id', async () => {
    const batchGetId = vi.fn(async () => ({
      code: 0, data: { user_list: [{ user_id: 'ou_owner' }] },
    }))
    await expect(resolveFeishuOwnerOpenId({
      appId: 'cli_app', appSecret: 'secret', email: 'owner@example.com',
    }, () => ({ batchGetId }))).resolves.toBe('ou_owner')
    expect(batchGetId).toHaveBeenCalledWith({
      params: { user_id_type: 'open_id' },
      data: { emails: ['owner@example.com'], include_resigned: false },
    })
  })

  it('fails closed when the scanner cannot be confirmed in the tenant', async () => {
    await expect(resolveFeishuOwnerOpenId({
      appId: 'cli_app', appSecret: 'secret', email: 'outside@example.com',
    }, () => ({ batchGetId: vi.fn(async () => ({ code: 0, data: { user_list: [] } })) })))
      .rejects.toThrow('机器人保持禁用')
  })

  it('does not accept an empty scanner email as an open access policy', async () => {
    await expect(resolveFeishuOwnerOpenId({ appId: 'cli_app', appSecret: 'secret', email: '' }, () => ({
      batchGetId: vi.fn(),
    }))).rejects.toThrow('至少一个用户 Open ID')
  })
})
