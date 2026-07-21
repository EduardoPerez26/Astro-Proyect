const REQUIRED_INTACCT_ENV = [
    'INTACCT_SENDER_ID',
    'INTACCT_SENDER_PASSWORD',
    'INTACCT_COMPANY_ID',
    'INTACCT_USER_ID',
    'INTACCT_USER_PASSWORD'
];

function redact(value) {
    const text = String(value || '');

    if (!text) return '';
    if (text.length <= 4) return 'configured';

    return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function getIntacctConfigStatus() {
    const missing = REQUIRED_INTACCT_ENV.filter(name => !process.env[name]);
    const optional = {
        INTACCT_ENTITY_ID: Boolean(process.env.INTACCT_ENTITY_ID),
        INTACCT_REPORTING_BOOK: process.env.INTACCT_REPORTING_BOOK || 'ACCRUAL',
        INTACCT_ENDPOINT_URL: process.env.INTACCT_ENDPOINT_URL || 'https://api.intacct.com/ia/xml/xmlgw.phtml'
    };

    return {
        ready: missing.length === 0,
        missing,
        configured: {
            INTACCT_SENDER_ID: redact(process.env.INTACCT_SENDER_ID),
            INTACCT_COMPANY_ID: redact(process.env.INTACCT_COMPANY_ID),
            INTACCT_USER_ID: redact(process.env.INTACCT_USER_ID)
        },
        optional
    };
}

module.exports = {
    REQUIRED_INTACCT_ENV,
    getIntacctConfigStatus
};
