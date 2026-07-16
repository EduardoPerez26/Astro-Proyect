const express = require('express');

const { verificarToken } = require('../middleware/auth.middleware');

const router = express.Router();

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const OLLAMA_CHAT_URL = 'http://127.0.0.1:11434/api/chat';

const DEFAULT_PROVIDER = 'openai';
const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 3000;

router.use(verificarToken);

function getSystemInstruction() {
    return [
        'You are the XBFS Operations Hub assistant.',
        'Answer in the same language as the user.',
        'Be concise, practical, and friendly.',
        'Help users understand workflows in this app: reconciliations, documents, users, permissions, restaurants, chat, notifications, and property management.',
        'Do not invent private company data or database records. If live data is needed, explain exactly what information is missing.'
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

async function requestOpenAi(input) {
    if (!process.env.OPENAI_API_KEY) {
        const error = new Error('OpenAI API key is not configured');
        error.status = 500;
        throw error;
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
            instructions: getSystemInstruction(),
            input
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error('OpenAI chatbot error:', data);

        const error = new Error(data.error?.message || 'The assistant could not answer right now');
        error.status = response.status;
        throw error;
    }

    return data.output_text || '';
}

async function requestGemini(input) {
    if (!process.env.GEMINI_API_KEY) {
        const error = new Error('Gemini API key is not configured');
        error.status = 500;
        throw error;
    }

    const response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
            model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
            system_instruction: getSystemInstruction(),
            input: inputToText(input)
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error('Gemini chatbot error:', data);

        const error = new Error(data.error?.message || 'The assistant could not answer right now');
        error.status = response.status;
        throw error;
    }

    return data.output_text || extractGeminiText(data);
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

async function requestClaude(input) {
    if (!process.env.ANTHROPIC_API_KEY) {
        const error = new Error('Anthropic API key is not configured');
        error.status = 500;
        throw error;
    }

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
            messages: input
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error('Claude chatbot error:', data);

        const error = new Error(data.error?.message || 'Claude could not answer right now');
        error.status = response.status;
        throw error;
    }

    return Array.isArray(data.content)
        ? data.content
            .filter(block => block.type === 'text' && block.text)
            .map(block => block.text)
            .join('\n')
        : '';
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

async function requestAssistantReply(input) {
    const provider = getProvider();

    if (provider === 'gemini') {
        return requestGemini(input);
    }

    if (provider === 'claude' || provider === 'anthropic') {
        return requestClaude(input);
    }

    if (provider === 'ollama') {
        return requestOllama(input);
    }

    return requestOpenAi(input);
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

        const reply = await requestAssistantReply(input);

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
