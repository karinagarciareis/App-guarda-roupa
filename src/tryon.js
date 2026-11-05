// Provador virtual: coloca as peças do look na foto do corpo.
// 1) Com IA de imagem (Gemini / "Nano Banana"): gera uma foto realista da pessoa vestindo o look.
// 2) Montagem manual: recorta o fundo das peças e deixa arrastar/redimensionar sobre a foto.
const TryOn = (() => {
  const GEMINI_MODELS = [
    { id: "gemini-3.1-flash-image", label: "Nano Banana 2 (recomendado)" },
    { id: "gemini-2.5-flash-image", label: "Nano Banana (mais barato)" },
    { id: "gemini-3-pro-image", label: "Nano Banana Pro (mais fiel, mais caro)" },
  ];

  const CAT_EN = {
    cima: "top", baixo: "bottom (pants/skirt/shorts)", inteira: "one-piece (dress/jumpsuit)", casaco: "outerwear/jacket",
    calcado: "shoes", bolsa: "bag", acessorio: "accessory",
  };

  const splitDataUrl = (d) => {
    const [head, data] = d.split(",");
    return { mime: head.match(/data:(.*?);/)[1], data };
  };

  // Gera a foto da pessoa vestindo as peças.
  async function generate({ apiKey, model, body, items, occasion, signal }) {
    if (!apiKey) throw new Error("Coloque a chave do Gemini em Perfil → Provador virtual.");
    const list = items.map((it, i) => `Image ${i + 2}: ${CAT_EN[it.category] || "garment"} — ${it.name || ""}${it.color ? ", color " + it.color : ""}`).join("\n");
    const prompt = `Virtual try-on. Image 1 is a photo of a real person. The next images are clothing items and accessories.
Generate a single photorealistic full-body photo of THE SAME PERSON from image 1 wearing ALL of these items together as one outfit:
${list}

Strict rules:
- Keep the person's identity, face, hair, skin tone, body shape and proportions exactly as in image 1. Do not slim, reshape or beautify the body.
- Reproduce each garment faithfully: same color, print, fabric, length, neckline and details as in its photo.
- Natural fit and drape on this body, realistic folds and shadows.
- Full body visible from head to feet, standing, neutral pose similar to image 1, plain clean background, soft natural light.
- Remove any clothing from image 1 that would conflict with the outfit.${occasion ? "\n- Context of the outfit: " + occasion + "." : ""}
Return only the image.`;

    const parts = [{ text: prompt }];
    for (const d of [body, ...items.map((i) => i.photo)]) {
      const { mime, data } = splitDataUrl(d);
      parts.push({ inline_data: { mime_type: mime, data } });
    }
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new Error("Não consegui falar com o Gemini. Se você está no claude.ai, o provador com IA só funciona na versão web do app.");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `Erro ${res.status}`;
      if (res.status === 400 && /api key/i.test(msg)) throw new Error("Chave do Gemini inválida. Confira em Perfil.");
      if (res.status === 404) throw new Error(`O modelo "${model}" não foi encontrado. Troque o modelo em Perfil → Provador virtual.`);
      if (res.status === 429 && /free_tier/i.test(msg)) throw new Error("Sua conta do Google está no plano gratuito, que não gera imagens. Ative o faturamento em aistudio.google.com (Settings → Billing / Upgrade) e tente de novo. A mesma chave continua valendo.");
      if (res.status === 429) throw new Error("Limite do Gemini atingido. Espere alguns minutos e tente de novo.");
      throw new Error("Gemini: " + msg);
    }
    const outParts = json?.candidates?.[0]?.content?.parts || [];
    const img = outParts.find((p) => p.inlineData || p.inline_data);
    if (!img) {
      const reason = json?.candidates?.[0]?.finishReason;
      const txt = outParts.map((p) => p.text).filter(Boolean).join(" ");
      throw new Error(reason === "SAFETY" || reason === "IMAGE_SAFETY"
        ? "O Gemini recusou gerar essa imagem pelo filtro de segurança. Tente outra foto do corpo (ex.: com roupa justa em vez de biquíni)."
        : "O Gemini não devolveu imagem." + (txt ? " Resposta: " + txt.slice(0, 200) : " Tente de novo."));
    }
    const d = img.inlineData || img.inline_data;
    return `data:${d.mimeType || d.mime_type || "image/png"};base64,${d.data}`;
  }

  // ---------- recorte de fundo simples (flood fill a partir das bordas) ----------
  const cutoutCache = new Map();
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function cutout(key, src) {
    if (cutoutCache.has(key)) return cutoutCache.get(key);
    const img = await loadImage(src);
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h); const px = id.data;
    // cor de fundo = média das bordas
    let r = 0, g = 0, b = 0, n = 0;
    const sample = (x, y) => { const o = (y * w + x) * 4; r += px[o]; g += px[o + 1]; b += px[o + 2]; n++; };
    for (let x = 0; x < w; x += 2) { sample(x, 0); sample(x, h - 1); }
    for (let y = 0; y < h; y += 2) { sample(0, y); sample(w - 1, y); }
    r /= n; g /= n; b /= n;
    const TOL = 42 * 42 * 3;
    const near = (o) => { const dr = px[o] - r, dg = px[o + 1] - g, db = px[o + 2] - b; return dr * dr + dg * dg + db * db < TOL; };
    const seen = new Uint8Array(w * h); const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    let removed = 0;
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue; seen[p] = 1;
      const o = p * 4;
      if (!near(o)) continue;
      px[o + 3] = 0; removed++;
      const x = p % w;
      if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
      if (p >= w) stack.push(p - w); if (p < w * (h - 1)) stack.push(p + w);
    }
    // se quase nada saiu ou quase tudo saiu, usa a foto original
    const ratio = removed / (w * h);
    if (ratio > 0.03 && ratio < 0.92) ctx.putImageData(id, 0, 0);
    const out = c.toDataURL("image/png");
    cutoutCache.set(key, out);
    return out;
  }

  // posição inicial (em % da foto) por categoria
  const DEFAULT_POS = {
    acessorio: { x: 50, y: 10, w: 18 }, casaco: { x: 50, y: 34, w: 52 }, cima: { x: 50, y: 32, w: 42 },
    inteira: { x: 50, y: 42, w: 46 }, baixo: { x: 50, y: 62, w: 38 }, bolsa: { x: 76, y: 52, w: 22 }, calcado: { x: 50, y: 92, w: 30 },
  };
  const ORDER = ["baixo", "inteira", "cima", "casaco", "calcado", "bolsa", "acessorio"];

  // ---------- montagem manual ----------
  // container: elemento onde desenhar; onSave(dataUrl) recebe a imagem final.
  async function openMontage(container, { body, items, onSave, onCancel }) {
    const layers = [];
    container.innerHTML = `<p class="small" style="margin:0">Arraste as peças sobre a foto. Toque numa peça para escolher e ajustar o tamanho.</p>
      <div class="stage" id="mt-stage"><img src="${body}" alt="Sua foto" draggable="false"></div>
      <div class="stack" id="mt-controls">
        <div class="field"><label for="mt-size">Tamanho da peça selecionada</label><input type="range" id="mt-size" min="5" max="100" value="40"></div>
        <div class="field"><label for="mt-rot">Girar</label><input type="range" id="mt-rot" min="-45" max="45" value="0"></div>
        <div class="row"><button class="btn small" id="mt-front">Trazer para frente</button><button class="btn small" id="mt-back">Mandar para trás</button><button class="btn small" id="mt-hide">Esconder peça</button></div>
      </div>
      <div class="row"><button class="btn primary" id="mt-save">Salvar foto do look</button><button class="btn ghost" id="mt-cancel">Cancelar</button></div>`;
    const stage = container.querySelector("#mt-stage");
    const size = container.querySelector("#mt-size");
    const rot = container.querySelector("#mt-rot");
    let selected = null;

    const sorted = items.slice().sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
    for (const it of sorted) {
      const pos = { ...(DEFAULT_POS[it.category] || { x: 50, y: 50, w: 30 }), r: 0 };
      const el = document.createElement("img");
      el.className = "layer";
      el.alt = it.name || "";
      el.draggable = false;
      el.src = await cutout(it.id, it.photo);
      stage.appendChild(el);
      const layer = { it, el, pos };
      layers.push(layer);
      place(layer);
      el.addEventListener("pointerdown", (e) => startDrag(e, layer));
    }
    if (layers.length) select(layers[layers.length - 1]);

    function place(l) {
      l.el.style.left = l.pos.x + "%"; l.el.style.top = l.pos.y + "%"; l.el.style.width = l.pos.w + "%";
      l.el.style.transform = `translate(-50%, -50%) rotate(${l.pos.r}deg)`;
    }
    function select(l) {
      selected = l;
      layers.forEach((x) => x.el.classList.toggle("sel", x === l));
      size.value = l.pos.w; rot.value = l.pos.r;
    }
    function startDrag(e, l) {
      e.preventDefault(); select(l);
      const rect = stage.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, ox = l.pos.x, oy = l.pos.y;
      const move = (ev) => {
        l.pos.x = Math.max(0, Math.min(100, ox + ((ev.clientX - sx) / rect.width) * 100));
        l.pos.y = Math.max(0, Math.min(100, oy + ((ev.clientY - sy) / rect.height) * 100));
        place(l);
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    }
    size.addEventListener("input", () => { if (selected) { selected.pos.w = Number(size.value); place(selected); } });
    rot.addEventListener("input", () => { if (selected) { selected.pos.r = Number(rot.value); place(selected); } });
    container.querySelector("#mt-front").onclick = () => { if (selected) { stage.appendChild(selected.el); layers.push(layers.splice(layers.indexOf(selected), 1)[0]); } };
    container.querySelector("#mt-back").onclick = () => { if (selected) { stage.insertBefore(selected.el, stage.children[1]); layers.unshift(layers.splice(layers.indexOf(selected), 1)[0]); } };
    container.querySelector("#mt-hide").onclick = () => { if (selected) { selected.el.hidden = !selected.el.hidden; } };
    container.querySelector("#mt-cancel").onclick = () => onCancel?.();
    container.querySelector("#mt-save").onclick = async () => {
      const base = await loadImage(body);
      const W = base.width, H = base.height;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.drawImage(base, 0, 0, W, H);
      for (const l of layers) {
        if (l.el.hidden) continue;
        const im = await loadImage(l.el.src);
        const w = (l.pos.w / 100) * W, h = w * (im.height / im.width);
        ctx.save();
        ctx.translate((l.pos.x / 100) * W, (l.pos.y / 100) * H);
        ctx.rotate((l.pos.r * Math.PI) / 180);
        ctx.drawImage(im, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      onSave?.(c.toDataURL("image/jpeg", 0.85));
    };
  }

  return { GEMINI_MODELS, generate, openMontage };
})();
