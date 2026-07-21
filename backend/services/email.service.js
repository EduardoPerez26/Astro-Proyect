'use strict';

const sgMail = require('@sendgrid/mail');

const MIME_TYPES = {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf'
};

let apiKeyConfigured = null;

function emailStatus() {
    const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
    const from = String(process.env.SENDGRID_FROM || '').trim();
    const ready = Boolean(apiKey && from);

    if (ready && apiKeyConfigured !== apiKey) {
        sgMail.setApiKey(apiKey);
        apiKeyConfigured = apiKey;
    }

    return { ready, from, provider: 'SendGrid' };
}

function mimeTypeForFormat(format) {
    return MIME_TYPES[String(format || '').toLowerCase()] || 'application/octet-stream';
}

async function sendEmail({ to, subject, text, attachments = [] }) {
    const status = emailStatus();
    if (!status.ready) return { delivered: false, reason: 'Email delivery is not configured' };

    const recipients = Array.isArray(to) ? to : [to];
    if (!recipients.length) return { delivered: false, reason: 'No recipients configured' };

    await sgMail.send({
        to: recipients,
        from: status.from,
        subject,
        text,
        attachments: attachments.map(attachment => ({
            filename: attachment.filename,
            content: Buffer.isBuffer(attachment.content)
                ? attachment.content.toString('base64')
                : String(attachment.content),
            type: attachment.type || mimeTypeForFormat(attachment.format),
            disposition: 'attachment'
        }))
    });

    return { delivered: true };
}

// Lightweight reachability check for the integrations health monitor -
// avoids sending a real email just to confirm the API key works.
async function verifyEmailConnectivity(timeoutMs = 6000) {
    const status = emailStatus();
    if (!status.ready) {
        throw new Error('SendGrid is not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch('https://api.sendgrid.com/v3/scopes', {
            headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`SendGrid responded with HTTP ${response.status}`);
        }

        return response;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    emailStatus,
    sendEmail,
    verifyEmailConnectivity
};
