// api/chat.js
// Vercel Serverless Function — chạy trên SERVER, không phải trình duyệt.
// Vì vậy API key (process.env.GEMINI_API_KEY) không bao giờ lộ ra cho người dùng.
//
// Cách hoạt động:
// 1. Trình duyệt (index.html) gửi POST tới /api/chat với { prompt: "..." }
// 2. Hàm này nhận prompt, gọi tới Google Gemini API bằng key bí mật lưu trong
//    biến môi trường GEMINI_API_KEY (cấu hình trên Vercel — xem README.md).
// 3. Trả về { reply: "..." } cho trình duyệt.
module.exports = async function handler(req, res) {
  // Cho phép gọi từ trình duyệt (cùng domain nên thực ra không bắt buộc CORS,
  // nhưng thêm cho an toàn nếu bạn tách domain sau này)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel. Xem README.md phần "Bước 4" để thêm biến môi trường này.'
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const prompt = body && body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Thiếu "prompt" trong body request' });
    return;
  }

  try {
    // Endpoint generateContent cổ điển của Gemini — vẫn được hỗ trợ đầy đủ tính
    // đến giữa năm 2026 (song song với Interactions API mới), nên dùng ổn định.
    // Key gửi qua header "X-goog-api-key" — hoạt động với cả 2 định dạng key:
    // key cũ "AIzaSy..." và key mới "AQ.Ab..." (xem README.md phần "Lưu ý về API key").
    const model = 'gemini-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 800,
          // Tắt bước "suy nghĩ" (thinking) — với tác vụ tư vấn ngắn gọn kiểu này,
          // thinking chỉ làm chậm và đôi khi khiến model trả JSON không sạch.
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Lỗi từ Gemini API:', geminiRes.status, errText);
      res.status(502).json({
        error: 'Gemini API trả về lỗi',
        status: geminiRes.status,
        detail: errText
      });
      return;
    }

    const data = await geminiRes.json();
    const reply =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!reply) {
      res.status(502).json({ error: 'Gemini không trả về nội dung hợp lệ', raw: data });
      return;
    }

    res.status(200).json({ reply: reply.trim() });
  } catch (err) {
    console.error('Lỗi gọi Gemini API:', err);
    res.status(500).json({ error: 'Lỗi server khi gọi Gemini API', detail: String(err) });
  }
};
