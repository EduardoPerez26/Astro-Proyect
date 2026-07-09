const { notifyAdminsAboutError } = require('../services/error-notification.service');

function isAlertableStatus(statusCode) {
    return Number(statusCode) >= 500 || Number(statusCode) === 413;
}

function attachErrorNotificationCapture() {
    return (req, res, next) => {
        let responseBody;
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);

        res.json = (body) => {
            responseBody = body;
            return originalJson(body);
        };

        res.send = (body) => {
            if (responseBody === undefined) {
                responseBody = body;
            }
            return originalSend(body);
        };

        res.on('finish', () => {
            if (!isAlertableStatus(res.statusCode)) return;

            const err = res.locals?.errorForAdmin || null;

            notifyAdminsAboutError({
                req,
                res,
                err,
                responseBody,
                metadata: {
                    source: 'response_capture',
                    statusCode: res.statusCode
                }
            }).catch(error => {
                console.error('Error notification middleware failed:', error);
            });
        });

        next();
    };
}

module.exports = {
    attachErrorNotificationCapture
};
