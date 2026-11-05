// Camada de IA: usa o Claude de duas formas possíveis.
// 1) Dentro do claude.ai (Artifact): capacidade "sample" — sem chave, usa a conta da pessoa.
// 2) Fora (GitHub Pages / local): chave da API da Anthropic salva no aparelho.
const AI = (() => {
  const MODEL = "claude-sonnet-5-5";
  let samplePromise = null;
  let apiKey = "";
  let geminiKey = "";
  const GEMINI_TEXT_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

  function getSample() {
    if (!samplePromise) {
      samplePromise = (async () => {
        try {
          if (!window.claude || typeof window.claude.use !== "function") return null;
          return await window.claude.use("sample");
        } catch (e) {
          return null;
        }
      })();
    }
    return samplePromise;
  }

  function setApiKey(k) { apiKey = (k || "").trim(); }
  function setGeminiKey(k) { geminiKey = (k || "").trim(); }

  async function provider() {
    const sample = await getSample();
    if (sample) {
      const lim = await sample.limits().catch(() => null);
      return { kind: "claude-ai", sample, maxImages: lim?.images?.maxCount ?? 0 };
    }
    if (apiKey) return { kind: "api", maxImages: 20 };
    if (geminiKey) return { kind: "gemini", maxImages: 12 };
    return null;
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/data:(.*?);/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function parseJson(text) {
    const t = text.trim();
    try { return JSON.parse(t); } catch (e) { /* tenta extrair */ }
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* segue */ } }
    const start = t.search(/[\[{]/);
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("A resposta da IA não veio no formato esperado. Tente de novo.");
  }

  const ERROR_COPY = {
    not_granted: "Você não liberou o uso do Claude nesta página. Recarregue e permita para usar a IA.",
    rate_limited: "Muitos pedidos seguidos. Espere um minutinho e tente de novo.",
    images_unavailable: "Esta visualização não consegue enviar fotos para a IA.",
    prompt_too_large: "Tem informação demais para um pedido só. Filtre menos peças e tente de novo.",
    invalid_json: "A resposta da IA veio incompleta. Tente de novo.",
    cancelled: "Pedido cancelado.",
  };

  // images: array de dataURLs
  async function askJson(prompt, images = [], { tier = "default", signal } = {}) {
    const p = await provider();
    if (!p) throw new Error("NO_AI");
    if (p.kind === "claude-ai") {
      const blobs = images.slice(0, p.maxImages || 0).map(dataUrlToBlob);
      try {
        return await p.sample.json(prompt, {
          images: blobs.length ? blobs : undefined,
          modelTier: tier,
          signal,
        });
      } catch (e) {
        throw new Error(ERROR_COPY[e?.code] || e?.message || "Não foi possível falar com o Claude agora.");
      }
    }
    if (p.kind === "gemini") return askGemini(prompt, images.slice(0, p.maxImages), signal);
    const content = [];
    for (const d of images.slice(0, p.maxImages)) {
      const [head, b64] = d.split(",");
      content.push({ type: "image", source: { type: "base64", media_type: head.match(/data:(.*?);/)[1], data: b64 } });
    }
    content.push({ type: "text", text: prompt + "\n\nResponda somente com o JSON, sem texto antes ou depois." });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) {
      let msg = `Erro ${res.status} da API.`;
      try { const j = await res.json(); msg = j?.error?.message || msg; } catch (e) { /* ignora */ }
      if (res.status === 401) msg = "Chave da API inválida. Confira em Perfil → Inteligência artificial.";
      throw new Error(msg);
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return parseJson(text);
  }

  async function askGemini(prompt, images, signal) {
    const parts = [{ text: prompt + "\n\nResponda somente com o JSON." }];
    for (const d of images) {
      const [head, b64] = d.split(",");
      parts.push({ inline_data: { mime_type: head.match(/data:(.*?);/)[1], data: b64 } });
    }
    let lastErr = "";
    for (const model of GEMINI_TEXT_MODELS) {
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } }),
        });
      } catch (e) {
        if (e.name === "AbortError") throw e;
        throw new Error("Não consegui falar com o Gemini. Confira a internet. No claude.ai o Gemini fica bloqueado: use a versão web do app.");
      }
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) { lastErr = `Modelo ${model} não encontrado.`; continue; }
      if (!res.ok) {
        const msg = json?.error?.message || `Erro ${res.status}`;
        if (/api key/i.test(msg) || res.status === 401 || res.status === 403) throw new Error("Chave do Gemini inválida ou sem permissão. Confira em Perfil → Provador virtual.");
        if (res.status === 429) throw new Error("Limite do Gemini atingido. Espere um pouco e tente de novo.");
        throw new Error("Gemini: " + msg);
      }
      const text = (json?.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
      if (!text) throw new Error("O Gemini não respondeu. Tente de novo.");
      return parseJson(text);
    }
    throw new Error("Gemini: " + lastErr);
  }

  return { provider, askJson, setApiKey, setGeminiKey, getSample };
})();

// ---------- Imagens ----------
const Img = (() => {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não consegui abrir essa imagem. Tente uma foto JPG ou PNG."));
      img.src = src;
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Não consegui ler o arquivo."));
      r.readAsDataURL(file);
    });
  }

  // Reduz a foto para caber no aparelho e na IA.
  async function fromFile(file, maxSide = 1024, quality = 0.85) {
    const src = await readFile(file);
    const img = await loadImage(src);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", quality);
  }

  // Monta uma "folha de contato": várias peças numeradas numa única imagem.
  async function contactSheet(entries, { cols = 4, tile = 240 } = {}) {
    const rows = Math.ceil(entries.length / cols);
    const labelH = 0;
    const c = document.createElement("canvas");
    c.width = cols * tile;
    c.height = rows * (tile + labelH);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < entries.length; i++) {
      const { num, photo } = entries[i];
      const x = (i % cols) * tile;
      const y = Math.floor(i / cols) * tile;
      try {
        const img = await loadImage(photo);
        const s = Math.min((tile - 8) / img.width, (tile - 8) / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, x + (tile - w) / 2, y + (tile - h) / 2, w, h);
      } catch (e) { /* peça sem foto */ }
      ctx.strokeStyle = "#cccccc";
      ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      ctx.fillStyle = "#111111";
      ctx.fillRect(x + 4, y + 4, 56, 34);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("#" + num, x + 10, y + 22);
    }
    return c.toDataURL("image/jpeg", 0.85);
  }

  return { fromFile, contactSheet };
})();
