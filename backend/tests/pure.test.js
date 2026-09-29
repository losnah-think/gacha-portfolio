import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNickname } from '../src/utils/validation.js';
import { filterVisibleCounselorPersonas, isHiddenCounselorPersona } from '../src/utils/personaVisibility.js';
import { generateRandomNickname } from '../src/utils/nicknameGenerator.js';

// These tests import only pure modules: no Firebase, AI, payment, or HTTP clients.
test('nicknames normalize surrounding spaces and enforce length/character limits', () => {
  assert.deepEqual(validateNickname('  새싹7  '), { isValid: true, trimmedNickname: '새싹7' });
  for (const value of ['', '가', 'abcdefghijklmnop', '<script>', 'user@name']) {
    assert.equal(validateNickname(value).isValid, false);
  }
});

test('nicknames cannot impersonate administrators', () => {
  assert.equal(validateNickname('Admin7').code, 'BANNED_WORD');
  assert.equal(validateNickname('관리자7').code, 'BANNED_WORD');
});

test('persona visibility handles aliases and missing images without mutating the input', () => {
  assert.equal(isHiddenCounselorPersona({ id: ' Lotto_Generator ' }), true);
  const visible = { id: 'v3_lucy', name: '루시' };
  const input = [visible, { id: 'grandmother' }, { id: 'love_expert' }];
  assert.deepEqual(filterVisibleCounselorPersonas(input), [visible]);
  assert.equal(input.length, 3);
});

test('generated nicknames satisfy the public nickname contract', () => {
  for (let i = 0; i < 100; i++) {
    const nickname = generateRandomNickname();
    assert.match(nickname, /[0-9]{4}$/);
    assert.equal(validateNickname(nickname).isValid, true);
  }
});
