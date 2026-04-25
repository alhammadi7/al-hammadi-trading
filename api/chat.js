export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { system, prompt, history = [], images = [], maxTokens = 1500 } = req.body;

    // =====================================================
    // إعدادات النماذج المجانية
    // Groq: سريع جداً - Llama 3.3 70B مجاني
    // Gemini: Google - مجاني بحد يومي سخي
    // =====================================================
    const CONFIG = {
        groq: {
            key: process.env.GROQ_API_KEY,
            url: 'https://api.groq.com/openai/v1/chat/completions',
            model: 'llama-3.3-70b-versatile'  // أفضل نموذج مجاني في Groq
        },
        gemini: {
            key: process.env.GEMINI_API_KEY,
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            model: 'gemini-2.0-flash'
        }
    };

    // الترتيب: Groq أولاً (أسرع) ثم Gemini كـ backup
    const WATERFALL_ORDER = ['groq', 'gemini'];

    function buildPayload(provider) {
        if (provider === 'groq') {
            // Groq يستخدم نفس صيغة OpenAI
            // ملاحظة: Groq لا يدعم الصور في النماذج المجانية
            const messages = [
                { role: 'system', content: system || 'أنت مساعد تداول احترافي.' },
                ...history,
                { role: 'user', content: prompt }
            ];

            return {
                url: CONFIG.groq.url,
                headers: {
                    'Authorization': `Bearer ${CONFIG.groq.key}`,
                    'Content-Type': 'application/json'
                },
                body: {
                    model: CONFIG.groq.model,
                    max_tokens: maxTokens,
                    temperature: 0.7,
                    messages
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

            // Gemini يدعم الصور
            images.forEach(img => {
                currentParts.push({
                    inlineData: { mimeType: img.type, data: img.base64 }
                });
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
            if (provider === 'groq') return data.choices[0].message.content;
            if (provider === 'gemini') return data.candidates[0].content.parts[0].text;
        } catch (e) {
            return null;
        }
    }

    let lastError = "لا يوجد API key مفعّل";

    for (const provider of WATERFALL_ORDER) {
        if (!CONFIG[provider].key) {
            console.log(`[Waterfall] تخطي ${provider}: المفتاح غير موجود`);
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
                console.log(`[Waterfall] نجح مع: ${provider}`);
                return res.status(200).json({ content, provider_used: provider });
            }
        } catch (error) {
            lastError = error.message;
            console.error(`[Waterfall] فشل ${provider}:`, lastError);
        }
    }

    return res.status(500).json({
        error: "فشلت جميع المحركات. آخر خطأ: " + lastError
    });
}
