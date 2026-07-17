const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const { getIntacctConfigStatus } = require('./intacctConfig.service');

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseTagValue: false
});

function xmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function controlId(prefix = 'xbfs') {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function arrayify(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function collectErrors(parsed) {
    const response = parsed?.response || {};
    const results = arrayify(response.operation?.result);
    const errors = [];

    for (const result of results) {
        for (const error of arrayify(result?.errormessage?.error)) {
            errors.push(
                error?.description2 ||
                error?.description ||
                error?.errorno ||
                'Sage Intacct returned an unspecified error.'
            );
        }
    }

    for (const error of arrayify(response?.errormessage?.error)) {
        errors.push(error?.description2 || error?.description || error?.errorno || 'Sage Intacct request failed.');
    }

    return errors.filter(Boolean);
}

function normalizeData(data) {
    if (!data || typeof data !== 'object') return [];
    const ignored = new Set(['@_listtype', '@_count', '@_totalcount', '@_numremaining', '@_resultId']);
    const keys = Object.keys(data).filter(key => !ignored.has(key));
    if (!keys.length) return [];

    return keys.flatMap(key => arrayify(data[key]).map(item => ({
        __object: key,
        ...(typeof item === 'object' && item !== null ? item : { value: item })
    })));
}

function buildRequest(functionXml, functionControlId = controlId('function')) {
    const status = getIntacctConfigStatus();
    if (!status.ready) {
        const error = new Error(`Missing Sage Intacct configuration: ${status.missing.join(', ')}`);
        error.code = 'INTACCT_NOT_CONFIGURED';
        throw error;
    }

    const senderId = xmlEscape(process.env.INTACCT_SENDER_ID);
    const senderPassword = xmlEscape(process.env.INTACCT_SENDER_PASSWORD);
    const companyId = xmlEscape(process.env.INTACCT_COMPANY_ID);
    const userId = xmlEscape(process.env.INTACCT_USER_ID);
    const userPassword = xmlEscape(process.env.INTACCT_USER_PASSWORD);
    const entity = String(process.env.INTACCT_ENTITY_ID || '').trim();

    return `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${senderId}</senderid>
    <password>${senderPassword}</password>
    <controlid>${xmlEscape(controlId('request'))}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation transaction="false">
    <authentication>
      <login>
        <userid>${userId}</userid>
        <companyid>${companyId}</companyid>
        <password>${userPassword}</password>
        ${entity ? `<locationid>${xmlEscape(entity)}</locationid>` : ''}
      </login>
    </authentication>
    <content>
      <function controlid="${xmlEscape(functionControlId)}">
        ${functionXml}
      </function>
    </content>
  </operation>
</request>`;
}

async function postXml(xml) {
    const endpoint = process.env.INTACCT_ENDPOINT_URL || 'https://api.intacct.com/ia/xml/xmlgw.phtml';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.INTACCT_TIMEOUT_MS || 30000));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/xml',
                Accept: 'application/xml'
            },
            body: xml,
            signal: controller.signal
        });
        const body = await response.text();
        if (!response.ok) {
            const error = new Error(`Sage Intacct HTTP request failed (${response.status}).`);
            error.code = 'INTACCT_HTTP_ERROR';
            error.status = response.status;
            throw error;
        }

        const parsed = parser.parse(body);
        const errors = collectErrors(parsed);
        const controlStatus = String(parsed?.response?.control?.status || '').toLowerCase();
        const authStatus = String(parsed?.response?.operation?.authentication?.status || '').toLowerCase();
        const results = arrayify(parsed?.response?.operation?.result);
        const failedResult = results.find(result => String(result?.status || '').toLowerCase() === 'failure');

        if (controlStatus === 'failure' || authStatus === 'failure' || failedResult || errors.length) {
            const error = new Error(errors.join(' | ') || 'Sage Intacct rejected the request.');
            error.code = 'INTACCT_RESPONSE_FAILURE';
            error.details = errors;
            throw error;
        }

        return {
            parsed,
            results,
            requestId: parsed?.response?.control?.controlid || null
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Sage Intacct request timed out.');
            timeoutError.code = 'INTACCT_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function testIntacctConnection() {
    const response = await postXml(buildRequest('<getAPISession />', controlId('session')));
    const result = response.results[0] || {};
    const data = result.data || {};
    const api = data.api || data;

    return {
        success: true,
        companyId: process.env.INTACCT_COMPANY_ID,
        entityId: process.env.INTACCT_ENTITY_ID || null,
        endpoint: api.endpoint || process.env.INTACCT_ENDPOINT_URL || null,
        sessionIssued: Boolean(api.sessionid),
        requestId: response.requestId
    };
}

async function readByQuery({ object, fields, query = '', pageSize = 100 }) {
    const safeObject = String(object || '').trim().toUpperCase();
    const allowedObjects = new Set([
        'GLDETAIL',
        'GLACCOUNT',
        'LOCATION',
        'DEPARTMENT',
        'VENDOR',
        'APBILL',
        'APBILLITEM'
    ]);
    if (!allowedObjects.has(safeObject)) {
        const error = new Error('The requested Sage Intacct object is not allowed.');
        error.code = 'INTACCT_OBJECT_NOT_ALLOWED';
        throw error;
    }

    const safeFields = Array.isArray(fields)
        ? fields.map(field => String(field || '').trim().toUpperCase()).filter(field => /^[A-Z0-9_]+$/.test(field))
        : String(fields || '*').split(',').map(field => field.trim().toUpperCase()).filter(field => field === '*' || /^[A-Z0-9_]+$/.test(field));
    if (!safeFields.length) throw new Error('At least one Sage Intacct field is required.');

    const size = Math.min(Math.max(Number(pageSize || 100), 1), 1000);
    const functionXml = `<readByQuery>
      <object>${xmlEscape(safeObject)}</object>
      <fields>${xmlEscape(safeFields.join(','))}</fields>
      <query>${xmlEscape(String(query || '').slice(0, 4000))}</query>
      <pagesize>${size}</pagesize>
    </readByQuery>`;
    const response = await postXml(buildRequest(functionXml, controlId('query')));
    const result = response.results[0] || {};

    return {
        success: true,
        object: safeObject,
        rows: normalizeData(result.data),
        count: Number(result.data?.['@_count'] || 0),
        totalCount: Number(result.data?.['@_totalcount'] || 0),
        remaining: Number(result.data?.['@_numremaining'] || 0),
        resultId: result.data?.['@_resultId'] || null,
        requestId: response.requestId
    };
}

module.exports = {
    testIntacctConnection,
    readByQuery
};
