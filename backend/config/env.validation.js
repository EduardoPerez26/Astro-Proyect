const REQUIRED_ENV = [
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
    'JWT_SECRET'
];

const RECOMMENDED_ENV = [
    'DB_PASSWORD',
    'FRONTEND_ORIGINS',
    'MFA_ENCRYPTION_KEY'
];

const OPTIONAL_INTEGRATIONS = [
    {
        name: 'Sage Intacct',
        enabledBy: 'INTACCT_COMPANY_ID',
        keys: [
            'INTACCT_SENDER_ID',
            'INTACCT_SENDER_PASSWORD',
            'INTACCT_USER_ID',
            'INTACCT_USER_PASSWORD'
        ]
    },
    {
        name: 'Microsoft Entra ID',
        enabledBy: 'ENTRA_CLIENT_ID',
        keys: [
            'ENTRA_TENANT_ID',
            'ENTRA_CLIENT_ID',
            'ENTRA_CLIENT_SECRET',
            'ENTRA_REDIRECT_URI'
        ]
    },
    {
        name: 'AI assistant',
        enabledBy: 'AI_PROVIDER',
        keys: ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']
    }
];

function present(key) {
    return Boolean(String(process.env[key] || '').trim());
}

function getConfigurationStatus() {
    const missingRequired = REQUIRED_ENV.filter(key => !present(key));
    const missingRecommended = RECOMMENDED_ENV.filter(key => !present(key));
    const integrations = OPTIONAL_INTEGRATIONS.map(integration => {
        const configuredKeys = integration.keys.filter(present);
        const enabled = present(integration.enabledBy) || configuredKeys.length > 0;

        return {
            name: integration.name,
            enabled,
            configured: !enabled || configuredKeys.length > 0,
            configuredKeys: configuredKeys.length,
            expectedKeys: integration.keys.length
        };
    });

    return {
        ok: missingRequired.length === 0,
        missingRequired,
        missingRecommended,
        integrations
    };
}

function validateEnvironment() {
    const status = getConfigurationStatus();
    const isProduction = process.env.NODE_ENV === 'production';

    if (status.missingRequired.length) {
        const message = `Missing required environment variables: ${status.missingRequired.join(', ')}`;

        if (isProduction) {
            throw new Error(message);
        }

        console.warn(`[config] ${message}`);
    }

    if (status.missingRecommended.length) {
        console.warn(
            `[config] Recommended environment variables are not set: ${status.missingRecommended.join(', ')}`
        );
    }

    status.integrations
        .filter(integration => integration.enabled && !integration.configured)
        .forEach(integration => {
            console.warn(`[config] ${integration.name} appears enabled but has no credential keys configured.`);
        });

    return status;
}

module.exports = {
    getConfigurationStatus,
    validateEnvironment
};
