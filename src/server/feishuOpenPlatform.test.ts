/**
 * Unit tests for Open Platform setup automation helpers.
 *
 * Run: pnpm vitest run test/setup-open-platform-automation.test.ts
 */
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  automateOpenPlatformSetup,
  clearStoredFeishuOpenPlatformSession,
  codyFeishuSessionFilePath,
  buildFeishuQrPayload,
  buildSafeSettingPayload,
  buildScopeUpdatePayload,
  createFeishuOpenPlatformApp,
  configureOfficialFeishuOpenPlatformApp,
  disableCachedFeishuOpenPlatformApp,
  disableFeishuOpenPlatformAppWithCredentials,
  extractOpenPlatformCsrfToken,
  extractOpenPlatformSessionIdentity,
  extractOpenPlatformScopeEntries,
  getCookieHeader,
  mapFeishuQrPollingStatus,
  mapManifestScopesToOpenPlatformIds,
  parseOpenPlatformOnlineVisibility,
  parseSetupOpenPlatformAutoFlag,
  prepareFeishuWebSession,
  registerOfficialFeishuOpenPlatformApp,
  readStoredCookiesFromSessionFile,
  type StoredCookie,
  vcListenerEventGateError,
  writeStoredCookiesToSessionFile,
} from './feishuOpenPlatform.js';

function cookie(overrides: Partial<StoredCookie> = {}): StoredCookie {
  return {
    name: 'session',
    value: 'secret-cookie-value',
    domain: '.feishu.cn',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

const openPlatformPage = (csrf = 'csrf_create') => `<script>
window.csrfToken="${csrf}";
window.user={"id":"u_1","name":"Alice","email":"alice@example.com","tenantId":"t_1","tenantName":"Example","tenantDisplayName":{"value":"Example"}};
</script>`;

/**
 * 有状态的事件/回调订阅 mock:read 返回当前订阅,operation:add 增量写入,
 * 与开放平台 console 的增量契约同形。automateOpenPlatformSetup 现在会回读
 * 确认核心事件/回调,mock 不落库就会 fail-closed。
 */
function openPlatformSubscriptionMock(appId: string, opts: {
  failEventUpdate?: boolean;
  failCallbackUpdate?: boolean;
  /** callback/switch 直接报错。 */
  failCallbackSwitch?: boolean;
  /** callback/switch 返回成功但 mode 实际不变(回读兜底用例)。 */
  callbackSwitchNoop?: boolean;
  /** event/update 中包含这些事件时整批被拒(逐个重试时对应单个失败)。 */
  rejectEventNames?: string[];
  initial?: { appEvents?: string[]; userEvents?: string[]; callbacks?: string[]; callbackMode?: number; eventMode?: number };
} = {}) {
  const state = {
    eventMode: opts.initial?.eventMode ?? 4,
    appEvents: [...(opts.initial?.appEvents ?? [])],
    userEvents: [...(opts.initial?.userEvents ?? [])],
    callbackMode: opts.initial?.callbackMode ?? 1,
    callbacks: [...(opts.initial?.callbacks ?? [])],
  };
  const updateBodies: Array<Record<string, unknown>> = [];
  const handle = (href: string, init?: RequestInit): Response | null => {
    if (href.endsWith(`/developers/v1/visible/online/${appId}`)) {
      return Response.json({
        code: 0,
        data: {
          whiteList: { departments: [], groups: [], members: [{ id: 'u_creator' }], isAll: 0 },
          blackList: { departments: [], groups: [], members: [], isAll: 0 },
        },
      });
    }
    if (href.endsWith(`/developers/v1/event/update/${appId}`)) {
      const body = JSON.parse(String(init?.body));
      updateBodies.push(body);
      const requested: string[] = [...(body.appEvents ?? []), ...(body.userEvents ?? [])];
      if (opts.failEventUpdate || requested.some(name => (opts.rejectEventNames ?? []).includes(name))) {
        return Response.json({ code: 1, msg: 'event update rejected' });
      }
      state.appEvents.push(...(body.appEvents ?? []));
      state.userEvents.push(...(body.userEvents ?? []));
      return Response.json({ code: 0 });
    }
    if (href.endsWith(`/developers/v1/event/${appId}`)) {
      return Response.json({
        code: 0,
        data: {
          eventMode: state.eventMode,
          events: [...state.appEvents, ...state.userEvents],
          appEventDetails: [{ items: state.appEvents.map(id => ({ id })) }],
          userEventDetails: [{ items: state.userEvents.map(id => ({ id })) }],
        },
      });
    }
    if (href.endsWith(`/developers/v1/callback/switch/${appId}`)) {
      if (opts.failCallbackSwitch) return Response.json({ code: 1, msg: 'callback switch rejected' });
      const body = JSON.parse(String(init?.body));
      if (!opts.callbackSwitchNoop) state.callbackMode = body.callbackMode;
      return Response.json({ code: 0 });
    }
    if (href.endsWith(`/developers/v1/callback/update/${appId}`)) {
      const body = JSON.parse(String(init?.body));
      updateBodies.push(body);
      if (opts.failCallbackUpdate) return Response.json({ code: 1, msg: 'callback update rejected' });
      state.callbacks.push(...(body.callbacks ?? []));
      return Response.json({ code: 0 });
    }
    if (href.endsWith(`/developers/v1/callback/${appId}`)) {
      return Response.json({ code: 0, data: { callbackMode: state.callbackMode, callbacks: [...state.callbacks] } });
    }
    return null;
  };
  return { state, updateBodies, handle };
}

describe('parseSetupOpenPlatformAutoFlag', () => {
  it('is enabled by default, supports explicit skip, and keeps --open-platform-auto compatible', () => {
    expect(parseSetupOpenPlatformAutoFlag([])).toBe(true);
    expect(parseSetupOpenPlatformAutoFlag(['--open-platform-auto'])).toBe(true);
    expect(parseSetupOpenPlatformAutoFlag(['--no-open-platform-auto'])).toBe(false);
    expect(parseSetupOpenPlatformAutoFlag(['--open-platform-auto', '--no-open-platform-auto'])).toBe(false);
    expect(parseSetupOpenPlatformAutoFlag(['--no-open-platform-auto', '--open-platform-auto'])).toBe(true);
  });
});

describe('official Feishu device registration', () => {
  it('uses the official least-privilege create-only flow and carries scanner identity into credential persistence', async () => {
    const onQrCode = vi.fn();
    const onStatus = vi.fn();
    const onSessionReady = vi.fn();
    const onCredentials = vi.fn();
    const registerAppImpl = vi.fn(async (options: any) => {
      options.onQRCodeReady({ url: 'https://accounts.feishu.cn/device?code=one', expireIn: 600 });
      options.onStatusChange({ status: 'polling' });
      return {
        client_id: 'cli_official',
        client_secret: 'write-only-secret',
        user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' },
      };
    });
    const identity = {
      userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice', email: 'alice@example.com',
      tenantId: 'tenant_key', tenantName: 'Example', brand: 'feishu' as const,
    };
    const result = await registerOfficialFeishuOpenPlatformApp({
      name: 'Cody Bot',
      registerAppImpl: registerAppImpl as any,
      resolveIdentity: vi.fn(async () => identity),
      onQrCode,
      onStatus,
      onSessionReady,
      onCredentials,
      scopeManifest: { scopes: { tenant: ['im:message:send_as_bot'], user: [] } },
    });

    expect(result).toMatchObject({
      ok: true, appId: 'cli_official', brand: 'feishu',
      registrationMethod: 'official_device_flow', sessionIdentity: identity,
    });
    expect(registerAppImpl).toHaveBeenCalledWith(expect.objectContaining({
      createOnly: true,
      addons: {
        preset: false,
        scopes: { tenant: ['im:message:send_as_bot'], user: [] },
        events: { items: { tenant: ['im.message.receive_v1'], user: [] } },
        callbacks: { items: ['card.action.trigger'] },
      },
    }));
    expect(onQrCode).toHaveBeenCalledWith(expect.objectContaining({
      qrPayload: 'https://accounts.feishu.cn/device?code=one', expireIn: 600,
    }));
    expect(onStatus).toHaveBeenCalledWith('等待扫码或手机确认；扫码后请在飞书中点击确认');
    expect(onSessionReady).toHaveBeenCalledWith({
      source: 'official_device_flow', identity, externallyConfirmed: true,
    });
    expect(onCredentials).toHaveBeenCalledWith({
      appId: 'cli_official', appSecret: 'write-only-secret', brand: 'feishu',
      identity: expect.objectContaining({ openId: 'ou_owner', tenantId: '', tenantName: '企业信息待重新验证' }),
    });
  });

  it('persists credentials and fails closed when tenant identity readback cannot be proven', async () => {
    const onCredentials = vi.fn();
    const result = await registerOfficialFeishuOpenPlatformApp({
      name: 'Cody Bot',
      registerAppImpl: vi.fn(async () => ({
        client_id: 'cli_created', client_secret: 'secret',
        user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' as const },
      })) as any,
      resolveIdentity: vi.fn(async () => { throw new Error('tenant query unavailable'); }),
      onCredentials,
    });

    expect(result).toMatchObject({ ok: false, reason: 'identity_unavailable', appId: 'cli_created' });
    expect(onCredentials).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'cli_created', appSecret: 'secret',
      identity: expect.objectContaining({ openId: 'ou_owner', tenantId: '' }),
    }));
  });

  it('surfaces the Feishu permission code when tenant identity readback is rejected', async () => {
    const sdkError = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { code: 99991672, msg: 'Access denied: [tenant:tenant:readonly]' } },
    });
    const result = await registerOfficialFeishuOpenPlatformApp({
      name: 'Cody Bot',
      registerAppImpl: vi.fn(async () => ({
        client_id: 'cli_created', client_secret: 'secret',
        user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' as const },
      })) as any,
      resolveIdentity: vi.fn(async () => { throw sdkError; }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'identity_unavailable' });
    if (!result.ok) {
      expect(result.message).toContain('99991672');
      expect(result.message).toContain('tenant:tenant:readonly');
    }
  });

  it('does not request contact profile scopes in the official flow', async () => {
    const registerAppImpl = vi.fn(async () => ({
      client_id: 'cli_created', client_secret: 'secret',
      user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' as const },
    }));
    await registerOfficialFeishuOpenPlatformApp({
      name: 'Cody Bot',
      registerAppImpl: registerAppImpl as any,
      resolveIdentity: vi.fn(async () => ({
        userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice',
        tenantId: 'tenant', tenantName: 'Example', brand: 'feishu' as const,
      })),
    });
    const call = (registerAppImpl.mock.calls as unknown as Array<[any]>)[0]?.[0];
    const tenantScopes = call?.addons.scopes.tenant as string[];
    expect(tenantScopes).toContain('tenant:tenant:readonly');
    expect(tenantScopes).toContain('application:application:patch');
    expect(tenantScopes).toContain('application:application:self_manage');
    expect(tenantScopes).toContain('application:bot.basic_info:read');
    expect(tenantScopes).toContain('im:message:send_as_bot');
    expect(tenantScopes.some((scope) => scope.startsWith('contact:'))).toBe(false);
  });

  it('targets an exact existing app instead of allowing a new app during official adoption', async () => {
    const registerAppImpl = vi.fn(async () => ({
      client_id: 'cli_existing', client_secret: 'refreshed-secret',
      user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' as const },
    }));
    const result = await registerOfficialFeishuOpenPlatformApp({
      name: 'Recovered Bot', appIdToAdopt: 'cli_existing',
      registerAppImpl: registerAppImpl as any,
      resolveIdentity: vi.fn(async () => ({
        userId: 'ou_owner', openId: 'ou_owner', userName: 'Alice',
        tenantId: 'tenant', tenantName: 'Example', brand: 'feishu' as const,
      })),
    });
    expect(result).toMatchObject({ ok: true, appId: 'cli_existing' });
    expect(registerAppImpl).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'cli_existing', createOnly: false,
    }));
  });

  it('publishes and then readbacks scopes, websocket subscriptions, visibility, ability and bot identity', async () => {
    const client = {
      application: {
        v7: {
          applicationAbility: { patch: vi.fn(async () => ({ code: 0 })) },
          applicationConfig: { patch: vi.fn(async () => ({ code: 0 })) },
          applicationPublish: { create: vi.fn(async () => ({ code: 0, data: { version_id: 'v1' } })) },
        },
        applicationManagement: { update: vi.fn(async () => ({ code: 0 })) },
        scope: { list: vi.fn(async () => ({
          code: 0,
          data: { scopes: [
            { scope_name: 'im:message:send_as_bot', scope_type: 'tenant', grant_status: 2 },
          ] },
        })) },
        application: { get: vi.fn(async () => ({
          code: 0,
          data: { app: {
            status: 1,
            online_version_id: 'v1',
            event: { subscription_type: 'websocket', subscribed_events: ['im.message.receive_v1'] },
            callback: { callback_type: 'websocket', subscribed_callbacks: ['card.action.trigger'] },
          } },
        })) },
        applicationAppVersion: { get: vi.fn(async () => ({
          code: 0,
          data: { app_version: {
            ability: { bot: {} },
            remark: { visibility: { is_all: false, visible_list: { open_ids: ['ou_owner'] } } },
          } },
        })) },
      },
      request: vi.fn(async () => ({ code: 0, bot: { open_id: 'ou_bot', app_name: 'Cody Bot' } })),
    };
    const result = await configureOfficialFeishuOpenPlatformApp({
      appId: 'cli_official', appSecret: 'secret', brand: 'feishu', client: client as any,
      scopeManifest: { scopes: { tenant: ['im:message:send_as_bot'], user: [] } },
      visibility: { isVisibleToAll: false, userOpenIds: ['ou_owner'] },
    });

    expect(result).toMatchObject({
      ok: true, versionId: 'v1', botOpenId: 'ou_bot',
      eventModeReady: true, callbackModeReady: true, visibilityReady: true,
      eventSubscriptionReady: true, callbackSubscriptionReady: true,
      scopeReady: true, onlineVersionReady: true, appEnabledReady: true,
    });
    expect(client.application.v7.applicationConfig.patch).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        event: expect.objectContaining({ subscription_type: 'websocket' }),
        callback: expect.objectContaining({ callback_type: 'websocket' }),
        visibility: { is_visible_to_all: false, visible_list: { user_ids: ['ou_owner'], department_ids: [] } },
      }),
    }));
  });

  it('does not claim success when a required scope is still pending', async () => {
    const client = {
      application: {
        v7: {
          applicationAbility: { patch: vi.fn(async () => ({ code: 0 })) },
          applicationConfig: { patch: vi.fn(async () => ({ code: 0 })) },
          applicationPublish: { create: vi.fn(async () => ({ code: 0, data: { version_id: 'v1' } })) },
        },
        applicationManagement: { update: vi.fn(async () => ({ code: 0 })) },
        scope: { list: vi.fn(async () => ({ code: 0, data: { scopes: [
          { scope_name: 'im:message:send_as_bot', scope_type: 'tenant', grant_status: 1 },
        ] } })) },
        application: { get: vi.fn(async () => ({ code: 0, data: { app: {} } })) },
        applicationAppVersion: { get: vi.fn(async () => ({ code: 0, data: { app_version: {} } })) },
      },
      request: vi.fn(async () => ({ code: 0, bot: { open_id: 'ou_bot' } })),
    };
    const result = await configureOfficialFeishuOpenPlatformApp({
      appId: 'cli_official', appSecret: 'secret', brand: 'feishu', client: client as any,
      scopeManifest: { scopes: { tenant: ['im:message:send_as_bot'], user: [] } },
      visibility: { isVisibleToAll: false, userOpenIds: ['ou_owner'] },
    });
    expect(result).toMatchObject({ ok: false, reason: 'scope_verification_failed' });
    if (!result.ok) expect(result.message).toContain('=1');
  });

  it('disables bot ability and the remote app with its own public credentials', async () => {
    const client = {
      application: {
        v7: { applicationAbility: { patch: vi.fn(async () => ({ code: 0 })) } },
        applicationManagement: { update: vi.fn(async () => ({ code: 0 })) },
      },
    };
    await expect(disableFeishuOpenPlatformAppWithCredentials({
      appId: 'cli_official', appSecret: 'secret', brand: 'lark', client: client as any,
    })).resolves.toEqual({ ok: true });
    expect(client.application.v7.applicationAbility.patch).toHaveBeenCalledWith({
      path: { app_id: 'cli_official' }, data: { bot: { enable: false } },
    });
    expect(client.application.applicationManagement.update).toHaveBeenCalledWith({
      path: { app_id: 'cli_official' }, data: { enable: false },
    });
  });
});

describe('botmux Feishu session cookie adapter', () => {
  it('writes private botmux cookie jar and builds scoped cookie headers without expired cookies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const file = join(dir, 'feishu_session.json');
    writeStoredCookiesToSessionFile(file, [
      cookie(),
      cookie({ name: 'expired', value: 'gone', expiresAt: Date.now() - 10 }),
      cookie({ name: 'askOnly', value: 'nope', domain: 'ask.feishu.cn', hostOnly: true }),
    ]);

    const cookies = readStoredCookiesFromSessionFile(file);
    expect(cookies?.map(c => c.name)).toEqual(['session', 'askOnly']);
    expect(getCookieHeader(cookies ?? [], 'https://open.feishu.cn/app/cli_x/auth')).toBe('session=secret-cookie-value');
    expect(readFileSync(file, 'utf8')).not.toContain('secret-cookie-value');
    expect(readFileSync(file, 'utf8')).toMatch(/^cody-credential:v1:/);
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('resolves botmux session path under config dir', () => {
    expect(codyFeishuSessionFilePath('/tmp/botmux-config')).toBe('/tmp/botmux-config/feishu-open-platform-session.json');
  });

  it('clears a cached Open Platform Web session without exposing its cookies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cody-open-platform-clear-'));
    const file = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(file, [cookie()]);
    expect(clearStoredFeishuOpenPlatformSession(file)).toBe(true);
    expect(readStoredCookiesFromSessionFile(file)).toBeNull();
    expect(clearStoredFeishuOpenPlatformSession(file)).toBe(false);
  });
});

describe('Open Platform payload helpers', () => {
  it('builds Feishu QR payload and maps polling status', () => {
    expect(buildFeishuQrPayload('qr-token')).toBe(JSON.stringify({ qrlogin: { token: 'qr-token' } }));
    expect(mapFeishuQrPollingStatus(2)).toBe('已经扫码，等待手机确认');
    expect(mapFeishuQrPollingStatus(5)).toBe('二维码已过期');
    expect(mapFeishuQrPollingStatus(null)).toBe('等待飞书扫码');
  });

  it('preserves complete online visibility and fails closed on partial collections', () => {
    expect(parseOpenPlatformOnlineVisibility({
      data: {
        whiteList: {
          departments: [{ department_id: 'od_1' }],
          groups: [{ chat_id: 'oc_1' }],
          members: [{ open_id: 'ou_1' }],
          isAll: 1,
        },
        blackList: { departments: [], groups: [], members: [{ id: 'ou_blocked' }], isAll: 0 },
      },
    })).toEqual({
      visibleSuggest: { departments: ['od_1'], groups: ['oc_1'], members: ['ou_1'], isAll: 1 },
      blackVisibleSuggest: { departments: [], groups: [], members: ['ou_blocked'], isAll: 0 },
    });
    expect(() => parseOpenPlatformOnlineVisibility({
      data: {
        whiteList: { departments: [], members: [], isAll: 0 },
        blackList: { departments: [], groups: [], members: [], isAll: 0 },
      },
    })).toThrow('whiteList.groups');
  });

  it('extracts window.csrfToken from page HTML', () => {
    expect(extractOpenPlatformCsrfToken('<script>window.csrfToken = "csrf_123"</script>')).toBe('csrf_123');
  });

  it('extracts the account and tenant identity shown before cached-session creation', () => {
    expect(extractOpenPlatformSessionIdentity(openPlatformPage())).toEqual({
      userId: 'u_1',
      userName: 'Alice',
      email: 'alice@example.com',
      tenantId: 't_1',
      tenantName: 'Example',
    });
  });

  it('maps tenant/user scope names to Open Platform IDs and builds payloads', () => {
    const entries = extractOpenPlatformScopeEntries({
      data: {
        appScopeList: [{ id: 101, name: 'im:message' }],
        userScopeList: [{ scopeId: '202', scopeName: 'auth:user_access_token:read' }],
      },
    });
    const mapped = mapManifestScopesToOpenPlatformIds(
      { scopes: { tenant: ['im:message'], user: ['auth:user_access_token:read'] } },
      entries,
    );

    expect(mapped).toEqual({
      tenantScopeIds: ['101'],
      userScopeIds: ['202'],
      missingTenantScopes: [],
      missingUserScopes: [],
    });
    expect(buildScopeUpdatePayload('cli_x', mapped)).toMatchObject({
      clientId: 'cli_x',
      appScopeIDs: ['101'],
      userScopeIDs: ['202'],
      operation: 'add',
      isDeveloperPanel: true,
    });
    expect(buildSafeSettingPayload('cli_x').redirectURL).toEqual(['http://127.0.0.1:3000']);
  });
});

describe('prepareFeishuWebSession', () => {
  it('gets a new botmux session via built-in Feishu QR login and saves it privately', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const sessionFile = join(dir, 'feishu-session.json');
    const qrPayloads: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/accounts/qrlogin/init')) {
        return Response.json(
          { code: 0, data: { step_info: { token: 'qr-token' } } },
          { headers: { 'x-flow-key': 'flow-key' } },
        );
      }
      if (href.includes('/accounts/qrlogin/polling')) {
        return Response.json({
          code: 0,
          data: {
            next_step: 'enter_app',
            step_info: { status: 1, cross_login_uri: 'https://accounts.feishu.cn/cross-login' },
          },
        });
      }
      if (href === 'https://accounts.feishu.cn/cross-login') {
        return new Response('', {
          status: 302,
          headers: {
            location: 'https://ask.feishu.cn/',
            'set-cookie': 'session=secret-cookie-value; Domain=.feishu.cn; Path=/; Secure; HttpOnly',
          },
        });
      }
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      throw new Error(`unexpected url: ${href}`);
    }) as typeof fetch;

    const result = await prepareFeishuWebSession({
      sessionFilePath: sessionFile,
      fetchImpl,
      pollIntervalMs: 0,
      maxWaitMs: 1000,
      onQrCode: ({ qrPayload }) => { qrPayloads.push(qrPayload) },
    });

    expect(result.ok && result.source).toBe('qr_login');
    expect(qrPayloads).toEqual([JSON.stringify({ qrlogin: { token: 'qr-token' } })]);
    expect(readStoredCookiesFromSessionFile(sessionFile)?.map(c => c.name)).toContain('session');
    if (process.platform !== 'win32') {
      expect(statSync(sessionFile).mode & 0o777).toBe(0o600);
    }
  });

  it('forces a fresh QR login for onboarding even when a valid cache exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-force-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    let initCount = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/accounts/qrlogin/init')) {
        initCount++;
        return Response.json(
          { code: 0, data: { step_info: { token: 'fresh-token' } } },
          { headers: { 'x-flow-key': 'fresh-flow' } },
        );
      }
      if (href.includes('/accounts/qrlogin/polling')) {
        return Response.json({
          code: 0,
          data: { next_step: 'enter_app', step_info: { status: 1, cross_login_uri: 'https://accounts.feishu.cn/fresh-cross' } },
        });
      }
      if (href === 'https://accounts.feishu.cn/fresh-cross') {
        return new Response('', {
          status: 302,
          headers: {
            location: 'https://ask.feishu.cn/',
            'set-cookie': 'session=fresh-cookie; Domain=.feishu.cn; Path=/; Secure; HttpOnly',
          },
        });
      }
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      throw new Error(`unexpected url: ${href}`);
    }) as typeof fetch;

    const result = await prepareFeishuWebSession({
      sessionFilePath: sessionFile,
      forceQrLogin: true,
      fetchImpl,
      pollIntervalMs: 0,
      maxWaitMs: 1000,
      onQrCode: () => {},
    });

    expect(result.ok && result.source).toBe('qr_login');
    expect(initCount).toBe(1);
    expect(readStoredCookiesFromSessionFile(sessionFile)?.find(c => c.name === 'session')?.value).toBe('fresh-cookie');
  });

  it('can require cache-only reuse so follow-up setup never displays a second QR', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-reuse-only-'));
    const onQrCode = vi.fn();
    const fetchImpl = vi.fn(async () => {
      throw new Error('network must not be used without cached cookies');
    }) as unknown as typeof fetch;

    const result = await prepareFeishuWebSession({
      sessionFilePath: join(dir, 'missing-session.json'),
      disableQrLogin: true,
      disableBytedcliFallback: true,
      fetchImpl,
      onQrCode,
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid_session' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onQrCode).not.toHaveBeenCalled();
  });

  it('uses old bytedcli session file only as fallback after built-in QR login fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const sessionFile = join(dir, 'feishu-session.json');
    const fallbackSessionFile = join(dir, 'bytedcli-feishu-session.json');
    writeFileSync(fallbackSessionFile, JSON.stringify({ cookies: [cookie()] }));
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/accounts/qrlogin/init')) throw new Error('login down');
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      throw new Error(`unexpected url: ${href}`);
    }) as typeof fetch;

    const result = await prepareFeishuWebSession({
      sessionFilePath: sessionFile,
      bytedcliFallbackSessionFilePath: fallbackSessionFile,
      fetchImpl,
      onQrCode: () => {},
    });

    expect(result.ok && result.source).toBe('bytedcli_fallback');
    expect(readStoredCookiesFromSessionFile(sessionFile)?.map(c => c.name)).toContain('session');
  });
});

describe('disableCachedFeishuOpenPlatformApp', () => {
  it('proves the cached account can manage the app before disabling its bot capability', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cody-feishu-disable-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const calls: Array<{ path: string; body: unknown }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app') return new Response(openPlatformPage('csrf-disable'), { status: 200 });
      const path = new URL(href).pathname;
      calls.push({ path, body: init?.body });
      if (path === '/developers/v1/app/list') {
        return Response.json({ code: 0, data: { apps: [{ clientId: 'cli_target', name: 'Target' }], totalCount: 1 } });
      }
      if (path === '/developers/v1/robot/switch/cli_target') return Response.json({ code: 0 });
      throw new Error(`unexpected url: ${href}`);
    }) as typeof fetch;

    const result = await disableCachedFeishuOpenPlatformApp({
      appId: 'cli_target', sessionFilePath: sessionFile, fetchImpl,
    });

    expect(result).toMatchObject({ ok: true, appId: 'cli_target', identity: { userId: 'u_1', tenantId: 't_1' } });
    expect(calls.map(call => call.path)).toEqual([
      '/developers/v1/app/list',
      '/developers/v1/robot/switch/cli_target',
    ]);
    expect(JSON.parse(String(calls[1]?.body))).toEqual({ clientId: 'cli_target', enable: false });
  });

  it('fails closed without touching the app when the cached account cannot manage it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cody-feishu-disable-denied-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const switchCall = vi.fn();
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app') return new Response(openPlatformPage('csrf-denied'), { status: 200 });
      const path = new URL(href).pathname;
      if (path === '/developers/v1/app/list') {
        return Response.json({ code: 0, data: { apps: [{ clientId: 'cli_other', name: 'Other' }], totalCount: 1 } });
      }
      if (path.includes('/robot/switch/')) {
        switchCall(init);
        return Response.json({ code: 0 });
      }
      throw new Error(`unexpected url: ${href}`);
    }) as typeof fetch;

    await expect(disableCachedFeishuOpenPlatformApp({
      appId: 'cli_target', sessionFilePath: sessionFile, fetchImpl,
    })).resolves.toMatchObject({ ok: false, reason: 'app_not_visible' });
    expect(switchCall).not.toHaveBeenCalled();
  });
});

describe('createFeishuOpenPlatformApp', () => {
  it('reuses one cached Web session to upload an icon, create/enable the bot, and read its secret', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-create-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const calls: Array<{ path: string; body: unknown }> = [];
    let qrCount = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app') {
        return new Response(openPlatformPage(), { status: 200 });
      }
      const path = new URL(href).pathname;
      calls.push({ path, body: init?.body });
      if (path === '/developers/v1/app/upload/image') {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({ code: 0, data: { url: 'https://cdn.example/botmux.png' } });
      }
      if (path === '/developers/v1/manifest/upsert_by_template') {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          appManifestTemplateID: 'developer_console',
          createAppUserCustomField: {
            i18n: { zh_cn: { name: 'botmux-4' } },
            avatar: 'https://cdn.example/botmux.png',
            primaryLang: 'zh_cn',
          },
        });
        expect(typeof body.cid).toBe('string');
        expect(body.cid.length).toBeGreaterThan(0);
        return Response.json({ code: 0, data: { clientID: 'cli_created' } });
      }
      if (path === '/developers/v1/app_version/create/cli_created') {
        return Response.json({ code: 0, data: { versionId: 'v-enable' } });
      }
      if (path === '/developers/v1/secret/cli_created') {
        return Response.json({ code: 0, data: { secret: 'created-secret' } });
      }
      return Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await createFeishuOpenPlatformApp({
      name: 'botmux-4',
      sessionFilePath: sessionFile,
      disableBytedcliFallback: true,
      fetchImpl,
      onQrCode: () => { qrCount += 1; },
    });

    expect(result).toMatchObject({
      ok: true,
      appId: 'cli_created',
      appSecret: 'created-secret',
      sessionSource: 'cody_cache',
      sessionIdentity: { userId: 'u_1', tenantId: 't_1' },
    });
    expect(qrCount).toBe(0);
    // 创建后立刻发布一个极简版本让应用上架启用(对齐 launcher),再读 secret
    expect(calls.map(call => call.path)).toEqual([
      '/developers/v1/app/upload/image',
      '/developers/v1/manifest/upsert_by_template',
      '/developers/v1/robot/switch/cli_created',
      '/developers/v1/event/switch/cli_created',
      '/developers/v1/app_version/create/cli_created',
      '/developers/v1/publish/commit/cli_created/v-enable',
      '/developers/v1/secret/cli_created',
    ]);
    // 版本可见成员含当前登录人(session identity userId),否则发布不自动上架
    const versionCall = calls.find(c => c.path === '/developers/v1/app_version/create/cli_created');
    expect(JSON.parse(String(versionCall?.body))).toMatchObject({ visibleSuggest: { members: ['u_1'] } });
  });

  it('falls back to plain app/create when the one-click template endpoint fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-fallback-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app') return new Response(openPlatformPage(), { status: 200 });
      const path = new URL(href).pathname;
      calls.push(path);
      if (path === '/developers/v1/app/upload/image') {
        return Response.json({ code: 0, data: { url: 'https://cdn.example/botmux.png' } });
      }
      if (path === '/developers/v1/manifest/upsert_by_template') {
        return Response.json({ code: 1, msg: 'template not available for this tenant' });
      }
      if (path === '/developers/v1/app/create') {
        expect(JSON.parse(String(init?.body))).toMatchObject({ name: 'botmux-5', appSceneType: 0 });
        return Response.json({ code: 0, data: { ClientID: 'cli_fallback' } });
      }
      if (path === '/developers/v1/app_version/create/cli_fallback') {
        return Response.json({ code: 0, data: { versionId: 'v-enable' } });
      }
      if (path === '/developers/v1/secret/cli_fallback') {
        return Response.json({ code: 0, data: { secret: 'fallback-secret' } });
      }
      return Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await createFeishuOpenPlatformApp({
      name: 'botmux-5',
      sessionFilePath: sessionFile,
      disableBytedcliFallback: true,
      fetchImpl,
    });

    expect(result).toMatchObject({ ok: true, appId: 'cli_fallback', appSecret: 'fallback-secret' });
    expect(calls).toEqual([
      '/developers/v1/app/upload/image',
      '/developers/v1/manifest/upsert_by_template',
      '/developers/v1/app/create',
      '/developers/v1/robot/switch/cli_fallback',
      '/developers/v1/event/switch/cli_fallback',
      '/developers/v1/app_version/create/cli_fallback',
      '/developers/v1/publish/commit/cli_fallback/v-enable',
      '/developers/v1/secret/cli_fallback',
    ]);
  });

  function outcomeUnknownFetchImpl(calls: string[], templateResponse: () => Response | Promise<Response>) {
    return (async (url: string | URL | Request) => {
      const href = String(url);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app') return new Response(openPlatformPage(), { status: 200 });
      const path = new URL(href).pathname;
      calls.push(path);
      if (path === '/developers/v1/app/upload/image') {
        return Response.json({ code: 0, data: { url: 'https://cdn.example/botmux.png' } });
      }
      if (path === '/developers/v1/manifest/upsert_by_template') {
        return templateResponse();
      }
      return Response.json({ code: 0 });
    }) as typeof fetch;
  }

  it('fails closed without cross-endpoint fallback when the template succeeds without a ClientID', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-noid-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const calls: string[] = [];
    const result = await createFeishuOpenPlatformApp({
      name: 'botmux-6',
      sessionFilePath: sessionFile,
      disableBytedcliFallback: true,
      // code=0 但响应缺 ClientID:应用可能已建成,禁止再走 app/create 重建
      fetchImpl: outcomeUnknownFetchImpl(calls, () => Response.json({ code: 0, data: {} })),
    });

    expect(result).toMatchObject({ ok: false, reason: 'api_error' });
    if (!result.ok) expect(result.message).toContain('确认');
    expect(calls.filter(p => p === '/developers/v1/app/create')).toEqual([]);
  });

  it('fails closed without cross-endpoint fallback on ambiguous transport errors from the template endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-transport-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const calls: string[] = [];
    const result = await createFeishuOpenPlatformApp({
      name: 'botmux-7',
      sessionFilePath: sessionFile,
      disableBytedcliFallback: true,
      // 传输错误(如 ECONNRESET):服务端可能已 commit,结果未知,不得重建
      fetchImpl: outcomeUnknownFetchImpl(calls, () => { throw new Error('socket hang up (ECONNRESET)'); }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'api_error' });
    expect(calls.filter(p => p === '/developers/v1/app/create')).toEqual([]);
  });

  it('fails closed without cross-endpoint fallback on HTTP 5xx from the template endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-5xx-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const calls: string[] = [];
    const result = await createFeishuOpenPlatformApp({
      name: 'botmux-8',
      sessionFilePath: sessionFile,
      disableBytedcliFallback: true,
      // 5xx:服务端内部错误,可能已部分落库,结果未知
      fetchImpl: outcomeUnknownFetchImpl(calls, () => new Response('oops', { status: 502 })),
    });

    expect(result).toMatchObject({ ok: false, reason: 'api_error' });
    expect(calls.filter(p => p === '/developers/v1/app/create')).toEqual([]);
  });

  it('stops before app/create when the account or tenant changed after the UI confirmation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-identity-race-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const post = vi.fn();
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app') return new Response(openPlatformPage(), { status: 200 });
      post(href, init);
      return Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await createFeishuOpenPlatformApp({
      name: 'must-not-exist',
      sessionFilePath: sessionFile,
      disableQrLogin: true,
      disableBytedcliFallback: true,
      expectedIdentity: { userId: 'u_1', tenantId: 'another_tenant' },
      fetchImpl,
    });

    expect(result).toMatchObject({ ok: false, reason: 'session_changed' });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('automateOpenPlatformSetup', () => {
  it('forwards forceQrLogin so configure --switch-account ignores a valid cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-auto-force-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    let initCount = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/accounts/qrlogin/init')) {
        initCount++;
        return Response.json(
          { code: 0, data: { step_info: { token: 'fresh-token' } } },
          { headers: { 'x-flow-key': 'fresh-flow' } },
        );
      }
      if (href.includes('/accounts/qrlogin/polling')) {
        return Response.json({
          code: 0,
          data: { next_step: 'enter_app', step_info: { status: 1, cross_login_uri: 'https://accounts.feishu.cn/fresh-cross' } },
        });
      }
      if (href === 'https://accounts.feishu.cn/fresh-cross') {
        return new Response('', {
          status: 302,
          headers: {
            location: 'https://ask.feishu.cn/',
            'set-cookie': 'session=fresh-cookie; Domain=.feishu.cn; Path=/; Secure; HttpOnly',
          },
        });
      }
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href.endsWith('/app/cli_x/auth')) return new Response('<script>window.csrfToken="csrf_auto"</script>', { status: 200 });
      if (href.includes('/scope/all/cli_x')) return Response.json({ code: 1, msg: 'stop after login' });
      throw new Error(`unexpected url: ${href}`);
    }) as typeof fetch;

    const result = await automateOpenPlatformSetup({
      appId: 'cli_x',
      sessionFilePath: sessionFile,
      forceQrLogin: true,
      disableBytedcliFallback: true,
      fetchImpl,
      pollIntervalMs: 0,
      maxWaitMs: 1000,
      onQrCode: () => {},
    });

    expect(result).toMatchObject({ ok: false, reason: 'api_error' });
    expect(initCount).toBe(1);
    expect(readStoredCookiesFromSessionFile(sessionFile)?.find(c => c.name === 'session')?.value).toBe('fresh-cookie');
  });

  it('returns login failure so setup can fall back to manual steps without aborting', async () => {
    const fetchImpl = (async () => {
      throw new Error('login down');
    }) as typeof fetch;
    const result = await automateOpenPlatformSetup({
      appId: 'cli_x',
      sessionFilePath: join(tmpdir(), `botmux-missing-${Date.now()}.json`),
      disableBytedcliFallback: true,
      fetchImpl,
      scopeManifest: { scopes: { tenant: ['im:message'], user: [] } },
      onQrCode: () => {},
      maxWaitMs: 1,
    });

    expect(result).toMatchObject({ ok: false, reason: 'login_failed' });
  });

  it('uses botmux session cookies, page csrf, and calls the expected Open Platform endpoints', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const sub = openPlatformSubscriptionMock('cli_x');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init: init ?? {} });
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href.endsWith('/auth')) {
        return new Response('<script>window.csrfToken="csrf_auto"</script>', { status: 200 });
      }
      if (href.includes('/scope/all/')) {
        return Response.json({
          code: 0,
          data: {
            appScopeList: [{ id: 'tenant-1', name: 'im:message' }],
            userScopeList: [{ id: 'user-1', name: 'auth:user_access_token:read' }],
          },
        });
      }
      if (href.includes('/app_version/create/')) return Response.json({ code: 0, data: { versionId: 'v1' } });
      return sub.handle(href, init) ?? Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await automateOpenPlatformSetup({
      appId: 'cli_x',
      sessionFilePath: sessionFile,
      fetchImpl,
      scopeManifest: { scopes: { tenant: ['im:message'], user: ['auth:user_access_token:read'] } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessionSource).toBe('cody_cache');
    expect(calls.filter(call => new URL(call.url).host === 'open.feishu.cn').map(call => new URL(call.url).pathname)).toEqual([
      '/app/cli_x/auth',
      '/developers/v1/scope/all/cli_x',
      '/developers/v1/scope/update/cli_x',
      '/developers/v1/robot/switch/cli_x',
      '/developers/v1/event/switch/cli_x',
      '/developers/v1/event/cli_x',
      '/developers/v1/event/update/cli_x',
      '/developers/v1/event/cli_x',
      '/developers/v1/callback/cli_x',
      '/developers/v1/callback/switch/cli_x',
      '/developers/v1/callback/cli_x',
      '/developers/v1/callback/update/cli_x',
      '/developers/v1/callback/cli_x',
      '/developers/v1/safe_setting/update/cli_x',
      '/developers/v1/visible/online/cli_x',
      '/developers/v1/app_version/list/cli_x',
      '/developers/v1/app_version/create/cli_x',
      '/developers/v1/publish/commit/cli_x/v1',
    ]);
    const updateCall = calls.find(call => call.url.includes('/scope/update/'));
    expect(new Headers(updateCall?.init.headers).get('x-csrf-token')).toBe('csrf_auto');
    expect(new Headers(updateCall?.init.headers).get('cookie')).toBe('session=secret-cookie-value');
    expect(JSON.parse(String(updateCall?.init.body))).toMatchObject({
      clientId: 'cli_x',
      appScopeIDs: ['tenant-1'],
      userScopeIDs: ['user-1'],
    });
  });

  it('uses the redirected Open Platform origin for API calls and referer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const sub = openPlatformSubscriptionMock('cli_x');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, init: init ?? {} });
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href === 'https://open.feishu.cn/app/cli_x/auth') {
        return new Response('', {
          status: 302,
          headers: { location: 'https://open.larkoffice.com/app/cli_x/auth' },
        });
      }
      if (href === 'https://open.larkoffice.com/app/cli_x/auth') {
        return new Response('<script>window.csrfToken="csrf_larkoffice"</script>', {
          status: 200,
          headers: {
            'set-cookie': 'lark_oapi_csrf_token=csrf_larkoffice_cookie; Domain=.larkoffice.com; Path=/; Secure',
          },
        });
      }
      if (href.includes('/scope/all/')) {
        return Response.json({
          code: 0,
          data: {
            appScopeList: [{ id: 'tenant-1', name: 'im:message' }],
            userScopeList: [{ id: 'user-1', name: 'auth:user_access_token:read' }],
          },
        });
      }
      if (href.includes('/app_version/create/')) return Response.json({ code: 0, data: { versionId: 'v1' } });
      return sub.handle(href, init) ?? Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await automateOpenPlatformSetup({
      appId: 'cli_x',
      sessionFilePath: sessionFile,
      fetchImpl,
      scopeManifest: { scopes: { tenant: ['im:message'], user: ['auth:user_access_token:read'] } },
    });

    expect(result.ok).toBe(true);
    expect(calls.filter(call => new URL(call.url).host === 'open.larkoffice.com').map(call => new URL(call.url).pathname)).toEqual([
      '/app/cli_x/auth',
      '/developers/v1/scope/all/cli_x',
      '/developers/v1/scope/update/cli_x',
      '/developers/v1/robot/switch/cli_x',
      '/developers/v1/event/switch/cli_x',
      '/developers/v1/event/cli_x',
      '/developers/v1/event/update/cli_x',
      '/developers/v1/event/cli_x',
      '/developers/v1/callback/cli_x',
      '/developers/v1/callback/switch/cli_x',
      '/developers/v1/callback/cli_x',
      '/developers/v1/callback/update/cli_x',
      '/developers/v1/callback/cli_x',
      '/developers/v1/safe_setting/update/cli_x',
      '/developers/v1/visible/online/cli_x',
      '/developers/v1/app_version/list/cli_x',
      '/developers/v1/app_version/create/cli_x',
      '/developers/v1/publish/commit/cli_x/v1',
    ]);
    const updateCall = calls.find(call => call.url === 'https://open.larkoffice.com/developers/v1/scope/update/cli_x');
    const updateHeaders = new Headers(updateCall?.init.headers);
    expect(updateHeaders.get('origin')).toBe('https://open.larkoffice.com');
    expect(updateHeaders.get('referer')).toBe('https://open.larkoffice.com/app/cli_x');
    expect(updateHeaders.get('x-csrf-token')).toBe('csrf_larkoffice');
    expect(updateHeaders.get('cookie')).toContain('lark_oapi_csrf_token=csrf_larkoffice_cookie');
  });

  it('fails closed when the required scope batch is rejected', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const sub = openPlatformSubscriptionMock('cli_x');
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href.endsWith('/auth')) return new Response('<script>window.csrfToken="csrf_auto"</script>', { status: 200 });
      if (href.includes('/scope/all/')) {
        return Response.json({ code: 0, data: { appScopeList: [{ id: 't1', name: 'im:message' }], userScopeList: [] } });
      }
      if (href.includes('/scope/update/')) return Response.json({ code: 1, msg: 'scope not grantable for tenant' });
      if (href.includes('/app_version/create/')) return Response.json({ code: 0, data: { versionId: 'v1' } });
      return sub.handle(href, init) ?? Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await automateOpenPlatformSetup({
      appId: 'cli_x',
      sessionFilePath: sessionFile,
      fetchImpl,
      scopeManifest: { scopes: { tenant: ['im:message'], user: [] } },
    });

    expect(result).toMatchObject({ ok: false, reason: 'api_error' });
    if (!result.ok) expect(result.message).toContain('必要权限导入失败');
    expect(calls.some(u => u.includes('/safe_setting/update/'))).toBe(false);
    expect(calls.some(u => u.includes('/publish/commit/'))).toBe(false);
  });

  it('fails closed when required scopes cannot be mapped in the tenant catalog', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'botmux-open-platform-'));
    const sessionFile = join(dir, 'feishu-session.json');
    writeStoredCookiesToSessionFile(sessionFile, [cookie()]);
    const sub = openPlatformSubscriptionMock('cli_x');
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href === 'https://ask.feishu.cn/') return new Response('ask home', { status: 200 });
      if (href.endsWith('/auth')) return new Response('<script>window.csrfToken="csrf_auto"</script>', { status: 200 });
      if (href.includes('/scope/all/')) {
        return Response.json({ code: 0, data: { appScopeList: [], userScopeList: [] } });
      }
      if (href.includes('/app_version/create/')) return Response.json({ code: 0, data: { versionId: 'v1' } });
      return sub.handle(href, init) ?? Response.json({ code: 0 });
    }) as typeof fetch;

    const result = await automateOpenPlatformSetup({
      appId: 'cli_x',
      sessionFilePath: sessionFile,
      fetchImpl,
      scopeManifest: { scopes: { tenant: ['im:message', 'contact:user.base:readonly'], user: ['auth:user_access_token:read'] } },
    });

    expect(result).toMatchObject({ ok: false, reason: 'scope_mapping_failed' });
    expect(calls.some(u => u.includes('/scope/update/'))).toBe(false);
  });

});
