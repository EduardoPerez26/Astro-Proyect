const express = require('express');

const { verificarToken } = require('../middleware/auth.middleware');
const { pool } = require('../config/database');
const { TOOL_DEFINITIONS, executeTool } = require('../services/chatbotTools.service');

const router = express.Router();
const MAX_TOOL_ROUNDS = 4;

// Anthropic's tool schema is {name, description, input_schema} instead of
// OpenAI's {type:'function', name, description, parameters}.
const ANTHROPIC_TOOLS = TOOL_DEFINITIONS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
}));

// Gemini's Interactions API takes a flat {type:'function', name, description, parameters}
// list (no function_declarations wrapper, unlike the older generateContent tool schema).
const GEMINI_TOOLS = TOOL_DEFINITIONS.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
}));

const PENDING_DOCS_PATTERN = /(documentos?|files?|archivos?).*(pendient|pending)|(pendient|pending).*(documentos?|files?|archivos?)/i;

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const OLLAMA_CHAT_URL = 'http://127.0.0.1:11434/api/chat';

const DEFAULT_PROVIDER = 'gemini';
const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 3000;

router.use(verificarToken);

function getSystemInstruction() {
    return [
        'Your name is Franchie, the friendly virtual assistant mascot for the XBFS Operations Hub.',
        'Introduce yourself as Franchie if asked who you are, but do not repeat your name in every reply.',
        'Answer in the same language as the user.',
        'Be concise, practical, and friendly.',
        'Help users understand and navigate every module in this app, organized by sidebar section:',
        'Accounts Receivable: Stores (/views/tiendas, store availability and reconciliation modules), ' +
            'Reconciliation ledger (/views/conciliacion, upload sales sources and validate differences before posting), ' +
            'Documents (/views/documentos, uploaded Excel/report files and their status), ' +
            'History (/views/historial, comparison history between file versions with filters, bulk actions, and difference detail).',
        'Property Management: Schedules (/views/departments/dashboard-property, standard monthly schedules and prepaid amortization), ' +
            'Prepaid amortization (/views/departments/prepaid-amortization, prepaid bill schedules and source generator), ' +
            'Documents (/views/departments/property-management-documents, saved schedules, prepaid schedules, and source files, with a submit-for-review and approve/request-changes workflow).',
        'Governance & Control: Approval center (/views/approval-center, pending approvals across documents, prepaid schedules, and property schedules), ' +
            'Reports Center (/views/report-center, generate and schedule recurring reports with templates and delivery history).',
        'Information Technology (admin only): Dashboard (/views/dashboard-admin, executive overview of documents, reconciliations, reports, integrations, and notifications), ' +
            'System center (/views/system-center, platform readiness score, configuration checklist, incidents, access load, recommended actions, and the real-time Integration Monitor for the database, Sage Intacct, SMTP, the AI assistant, and the CDTFA tax API), ' +
            'Operational audit (/views/audit-center, immutable log of business and administrative changes), ' +
            'Users (/views/usuarios, user and department directory), ' +
            'Permissions (/views/permisos, per-user module and action access editor), ' +
            'Restaurant control (/views/restaurantes, restaurant/store master data), ' +
            'System errors (/views/system-errors, backend incident log).',
        'Account: Profile and security (/views/perfil, personal profile, password, and MFA), Chat (/views/chat, internal team messaging), and the notification bell in the top bar.',
        'When a user asks what a screen does or where to find something, name the exact module and mention its sidebar section.',
        'Do not invent private company data or database records. If live data is needed, explain exactly what information is missing.',
        'You also have tools to take real actions: list, create, and run scheduled reports in the Report Center; count pending documents; list departments; create a new user account; find a user by name/email; revoke all of a user\'s active sessions (use this if an account is suspected compromised); and grant or revoke a single permission for an existing user. ' +
            'Only call a tool when the user is clearly asking for that action or for live data, not just information about how a screen works. ' +
            'Before creating a report or a user, confirm the key details with the user if they were not already given clearly (report: name, report type, frequency, recipients; user: full name, email, username, password, role, and department). Never invent a password, email, or username on the user\'s behalf. ' +
            'You cannot create a reconciliation yourself: reconciliation amounts come from parsing an uploaded Excel file in the browser, which you cannot do. If the user wants to create a reconciliation, tell them to use the attachment button next to the message box to upload the sales file, then open the Reconciliation screen (/views/conciliacion) to generate and review it. ' +
            'A tool call can fail because of a missing permission or invalid input — if it returns an error, tell the user plainly what went wrong instead of pretending it succeeded.'
    ].join(' ');
}

function normalizeMessage(message = {}) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content = String(message.content || '').trim().slice(0, MAX_MESSAGE_LENGTH);

    return content ? { role, content } : null;
}

function buildInput(messages = [], latestMessage = '') {
    const normalizedHistory = Array.isArray(messages)
        ? messages.map(normalizeMessage).filter(Boolean)
        : [];

    const latest = String(latestMessage || '').trim().slice(0, MAX_MESSAGE_LENGTH);

    if (latest) {
        normalizedHistory.push({
            role: 'user',
            content: latest
        });
    }

    return normalizedHistory.slice(-MAX_HISTORY_MESSAGES);
}

function inputToText(input) {
    return input
        .map(message => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
        .join('\n');
}

function getProvider() {
    return String(process.env.AI_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
}

async function requestOpenAi(input, req) {
    if (!process.env.OPENAI_API_KEY) {
        const error = new Error('OpenAI API key is not configured');
        error.status = 500;
        throw error;
    }

    let conversation = input.slice();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await fetch(OPENAI_RESPONSES_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
                instructions: getSystemInstruction(),
                input: conversation,
                tools: TOOL_DEFINITIONS,
                tool_choice: 'auto'
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('OpenAI chatbot error:', data);

            const error = new Error(data.error?.message || 'The assistant could not answer right now');
            error.status = response.status;
            throw error;
        }

        const output = Array.isArray(data.output) ? data.output : [];
        const functionCalls = output.filter(item => item.type === 'function_call');

        if (!functionCalls.length) {
            return data.output_text || '';
        }

        conversation = conversation.concat(output);

        for (const call of functionCalls) {
            let args = {};
            try {
                args = JSON.parse(call.arguments || '{}');
            } catch {
                args = {};
            }

            const result = await executeTool(call.name, args, req).catch(error => ({
                error: error.message || 'Tool execution failed'
            }));

            conversation.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify(result)
            });
        }
    }

    const error = new Error('The assistant could not complete the request after several tool calls');
    error.status = 500;
    throw error;
}

async function requestGemini(input, req) {
    if (!process.env.GEMINI_API_KEY) {
        const error = new Error('Gemini API key is not configured');
        error.status = 500;
        throw error;
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    // First call sends the flattened conversation as plain text (unchanged from
    // before); once a function call round-trips, the Interactions API continues
    // via previous_interaction_id + a function_result input instead of replaying
    // history, per Google's documented flow.
    let requestInput = inputToText(input);
    let previousInteractionId = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const body = {
            model,
            system_instruction: getSystemInstruction(),
            input: requestInput,
            tools: GEMINI_TOOLS
        };
        if (previousInteractionId) body.previous_interaction_id = previousInteractionId;

        const response = await fetch(GEMINI_INTERACTIONS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('Gemini chatbot error:', data);

            const error = new Error(data.error?.message || 'The assistant could not answer right now');
            error.status = response.status;
            throw error;
        }

        const steps = Array.isArray(data.steps) ? data.steps : [];
        const functionCalls = steps.filter(step => step.type === 'function_call');

        if (!functionCalls.length) {
            return data.output_text || extractGeminiText(data);
        }

        previousInteractionId = data.id;

        const functionResults = [];
        for (const call of functionCalls) {
            const result = await executeTool(call.name, call.arguments || {}, req).catch(error => ({
                error: error.message || 'Tool execution failed'
            }));

            functionResults.push({
                type: 'function_result',
                name: call.name,
                call_id: call.id,
                result: [{ type: 'text', text: JSON.stringify(result) }]
            });
        }

        requestInput = functionResults;
    }

    const error = new Error('Gemini could not complete the request after several tool calls');
    error.status = 500;
    throw error;
}

function extractGeminiText(data = {}) {
    if (typeof data.output_text === 'string') return data.output_text;

    const steps = Array.isArray(data.steps) ? data.steps : [];
    return steps
        .flatMap(step => Array.isArray(step.content) ? step.content : [])
        .map(content => content.text)
        .filter(Boolean)
        .join('\n');
}

async function requestClaude(input, req) {
    if (!process.env.ANTHROPIC_API_KEY) {
        const error = new Error('Anthropic API key is not configured');
        error.status = 500;
        throw error;
    }

    let conversation = input.slice();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await fetch(ANTHROPIC_MESSAGES_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
                max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 800),
                system: getSystemInstruction(),
                messages: conversation,
                tools: ANTHROPIC_TOOLS
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('Claude chatbot error:', data);

            const error = new Error(data.error?.message || 'Claude could not answer right now');
            error.status = response.status;
            throw error;
        }

        const content = Array.isArray(data.content) ? data.content : [];
        const toolUses = content.filter(block => block.type === 'tool_use');

        if (data.stop_reason !== 'tool_use' || !toolUses.length) {
            return content
                .filter(block => block.type === 'text' && block.text)
                .map(block => block.text)
                .join('\n');
        }

        conversation = conversation.concat([{ role: 'assistant', content }]);

        // Execute every tool call from this turn, then return all results in a
        // single user message (splitting them across messages trains the model
        // to stop making parallel tool calls).
        const toolResults = [];
        for (const toolUse of toolUses) {
            const result = await executeTool(toolUse.name, toolUse.input || {}, req).catch(error => ({
                error: error.message || 'Tool execution failed'
            }));

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result)
            });
        }

        conversation.push({ role: 'user', content: toolResults });
    }

    const error = new Error('Claude could not complete the request after several tool calls');
    error.status = 500;
    throw error;
}

async function requestOllama(input) {
    const ollamaUrl = process.env.OLLAMA_URL || OLLAMA_CHAT_URL;

    const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
            stream: false,
            messages: [
                {
                    role: 'system',
                    content: getSystemInstruction()
                },
                ...input
            ]
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error('Ollama chatbot error:', data);

        const error = new Error(data.error || 'Ollama could not answer right now');
        error.status = response.status;
        throw error;
    }

    return data.message?.content || data.response || '';
}

async function requestAssistantReply(input, req) {
    const provider = getProvider();

    // Tool-calling (creating/running reports, live counts) is wired for Gemini's
    // Interactions API, OpenAI's Responses API, and Anthropic's Messages API.
    // Ollama still answers from the system instruction alone until its
    // function-calling format is added to chatbotTools.service.js.
    if (provider === 'gemini') {
        return requestGemini(input, req);
    }

    if (provider === 'ollama') {
        return requestOllama(input);
    }

    if (provider === 'claude' || provider === 'anthropic') {
        return requestClaude(input, req);
    }

    return requestOpenAi(input, req);
}

async function tryIntentShortcut(message, req) {
    const text = String(message || '');
    if (!PENDING_DOCS_PATTERN.test(text)) return null;

    const filtrarPorDepartment = req.usuario?.rol !== 'superadmin'
        && req.usuario?.rol !== 'admin'
        && Boolean(req.departamento?.id);
    const where = filtrarPorDepartment
        ? "WHERE estado = 'pendiente' AND (departamento_id = ? OR departamento_id IS NULL)"
        : "WHERE estado = 'pendiente'";
    const params = filtrarPorDepartment ? [req.departamento.id] : [];

    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total FROM archivos_excel ${where}`,
        params
    );
    const total = Number(rows?.[0]?.total || 0);

    if (total === 0) {
        return "You're all caught up — there are no pending documents right now.";
    }

    if (total === 1) {
        return 'There is 1 document pending review. Open Documents to take a look.';
    }

    return `There are ${total} documents pending review. Open Documents to take a look.`;
}

router.post('/message', async (req, res) => {
    try {
        const input = buildInput(req.body.messages, req.body.message);

        if (!input.length) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const shortcutReply = await tryIntentShortcut(req.body.message, req).catch(error => {
            console.warn('Chatbot intent shortcut failed:', error.message);
            return null;
        });

        const reply = shortcutReply || await requestAssistantReply(input, req);

        res.json({
            success: true,
            provider: getProvider(),
            reply: reply || 'I could not generate a reply.'
        });
    } catch (error) {
        console.error('Chatbot route error:', error);

        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'The assistant could not answer right now'
        });
    }
});

module.exports = router;
