const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
    createFileHash,
    createReference
} = require('../services/departments/corporate/corporatePlatform.service');

test('createFileHash hashes buffers without converting their bytes to text', () => {
    const payload = Buffer.from([0, 1, 2, 255]);
    const expected = crypto.createHash('sha256').update(payload).digest('hex');
    assert.equal(createFileHash(payload), expected);
});

test('corporate references are unique-looking and prefixed', () => {
    const first = createReference('RPT');
    const second = createReference('RPT');
    assert.match(first, /^RPT-\d{8}-[A-F0-9]{6}$/);
    assert.notEqual(first, second);
});
