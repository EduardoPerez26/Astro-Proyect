(() => {
    const LOCAL_API_URL = 'http://localhost:3001/api';
    const PRODUCTION_API_URL = 'https://astro-proyect-production.up.railway.app/api';
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

    window.API_URL = localHosts.has(window.location.hostname)
        ? LOCAL_API_URL
        : PRODUCTION_API_URL;

    installPropertyManagementGlPatch();
    document.addEventListener('DOMContentLoaded', installPropertyManagementGlPatch);
    window.setTimeout(installPropertyManagementGlPatch, 500);

    function installPropertyManagementGlPatch() {
        const xlsx = window.XLSX;

        if (!xlsx?.utils?.sheet_to_json) return;
        if (xlsx.utils.sheet_to_json.__pmSalesTaxReturnPatch) return;

        const originalSheetToJson = xlsx.utils.sheet_to_json.bind(xlsx.utils);

        const patchedSheetToJson = function patchedSheetToJson(sheet, options = {}) {
            const rows = originalSheetToJson(sheet, options);

            try {
                if (Array.isArray(rows) && options?.header === 1) {
                    normalizePropertyManagementReturnPayments(rows);
                }
            } catch (error) {
                console.warn('Property Management GL normalization skipped:', error);
            }

            return rows;
        };

        patchedSheetToJson.__pmSalesTaxReturnPatch = true;
        patchedSheetToJson.__originalSheetToJson = originalSheetToJson;
        xlsx.utils.sheet_to_json = patchedSheetToJson;
    }

    function normalizePropertyManagementReturnPayments(rows) {
        const headerIndex = rows.findIndex(row => {
            const headers = normalizeRowHeaders(row);

            return (
                headers.some(header => header.includes('posted dt')) &&
                headers.some(header => header.includes('location')) &&
                headers.some(header => header.includes('debit')) &&
                headers.some(header => header.includes('credit'))
            );
        });

        if (headerIndex < 0) return;

        const headers = normalizeRowHeaders(rows[headerIndex]);
        const indexes = {
            memo: findHeaderIndex(headers, [
                'memo description',
                'memo',
                'description',
                'entry payee',
                'entry / payee',
                'doc'
            ]),
            account: findHeaderIndex(headers, [
                'gl acct',
                'gl account',
                'account'
            ]),
            debit: findHeaderIndex(headers, ['debit']),
            credit: findHeaderIndex(headers, ['credit'])
        };

        if (indexes.memo < 0 || indexes.debit < 0 || indexes.credit < 0) return;

        rows.slice(headerIndex + 1).forEach(row => {
            const memo = normalizeText(row[indexes.memo]);
            const account = indexes.account >= 0 ? normalizeText(row[indexes.account]) : '';
            const debit = parsePatchAmount(row[indexes.debit]);
            const credit = parsePatchAmount(row[indexes.credit]);

            const isSalesTax = account.includes('241000') || memo.includes('SALES TAX');
            const isReturnPayment =
                /\bQ[1-4]\s+RETURN\b/.test(memo) ||
                /\bRETURN\s+PAYMENT\b/.test(memo) ||
                /\b\(\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s+PAID\s*\)/.test(memo);

            if (!isSalesTax || !isReturnPayment) return;
            if (debit !== null && Math.abs(debit) > 0.000001) return;
            if (credit === null || Math.abs(credit) <= 0.000001) return;

            row[indexes.debit] = Math.abs(credit);
            row[indexes.credit] = '';
        });
    }

    function normalizeRowHeaders(row) {
        return Array.isArray(row) ? row.map(normalizeText) : [];
    }

    function findHeaderIndex(headers, labels) {
        return headers.findIndex(header =>
            labels.some(label => header.includes(normalizeText(label)))
        );
    }

    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parsePatchAmount(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (value instanceof Date) return null;

        const text = String(value ?? '').trim();
        if (!text) return null;

        const negative = /^\(.*\)$/.test(text);
        const cleaned = text.replace(/[$,()\s]/g, '');
        const number = Number(cleaned);

        if (!Number.isFinite(number)) return null;
        return negative ? -number : number;
    }
})();