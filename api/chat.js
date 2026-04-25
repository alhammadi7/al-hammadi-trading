export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { system, prompt, history = [], images = [], maxTokens = 1500 } = req.body;

    const CONFIG = {
        anthropic: {
            key: process.env.CLAUDE_API_KEY,
            url: 'https://api.anthropic.com/v1/messages',
            model: 'claude-3-5-sonnet-20240620'
        },
        openai: {
            key: process.env.CHATGPT_API_KEY, 
            url: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o'
        },
        gemini: {
            key: process.env.GEMINI_API_KEY,
            // التعديل هنا: استخدام الإصدار v1 المستقر لحل مشكلة "الموديل غير موجود"
            url: 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent',
            model: 'gemini-1.5-flash'
        }
    };

    const WATERFALL_ORDER = ['anthropic', 'openai', 'gemini'];

    function buildPayload(provider) {
        if (provider === 'anthropic') {
            const content = images.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.base64 } }));
            content.push({ type: 'text', text: prompt });
            return {
                url: CONFIG.anthropic.url,
                headers: { 'x-api-key': CONFIG.anthropic.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
                body: { model: CONFIG.anthropic.model, system, max_tokens: maxTokens, messages: [...history, { role: 'user', content }] }
            };
        }
        if (provider === 'openai') {
            const content = [{ type: 'text', text: prompt }];
            images.forEach(img => content.push({ type: 'image_url', image_url: { url: `data:${img.type};base64,${img.base64}` } }));
            return {
                url: CONFIG.openai.url,
                headers: { 'Authorization': `Bearer ${CONFIG.openai.key}`, 'Content-Type': 'application/json' },
                body: { model: CONFIG.openai.model, messages: [{ role: 'system', content: system }, ...history, { role: 'user', content }] }
            };
        }
        if (provider === 'gemini') {
            const contents = [];
            // إضافة تاريخ المحادثة لجمناي
            history.forEach(m => {
                contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
            });
            const parts = [{ text: prompt }];
            images.forEach(img => parts.push({ inlineData: { mimeType: img.type, data: img.base64 } }));
            contents.push({ role: 'user', parts });

            return {
                url: `${CONFIG.gemini.url}?key=${CONFIG.gemini.key}`,
                headers: { 'Content-Type': 'application/json' },
                body: { 
                    contents: contents,
                    systemInstruction: { parts: [{ text: system }] }
                }
            };
        }
    }

    function parseResponse(provider, data) {
        try {
            if (provider === 'anthropic') return data.content[0].text;
            if (provider === 'openai') return data.choices[0].message.content;
            if (provider === 'gemini') return data.candidates[0].content.parts[0].text;
        } catch (e) { return null; }
    }

    let lastError = "لم يتم العثور على مفاتيح فعالة";
    for (const provider of WATERFALL_ORDER) {
        if (!CONFIG[provider].key) continue;
        try {
            const payload = buildPayload(provider);
            const response = await fetch(payload.url, {
                method: 'POST',
                headers: payload.headers,
                body: JSON.stringify(payload.body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || data.error || "خطأ من المزود");
            
            const content = parseResponse(provider, data);
            if (content) return res.status(200).json({ content, provider });
        } catch (e) {
            lastError = e.message;
        }
    }

    res.status(500).json({ error: "فشلت جميع المحركات. آخر خطأ: " + lastError });
}
