import assert from 'node:assert/strict';
import test from 'node:test';

import { firebasePushConfigured } from '../src/firebase-push.js';

test('firebase push remains disabled without credentials', () => {
  assert.equal(firebasePushConfigured({}), false);
});

test('firebase push recognizes supported secret delivery methods', () => {
  assert.equal(firebasePushConfigured({ FIREBASE_SERVICE_ACCOUNT_BASE64: 'e30=' }), true);
  assert.equal(firebasePushConfigured({ FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }), true);
  assert.equal(firebasePushConfigured({ GOOGLE_APPLICATION_CREDENTIALS: '/run/secrets/firebase.json', FIREBASE_PROJECT_ID: 'webcord' }), true);
  assert.equal(firebasePushConfigured({ GOOGLE_APPLICATION_CREDENTIALS: '/run/secrets/firebase.json' }), false);
});
