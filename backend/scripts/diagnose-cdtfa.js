#!/usr/bin/env node
// Standalone network diagnostic for the CDTFA Tax API integration health check
// (see services/integrationHealth.service.js checkCdtfa). System Center only reports
// pass/fail + total latency; this breaks the same request down by network layer
// (DNS -> TCP -> TLS -> HTTP) to tell apart "our network can't reach CDTFA" from
// "CDTFA itself is slow/down". Run it on the machine that hosts the backend, not
// from a laptop, so the network path matches what the real health check sees.
//
// Usage: node scripts/diagnose-cdtfa.js

const dns = require('dns');
const net = require('net');
const tls = require('tls');

const TARGET_URL = 'https://services.maps.cdtfa.ca.gov/api/taxrate/GetRateByLngLat?longitude=-121.4944&latitude=38.5816';
const HOSTNAME = new URL(TARGET_URL).hostname;
const PORT = 443;
const HEALTH_CHECK_TIMEOUT_MS = 6000; // matches DEFAULT_TIMEOUT_MS in integrationHealth.service.js
const DIAGNOSTIC_TIMEOUT_MS = 15000; // give the HTTP stage extra room to see if CDTFA answers late

function ms(startedAt) {
    return `${(Date.now() - startedAt).toFixed(0)}ms`;
}

async function step(label, fn) {
    const startedAt = Date.now();
    process.stdout.write(`- ${label}... `);
    try {
        const result = await fn();
        console.log(`OK (${ms(startedAt)})${result ? ' — ' + result : ''}`);
        return { ok: true, elapsedMs: Date.now() - startedAt, result };
    } catch (error) {
        console.log(`FAILED (${ms(startedAt)}) — ${error.message}`);
        return { ok: false, elapsedMs: Date.now() - startedAt, error };
    }
}

async function dnsLookup() {
    return step('DNS resolution', async () => {
        const addresses = await dns.promises.lookup(HOSTNAME, { all: true });
        return addresses.map(a => `${a.address} (IPv${a.family})`).join(', ');
    });
}

async function tcpConnect(ip) {
    return step(`TCP connect to ${ip}:${PORT}`, () => new Promise((resolve, reject) => {
        const socket = net.connect({ host: ip, port: PORT, timeout: 8000 });
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('timeout', () => { socket.destroy(); reject(new Error('connect timed out')); });
        socket.once('error', (err) => reject(err));
    }));
}

async function tlsHandshake(ip) {
    return step('TLS handshake', () => new Promise((resolve, reject) => {
        const socket = tls.connect({ host: ip, port: PORT, servername: HOSTNAME, timeout: 8000 }, () => {
            const info = `${socket.getProtocol()}, authorized=${socket.authorized}`;
            socket.destroy();
            resolve(info);
        });
        socket.once('timeout', () => { socket.destroy(); reject(new Error('handshake timed out')); });
        socket.once('error', (err) => reject(err));
    }));
}

async function httpRequest() {
    return step(`HTTPS GET (${DIAGNOSTIC_TIMEOUT_MS}ms budget, vs ${HEALTH_CHECK_TIMEOUT_MS}ms in the real health check)`, async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DIAGNOSTIC_TIMEOUT_MS);
        try {
            const response = await fetch(TARGET_URL, { headers: { Accept: 'application/json' }, signal: controller.signal });
            const bodyPreview = (await response.text()).slice(0, 200);
            return `HTTP ${response.status} — body: ${bodyPreview}`;
        } finally {
            clearTimeout(timer);
        }
    });
}

(async () => {
    console.log(`Target: ${TARGET_URL}\n`);

    const dnsResult = await dnsLookup();
    if (!dnsResult.ok) {
        console.log('\nVerdict: DNS resolution failed. This points to local DNS/network config on this');
        console.log('machine (resolver, firewall, or no route to the internet) — not a CDTFA outage.');
        process.exit(1);
    }

    const ip = dnsResult.result.split(' ')[0];
    const tcpResult = await tcpConnect(ip);
    if (!tcpResult.ok) {
        console.log(`\nVerdict: TCP connect to ${ip}:${PORT} failed/timed out. DNS works, so this is most`);
        console.log('likely an outbound firewall/security-group rule on this server blocking that host or');
        console.log('port 443 — check with your network/infra team before assuming CDTFA is down.');
        process.exit(1);
    }

    const tlsResult = await tlsHandshake(ip);
    if (!tlsResult.ok) {
        console.log('\nVerdict: TCP connects but the TLS handshake fails/times out. Likely deep packet');
        console.log('inspection, a TLS-intercepting proxy, or an outdated TLS stack on this server —');
        console.log('still a local/network issue, not CDTFA.');
        process.exit(1);
    }

    const httpResult = await httpRequest();
    console.log('');
    if (!httpResult.ok) {
        console.log('Verdict: DNS, TCP and TLS all succeeded, but the HTTP request itself failed or never');
        console.log(`answered within ${DIAGNOSTIC_TIMEOUT_MS}ms. The network path is fine — this is CDTFA's`);
        console.log('server (or a load balancer/WAF in front of it) being slow or unresponsive.');
    } else if (httpResult.elapsedMs > HEALTH_CHECK_TIMEOUT_MS) {
        console.log(`Verdict: CDTFA answered, but took ${ms(Date.now() - httpResult.elapsedMs)} — longer than the`);
        console.log(`${HEALTH_CHECK_TIMEOUT_MS}ms budget System Center allows. That's exactly why the card shows`);
        console.log('WARNING: it is CDTFA responding slowly, not a failure on our side. Consider this expected');
        console.log('noise unless it happens consistently (check the 7-day latency history in System Center).');
    } else {
        console.log(`Verdict: everything responded normally (${httpResult.elapsedMs}ms total). The WARNING you saw`);
        console.log('was most likely a transient blip on CDTFA\'s side at that moment, not a persistent problem.');
    }
})();
