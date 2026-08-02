import { expect, test } from '@playwright/test';

const user = {
  id: 1,
  username: 'owner',
  displayName: 'Space Owner',
  role: 'OWNER',
  isAdmin: true,
  accentColor: '#7c5cff'
};
const channels = [
  { id: 1, guildId: 1, name: 'general', type: 'TEXT', slowModeSeconds: 0 },
  { id: 2, guildId: 1, name: 'General Voice', type: 'VOICE', slowModeSeconds: 0 }
];
const guild = { id: 1, name: 'WebCord Community', description: 'A real shared space', accentColor: '#7c5cff', channels };
const clientSessions = [{ id: 'session-current', deviceName: 'WebCord Web', platform: 'WEB', ipAddress: '127.0.0.1', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), current: true }];

async function mockAuthenticatedApp(page) {
  await page.addInitScript(({ storedUser }) => {
    localStorage.setItem('webcord_token', 'e2e-token');
    localStorage.setItem('webcord_user', JSON.stringify(storedUser));
  }, { storedUser: user });

  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    let body = {};
    if (path === '/bootstrap') body = { guild, channels, social: { friends: [], requests: [], conversations: [] }, currentUser: user, defaults: { textChannelId: 1, voiceChannelId: 2 } };
    else if (path === '/guilds') body = [{ ...guild, membership: { role: 'OWNER' } }];
    else if (path === '/channels/1') body = channels;
    else if (path === '/messages/1') body = [];
    else if (path === '/social') body = { friends: [], requests: [], conversations: [] };
    else if (path === '/stories') body = [];
    else if (path === '/activity') body = { activities: [], unreadCount: 0 };
    else if (path === '/spaces') body = { guild, guilds: [{ ...guild, membership: { role: 'OWNER' } }], membership: { role: 'OWNER' }, activityCount: 0, scheduledCount: 0, events: [], activePolls: [] };
    else if (path === '/spaces/1/members') body = [{ id: 1, guildId: 1, userId: 1, role: 'OWNER', joinedAt: new Date().toISOString(), user }];
    else if (path === '/spaces/1/audit-log') body = [];
    else if (path === '/invites') body = [];
    else if (path === '/scheduled-messages') body = [];
    else if (path === '/calls') body = { calls: [] };
    else if (path === '/me/bookmarks') body = { bookmarks: [] };
    else if (path === '/me/client-state') body = { state: {} };
    else if (path === '/voice/ice-servers') body = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    else if (path === '/push/vapid-public-key') body = { enabled: false, nativeEnabled: false, publicKey: '' };
    else if (path === '/downloads') body = { downloads: [] };
    else if (path === '/client/releases/current') body = { version: '4.2.0', updateAvailable: false, required: false, download: { available: true, url: '/downloads/windows' } };
    else if (path === '/me/sessions') body = route.request().method() === 'DELETE' ? { ok: true, revoked: 0 } : { sessions: clientSessions };
    else if (path.startsWith('/channels/') && path.endsWith('/permissions')) body = { ...channels[0], isPrivate: true, minimumRole: 'MEMBER' };
    else if (path === '/client-errors') body = { accepted: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('Spaces 2.0 renders membership and keeps desktop rail buttons circular', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.goto('/');
  const spacesButton = page.locator('[data-workspace="spaces"]');
  await expect(spacesButton).toBeVisible();
  await spacesButton.click();
  await expect(page.locator('.spaces-hero h2', { hasText: 'WebCord Community' })).toBeVisible();
  await expect(page.locator('.space-member-role', { hasText: 'owner' })).toBeVisible();
  await expect(page.getByText('Members and roles')).toBeVisible();
  const geometry = await spacesButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, radius: style.borderRadius };
  });
  expect(Math.abs(geometry.width - geometry.height)).toBeLessThan(1);
  expect(geometry.radius).toBe('50%');
});

test('mobile Spaces has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedApp(page);
  await page.goto('/');
  await page.locator('[data-workspace="spaces"]').click();
  await expect(page.locator('.spaces-hero h2', { hasText: 'WebCord Community' })).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});

test('community owners can configure private channel access', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.goto('/');
  await page.locator('[data-workspace="spaces"]').click();
  await expect(page.getByText('Channel privacy')).toBeVisible();
  const visibilityButton = page.locator('.channel-access-row').filter({ hasText: 'general' }).getByRole('button').first();
  await expect(visibilityButton).toHaveText('Visible');
  await visibilityButton.click();
  await expect(visibilityButton).toHaveText('Private');
});

test('device security center loads active server sessions', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.goto('/');
  await page.locator('.rail-settings').click();
  await page.getByRole('button', { name: 'Devices' }).click();
  await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible();
  await expect(page.getByText('WebCord Web · This device')).toBeVisible();
  await expect(page.getByText('127.0.0.1')).toBeVisible();
});
