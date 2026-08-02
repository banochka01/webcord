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
