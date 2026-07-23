const test = require('node:test');
const assert = require('node:assert/strict');

const { toRow, fromRow } = require('../services/departments/ar/storeTaxCatalog.service');

test('toRow trims the store number and defaults missing fields to null', () => {
    const row = toRow({ store: ' 1572 ', taxRate: 0.0925 });
    assert.equal(row.store_number, '1572');
    assert.equal(row.address, null);
    assert.equal(row.latitude, null);
    assert.equal(row.tax_rate, 0.0925);
});

test('toRow keeps a tax rate of exactly 0 instead of dropping it', () => {
    const row = toRow({ store: '42', taxRate: 0 });
    assert.equal(row.tax_rate, 0);
});

test('toRow coerces numeric-looking strings for latitude/longitude', () => {
    const row = toRow({ store: '42', latitude: '37.319812', longitude: '-121.973814' });
    assert.equal(row.latitude, 37.319812);
    assert.equal(row.longitude, -121.973814);
});

test('fromRow maps snake_case DB columns back to the camelCase shape the frontend expects', () => {
    const store = fromRow({
        store_number: '1572',
        address: '385 S Kiely Blvd',
        city: 'San Jose',
        state: 'CA',
        zip: '95129',
        latitude: '37.3198120',
        longitude: '-121.9738140',
        preferred_jurisdiction: 'SAN JOSE',
        tax_rate: '0.100000'
    });

    assert.deepEqual(store, {
        store: '1572',
        address: '385 S Kiely Blvd',
        city: 'San Jose',
        state: 'CA',
        zip: '95129',
        latitude: 37.319812,
        longitude: -121.973814,
        preferredJurisdiction: 'SAN JOSE',
        taxRate: 0.1
    });
});

test('fromRow tolerates null coordinates', () => {
    const store = fromRow({
        store_number: '99',
        address: null,
        city: null,
        state: null,
        zip: null,
        latitude: null,
        longitude: null,
        preferred_jurisdiction: null,
        tax_rate: '0.000000'
    });

    assert.equal(store.latitude, null);
    assert.equal(store.longitude, null);
    assert.equal(store.taxRate, 0);
});
