export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { system, prompt, history = [], images = [], maxTokens = 1500 } = req.body;

    const CONFIG = {
        claude: {
            key: process.env.CLAUDE_API_KEY,
            url: 'https://api.anthropic.com/v1/messages',
            model: 'claude-3-5-sonnet-20240620'
        },
        openai: {
            key: process.env.OPENAI_API_KEY,
            url: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o'
        },
        gemini: {
            key: process.env.GEMINI_API_KEY,
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            model: 'gemini-2.0-flash'
        }
    };  // ← قوس واحد فقط هنا

    const WATERFALL_ORDER = ['claude', 'openai', 'gemini'];

    function buildPayload(provider) {
        if (provider === 'claude') {
            const content = images.map(img => ({
                type: 'image',
                source: { type: 'base64', media_type: img.type, data: img.base64 }
            }));
            content.push({ type: 'text', text: prompt });
            return {
                url: CONFIG.claude.url,
                headers: {
                    'x-api-key': CONFIG.claude.key,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                body: {
                    model: CONFIG.claude.model,
                    system: system || '',
                    max_tokens: maxTokens,
                    messages: [...history, { role: 'user', content }]
                }
            };
        }

        if (provider === 'openai') {
            const content = [{ type: 'text', text: prompt }];
            images.forEach(img => {
                content.push({ type: 'image_url', image_url: { url: `data:${img.type};base64,${img.base64}` } });
            });
            return {
                url: CONFIG.openai.url,
                headers: {
                    'Authorization': `Bearer ${CONFIG.openai.key}`,
                    'Content-Type': 'application/json'
                },
                body: {
                    model: CONFIG.openai.model,
                    max_tokens: maxTokens,
                    messages: [
                        { role: 'system', content: system || '' },
                        ...history,
                        { role: 'user', content }
                    ]
                }
            };
        }

        if (provider === 'gemini') {
            const instructionPrefix = system ? `[SYSTEM INSTRUCTION: ${system}]\n\n` : '';
            const mergedPrompt = `${instructionPrefix}USER QUESTION: ${prompt}`;
            const contents = [];
            history.forEach(m => {
                contents.push({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                });
            });
            const currentParts = [{ text: mergedPrompt }];
            images.forEach(img => {
                currentParts.push({ inlineData: { mimeType: img.type, data: img.base64 } });
            });
            contents.push({ role: 'user', parts: currentParts });
            return {
                url: `${CONFIG.gemini.url}?key=${CONFIG.gemini.key}`,
                headers: { 'Content-Type': 'application/json' },
                body: { contents }
            };
        }
    }

    function parseResponse(provider, data) {
        try {
            if (provider === 'claude') return data.content[0].text;
            if (provider === 'openai') return data.choices[0].message.content;
            if (provider === 'gemini') return data.candidates[0].content.parts[0].text;
        } catch (e) {
            return null;
        }
    }

    let lastError = "No effective API keys found";

    for (const provider of WATERFALL_ORDER) {
        if (!CONFIG[provider].key) {
            console.log(`[Waterfall] Skipping ${provider}: Key missing.`);
            continue;
        }
        try {
            const payload = buildPayload(provider);
            const response = await fetch(payload.url, {
                method: 'POST',
                headers: payload.headers,
                body: JSON.stringify(payload.body)
            });
            const data = await response.json();
            if (!response.ok) {
                const errMsg = data.error?.message || data.error || `HTTP ${response.status}`;
                throw new Error(`${provider} Error: ${errMsg}`);
            }
            const content = parseResponse(provider, data);
            if (content) {
                return res.status(200).json({ content, provider_used: provider });
            }
        } catch (error) {
            lastError = error.message;
            console.error(`[Waterfall] ${provider} failed:`, lastError);
        }
    }

    return res.status(500).json({ error: "فشلت جميع المحركات. آخر خطأ: " + lastError });
}
