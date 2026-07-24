import { describe, expect, it } from 'vitest'
import { safeFeishuErrorMessage } from './feishuErrorMessage'

describe('safeFeishuErrorMessage', () => {
  it('extracts nested API messages instead of rendering object coercion text', () => {
    expect(safeFeishuErrorMessage({
      message: 'Request failed with status code 400',
      response: { data: { code: 99991672, msg: 'Access denied' } },
    })).toBe('Request failed with status code 400（飞书错误 99991672: Access denied）')
    expect(safeFeishuErrorMessage({ error: { message: 'Permission is pending' } })).toBe('Permission is pending')
    expect(safeFeishuErrorMessage({ unexpected: true })).toBe('未知错误')
  })

  it('redacts secret-like values', () => {
    expect(safeFeishuErrorMessage(new Error('token abcdefghijklmnopqrstuvwxyz123456')))
      .toBe('token ***')
  })
})
