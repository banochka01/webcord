import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, describeDevice, hashSessionSecret, roleAtLeast, sanitizeErrorReport } from '../src/reliability.js';

test('compares client versions numerically', () => {
  assert.equal(compareVersions('4.2.0', '4.1.9'), 1);
  assert.equal(compareVersions('4.2', '4.2.0'), 0);
  assert.equal(compareVersions('4.1.10', '4.2.0'), -1);
});

test('sanitizes and fingerprints client errors', () => {
  const report = sanitizeErrorReport({
    message: 'Renderer crashed',
    stack: 'at Composer\nat App',
    platform: 'windows',
    appVersion: '4.2.0',
    context: { workspace: 'chat' }
  });
  assert.equal(report.platform, 'WINDOWS');
  assert.equal(report.context.workspace, 'chat');
  assert.match(report.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(sanitizeErrorReport({}), null);
});

test('session secrets are one-way and device metadata has safe defaults', () => {
  assert.equal(hashSessionSecret('secret'), hashSessionSecret('secret'));
  assert.notEqual(hashSessionSecret('secret'), 'secret');
  assert.deepEqual(describeDevice('Mozilla Android', '', ''), {
    platform: 'ANDROID',
    deviceName: 'WebCord for Android',
    userAgent: 'Mozilla Android'
  });
  assert.deepEqual(describeDevice('WebCord iPhone iOS', '', ''), {
    platform: 'IOS',
    deviceName: 'WebCord for iPhone and iPad',
    userAgent: 'WebCord iPhone iOS'
  });
});

test('community role checks use the complete role hierarchy', () => {
  assert.equal(roleAtLeast('MODERATOR', 'MEMBER'), true);
  assert.equal(roleAtLeast('MEMBER', 'ADMIN'), false);
  assert.equal(roleAtLeast('OWNER', 'OWNER'), true);
});
