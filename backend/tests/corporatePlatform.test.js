const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
    createFileHash,
    createReference,
    calculateSeverity
} = require('../services/corporatePlatform.service');

test('createFileHash hashes buffers without converting their bytes to text', () => {
    const payload = Buffer.from([0, 1, 2, 255]);
    const expected = crypto.createHash('sha256').update(payload).digest('hex');
    assert.equal(createFileHash(payload), expected);
});

test('exception severity follows corporate materiality thresholds', () => {
    assert.equal(calculateSeverity(20), 'low');
    assert.equal(calculateSeverity(100), 'medium');
    assert.equal(calculateSeverity(1000), 'high');
    assert.equal(calculateSeverity(-10000), 'critical');
    assert.equal(calculateSeverity(1, 'high'), 'high');
});

test('corporate references are unique-looking and prefixed', () => {
    const first = createReference('EXC');
    const second = createReference('EXC');
    assert.match(first, /^EXC-\d{8}-[A-F0-9]{6}$/);
    assert.notEqual(first, second);
});
