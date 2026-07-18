import * as Lark from '@larksuiteoapi/node-sdk'

/**
 * Resolve the Open Platform Web-session email to the new application's own
 * app-scoped open_id. An open_id from another application is not reusable.
 */
export async function resolveFeishuOwnerOpenId(input: {
  appId: string
  appSecret: string
  email: string
}, createClient: (appId: string, appSecret: string) => { batchGetId: (input: unknown) => Promise<unknown> } = (appId, appSecret) => {
  const client = new Lark.Client({ appId, appSecret })
  return { batchGetId: (value) => (client as any).contact.v3.user.batchGetId(value) }
}): Promise<string> {
  const email = input.email.trim()
  if (!email) throw new Error('扫码账号没有可用于确认机器人的企业邮箱，请手动填写至少一个用户 Open ID')
  const client = createClient(input.appId, input.appSecret)
  let response: any
  try {
    response = await client.batchGetId({
      params: { user_id_type: 'open_id' },
      data: { emails: [email], include_resigned: false },
    })
  } catch (error) {
    throw new Error(`无法用新应用确认扫码者身份: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (response?.code !== 0) {
    throw new Error(`无法用新应用确认扫码者身份: code=${String(response?.code ?? 'unknown')} ${String(response?.msg ?? '')}`)
  }
  const users = Array.isArray(response?.data?.user_list) ? response.data.user_list : []
  const owner = users.find((item: any) => typeof item?.user_id === 'string' && item.user_id.startsWith('ou_'))
  if (!owner?.user_id) throw new Error(`飞书企业中没有找到扫码账号邮箱 ${email}，机器人保持禁用`)
  return owner.user_id
}
