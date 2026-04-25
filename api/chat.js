export default async function handler(req, res) {
    // التأكد من أن الطلب من نوع POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { system, prompt, history = [], images = [], maxTokens = 1500 } = req.body;

        // قراءة المفاتيح من بيئة Vercel (آمن جداً)
        const AI_CONFIG = {
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
                url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
                model: 'gemini-1.5-pro'
            }
        };

        const AI_PROVIDERS_ORDER = ['claude', 'openai', 'gemini'];

        // 1. مترجم الطلبات (Translates the generic request to specific API formats)
        function formatAIRequest(provider) {
            if (provider === 'claude') {
                const messages = [...history];
                let content = [];
                if (images.length > 0) {
                    images.forEach(img => {
                        content.push({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.base64 } });
                    });
                }
                if (prompt) content.push({ type: 'text', text: prompt });
                
                // Claude needs at least one user message
                if (messages.length === 0 && content.length === 0) {
                     content.push({ type: 'text', text: "Hello" });
                }
                
                if (content.length > 0) {
                    messages.push({ role: 'user', content: content });
                }

                return {
                    url: AI_CONFIG.claude.url,
                    headers: {
                        'x-api-key': AI_CONFIG.claude.key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: AI_CONFIG.claude.model,
                        max_tokens: maxTokens,
                        system: system || '',
                        messages: messages
                    })
                };
            } 
            
            else if (provider === 'openai') {
                const messages = [];
                if (system) messages.push({ role: 'system', content: system });
                history.forEach(m => messages.push({ role: m.role, content: m.content }));
                
                let content = [];
                if (prompt) content.push({ type: 'text', text: prompt });
                if (images.length > 0) {
                    images.forEach(img => {
                        content.push({ type: 'image_url', image_url: { url: `data:${img.type};base64,${img.base64}` } });
                    });
                }
                
                if (content.length > 0) {
                    messages.push({ role: 'user', content: content });
                }

                return {
                    url: AI_CONFIG.openai.url,
                    headers: {
                        'Authorization': `Bearer ${AI_CONFIG.openai.key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: AI_CONFIG.openai.model,
                        max_tokens: maxTokens,
                        messages: messages
                    })
                };
            } 
            
            else if (provider === 'gemini') {
                const urlWithKey = `${AI_CONFIG.gemini.url}?key=${AI_CONFIG.gemini.key}`;
                const contents = [];
                
                history.forEach(m => {
                    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
                });

                const currentParts = [];
                if (prompt) currentParts.push({ text: prompt });
                if (images.length > 0) {
                    images.forEach(img => {
                        currentParts.push({ inlineData: { mimeType: img.type, data: img.base64 } });
                    });
                }
                
                if (currentParts.length > 0) {
                     contents.push({ role: 'user', parts: currentParts });
                }

                const payload = { contents: contents };
                if (system) payload.systemInstruction = { parts: [{ text: system }] };

                return {
                    url: urlWithKey,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                };
            }
        }

        // 2. مترجم الاستجابات (Parses specific API responses to a generic text)
        function parseAIResponse(provider, responseData) {
            if (provider === 'claude') {
                return responseData.content?.map(c => c.text || '').join('') || '';
            } else if (provider === 'openai') {
                return responseData.choices?.[0]?.message?.content || '';
            } else if (provider === 'gemini') {
                return responseData.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
            }
            return '';
        }

        // 3. تنفيذ نظام الشلال (Waterfall Executor)
        let lastError = null;

        for (let provider of AI_PROVIDERS_ORDER) {
            // تخطي المحرك إذا لم يكن له مفتاح في بيئة Vercel
            if (!AI_CONFIG[provider].key) {
                console.log(`[Waterfall] Skipping ${provider} - No API key found.`);
                continue;
            }

            console.log(`[Waterfall] Trying ${provider}...`);
            try {
                const requestData = formatAIRequest(provider);
                const fetchResponse = await fetch(requestData.url, {
                    method: 'POST',
                    headers: requestData.headers,
                    body: requestData.body
                });

                const data = await fetchResponse.json();
                
                if (!fetchResponse.ok) {
                    throw new Error(data.error?.message || data.error || `HTTP ${fetchResponse.status}`);
                }

                const extractedText = parseAIResponse(provider, data);
                if (!extractedText) throw new Error('Empty response from provider');
                
                console.log(`[Waterfall] Success with ${provider}!`);
                
                // إرجاع النتيجة للواجهة الأمامية
                return res.status(200).json({ content: extractedText, provider_used: provider });
                
            } catch (error) {
                console.error(`[Waterfall] ${provider} failed:`, error.message);
                lastError = error;
                // الاستمرار لتجربة المحرك التالي
            }
        }

        // إذا فشلت كل المحركات
        throw new Error('All AI providers failed. Last error: ' + (lastError?.message || 'Unknown'));

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
