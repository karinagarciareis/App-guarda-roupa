// Provador — guarda-roupa online (MVP)
// Tudo em JS puro, sem build. Estado local + IndexedDB.

const CATS = [
  { id: "cima", label: "Partes de cima", short: "Cima" },
  { id: "baixo", label: "Partes de baixo", short: "Baixo" },
  { id: "inteira", label: "Vestidos e macacões", short: "Peça única" },
  { id: "casaco", label: "Casacos", short: "Casacos" },
  { id: "calcado", label: "Calçados", short: "Calçados" },
  { id: "bolsa", label: "Bolsas", short: "Bolsas" },
  { id: "acessorio", label: "Acessórios", short: "Acessórios" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const OCCASIONS = ["Show", "Festa", "Balada", "Trabalho", "Encontro", "Dia a dia", "Praia", "Viagem", "Casamento", "Jantar"];
const SOURCE_LABEL = { tenho: "Tenho", desejo: "Quero ter" };

const state = {
  ready: false,
  profile: null,
  items: [],
  looks: [],
  settings: { apiKey: "", geminiKey: "", geminiModel: TryOn.GEMINI_MODELS[0].id, autoTryOn: true },
  aiKind: null, // "claude-ai" | "api" | null
  view: "closet",
  closet: { source: "tenho", cat: "all" },
  create: {
    occasion: "Show",
    details: "",
    refText: "",
    refImage: null,
    sources: "ambos",
    sections: CATS.map((c) => c.id),
    pinned: [],
    useBody: true,
    count: 3,
  },
  results: null, // { looks, bodyRead, refRead, mode }
  loading: false,
  error: null,
};

// ---------- utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const itemById = (id) => state.items.find((i) => i.id === id);
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let toastTimer;
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function persist(...keys) {
  for (const k of keys) await Store.set(k, state[k]);
}

async function refreshAi() {
  AI.setApiKey(state.settings.apiKey);
  AI.setGeminiKey(state.settings.geminiKey);
  const p = await AI.provider();
  state.aiKind = p ? p.kind : null;
  render();
}

// ---------- ícones ----------
const ICON = {
  closet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V9"/><path d="M12 9 3 15.5c-.8.6-.4 1.5.5 1.5h17c.9 0 1.3-.9.5-1.5L12 9Z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

// ---------- renderização ----------
function render() {
  const root = $("#app");
  if (!state.ready) { root.innerHTML = '<div class="loading"><div class="spinner"></div>Abrindo seu provador…</div>'; return; }
  if (!state.profile) { root.innerHTML = renderOnboarding(); return; }

  const views = { closet: renderCloset, create: renderCreate, looks: renderLooks, profile: renderProfile };
  root.innerHTML = `
    <header class="topbar">
      <h1 class="brand">Provador</h1>
      <span class="sub">${esc(state.profile.name ? "Oi, " + state.profile.name : "")}</span>
    </header>
    <main id="view">${views[state.view]()}</main>
    ${state.view === "closet" ? `<button class="btn primary fab" data-action="add-item">${ICON.plus} Adicionar peça</button>` : ""}
    <nav class="tabbar" aria-label="Navegação"><div class="inner">
      ${tab("closet", "Guarda-roupa", ICON.closet)}
      ${tab("create", "Criar look", ICON.spark)}
      ${tab("looks", "Looks salvos", ICON.heart)}
      ${tab("profile", "Perfil", ICON.user)}
    </div></nav>`;
}
function tab(id, label, icon) {
  return `<button data-action="nav" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ""}>${icon}<span>${label}</span></button>`;
}

function photoDrop(id, src, title, hint, wide = false) {
  return `<label class="photo-drop ${wide ? "wide" : ""}" for="${id}">
    ${src ? `<img src="${src}" alt="">` : `<span class="ph-text"><b>${esc(title)}</b><span>${esc(hint)}</span></span>`}
    <input type="file" id="${id}" accept="image/*">
  </label>`;
}

function renderOnboarding() {
  const d = state.onboardDraft || (state.onboardDraft = { name: "", photo: null, notes: "" });
  return `<section class="onboard">
    <div>
      <p class="eyebrow">Seu guarda-roupa online</p>
      <h1 class="brand">Provador</h1>
      <p class="view-lead">Cadastre o que você já tem e o que quer comprar. Depois é só dizer a ocasião e a referência que a gente monta os looks misturando tudo.</p>
    </div>
    <div class="card">
      <div class="field">
        <label for="ob-name">Seu nome</label>
        <input type="text" id="ob-name" value="${esc(d.name)}" placeholder="Seu nome" autocomplete="given-name">
      </div>
      <div class="field">
        <span class="label">Foto do corpo</span>
        <span class="hint">De frente, corpo inteiro, com roupa justa ou de biquíni. Serve para a IA entender suas proporções e sugerir cortes que te valorizam.</span>
        ${photoDrop("ob-photo", d.photo, "Toque para escolher a foto", "Corpo inteiro, de frente, boa luz")}
      </div>
      <div class="field">
        <label for="ob-notes">Sobre você (opcional)</label>
        <textarea id="ob-notes" placeholder="Ex.: 1,62 m, veste 38/M, calça 40. Gosto de valorizar a cintura, não curto decote profundo.">${esc(d.notes)}</textarea>
      </div>
      <p class="small">Suas fotos ficam guardadas só neste aparelho. Elas só saem daqui quando você pede um look para a IA.</p>
      <button class="btn primary block" data-action="finish-onboarding">Começar</button>
    </div>
  </section>`;
}

function renderCloset() {
  const { source, cat } = state.closet;
  const bySource = state.items.filter((i) => i.source === source);
  const nTenho = state.items.filter((i) => i.source === "tenho").length;
  const nDesejo = state.items.length - nTenho;
  const chips = [`<button class="chip" data-action="closet-cat" data-cat="all" aria-pressed="${cat === "all"}">Todas<span class="n">${bySource.length}</span></button>`]
    .concat(CATS.map((c) => {
      const n = bySource.filter((i) => i.category === c.id).length;
      return `<button class="chip" data-action="closet-cat" data-cat="${c.id}" aria-pressed="${cat === c.id}">${c.short}<span class="n">${n}</span></button>`;
    })).join("");

  let body;
  if (!bySource.length) {
    body = `<div class="empty">
      <strong>${source === "tenho" ? "Seu guarda-roupa está vazio" : "Nenhuma peça na lista de desejos"}</strong>
      <span>${source === "tenho" ? "Tire fotos das peças que você já tem: blusas, calças, sapatos, bolsas, acessórios." : "Salve prints de peças que você quer comprar. A IA vai combinar com o que você já tem."}</span>
      <button class="btn primary" data-action="add-item">${ICON.plus} Adicionar a primeira peça</button>
    </div>`;
  } else if (cat === "all") {
    body = CATS.map((c) => {
      const list = bySource.filter((i) => i.category === c.id);
      if (!list.length) return "";
      return `<div class="section-head"><h3>${c.label}</h3><span class="small">${list.length}</span></div>
        <div class="grid">${list.map((i) => itemCard(i)).join("")}</div>`;
    }).join("");
  } else {
    const list = bySource.filter((i) => i.category === cat);
    body = list.length ? `<div class="grid" style="margin-top:8px">${list.map((i) => itemCard(i)).join("")}</div>`
      : `<div class="empty"><span>Nada em ${esc(CAT[cat].label.toLowerCase())} por aqui ainda.</span><button class="btn" data-action="add-item">${ICON.plus} Adicionar</button></div>`;
  }

  return `
    <div class="segmented" role="group" aria-label="Seção do guarda-roupa">
      <button data-action="closet-source" data-source="tenho" aria-pressed="${source === "tenho"}">Já tenho <span class="count">${nTenho}</span></button>
      <button data-action="closet-source" data-source="desejo" aria-pressed="${source === "desejo"}">Quero ter <span class="count">${nDesejo}</span></button>
    </div>
    <div class="chips" role="group" aria-label="Categorias">${chips}</div>
    ${body}`;
}

function itemCard(i, { selectable = false, selected = false, showSource = false } = {}) {
  return `<button class="item ${selected ? "selected" : ""}" data-action="${selectable ? "toggle-pick" : "open-item"}" data-id="${i.id}">
    <img class="ph" src="${i.thumb || i.photo}" alt="" loading="lazy">
    ${showSource ? `<span class="tag ${i.source === "desejo" ? "want" : ""}">${SOURCE_LABEL[i.source]}</span>` : ""}
    ${selected ? '<span class="check">✓</span>' : ""}
    <span class="meta"><span class="name">${esc(i.name || "Sem nome")}</span><span class="cat">${esc(CAT[i.category]?.short || "")}${i.color ? " · " + esc(i.color) : ""}</span></span>
  </button>`;
}

function renderCreate() {
  const c = state.create;
  const occ = OCCASIONS.map((o) => `<button class="chip" data-action="occasion" data-v="${esc(o)}" aria-pressed="${c.occasion === o}">${o}</button>`).join("");
  const secs = CATS.map((s) => `<button class="chip" data-action="toggle-section" data-cat="${s.id}" aria-pressed="${c.sections.includes(s.id)}">${s.short}</button>`).join("");
  const pinned = c.pinned.map(itemById).filter(Boolean);
  const aiNote = state.aiKind ? "" : `<div class="notice warn">A IA ainda não está conectada neste aparelho. Você pode sortear combinações sem IA, ou colocar sua chave em <a href="#" data-action="nav" data-view="profile">Perfil</a>.</div>`;
  const hasItems = state.items.length > 0;

  return `
    <h2 class="view-title">Criar look</h2>
    <p class="view-lead">Conte a ocasião e a referência. A IA mistura o que você já tem com o que quer comprar.</p>
    ${!hasItems ? `<div class="notice warn">Cadastre algumas peças no guarda-roupa primeiro.</div>` : ""}
    <div class="stack">
      <div class="card">
        <div class="field"><span class="label">Ocasião</span><div class="chips wrap">${occ}</div></div>
        <div class="field">
          <label for="cr-details">Detalhes da ocasião</label>
          <textarea id="cr-details" data-model="details" placeholder="Ex.: show do Coldplay no Morumbi, à noite, vai esfriar e vou ficar em pé muito tempo.">${esc(c.details)}</textarea>
        </div>
      </div>

      <div class="card">
        <div class="field">
          <label for="cr-ref">Referência de estilo (opcional)</label>
          <input type="text" id="cr-ref" data-model="refText" value="${esc(c.refText)}" placeholder="Ex.: Taylor Swift na Eras Tour, estética old money, look do Pinterest">
          <span class="hint">A IA não abre links. Se a referência é do Pinterest ou Instagram, mande o print aqui embaixo.</span>
        </div>
        ${photoDrop("cr-refimg", c.refImage, "Imagem de referência", "Print do Pinterest, foto de artista…", true)}
        ${c.refImage ? `<button class="btn ghost small" data-action="clear-ref">Remover imagem</button>` : ""}
      </div>

      <div class="card">
        <div class="field">
          <span class="label">Usar peças de</span>
          <div class="chips wrap">
            ${["ambos", "tenho", "desejo"].map((s) => `<button class="chip" data-action="sources" data-v="${s}" aria-pressed="${c.sources === s}">${{ ambos: "Tenho + Quero ter", tenho: "Só o que tenho", desejo: "Só o que quero ter" }[s]}</button>`).join("")}
          </div>
        </div>
        <div class="field"><span class="label">Seções que podem entrar</span><div class="chips wrap">${secs}</div></div>
        <div class="field">
          <span class="label">Peças obrigatórias</span>
          <span class="hint">Quer usar uma peça específica? Ela vai aparecer em todos os looks.</span>
          ${pinned.length ? `<div class="grid">${pinned.map((i) => itemCard(i, { showSource: true })).join("")}</div>` : ""}
          <div class="row"><button class="btn small" data-action="pick-pinned" ${hasItems ? "" : "disabled"}>${pinned.length ? "Trocar peças" : "Escolher peças"}</button>
          ${pinned.length ? `<button class="btn ghost small" data-action="clear-pinned">Limpar</button>` : ""}</div>
        </div>
        <label class="toggle" for="cr-body"><span>Considerar minha foto do corpo</span><input type="checkbox" id="cr-body" data-model="useBody" ${c.useBody ? "checked" : ""} ${state.profile.photo ? "" : "disabled"}></label>
        <div class="field">
          <label for="cr-count">Quantos looks</label>
          <select id="cr-count" data-model="count">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${c.count === n ? "selected" : ""}>${n}</option>`).join("")}</select>
        </div>
      </div>

      ${aiNote}
      <div class="stack">
        <button class="btn primary block" data-action="generate" ${!hasItems || state.loading || !state.aiKind ? "disabled" : ""}>${ICON.spark.replace("<svg", '<svg width="18" height="18"')} Montar looks com IA</button>
        <button class="btn block" data-action="shuffle" ${!hasItems || state.loading ? "disabled" : ""}>Sortear combinação sem IA</button>
      </div>
      <div id="results">${renderResults()}</div>
    </div>`;
}

function renderResults() {
  if (state.loading) return `<div class="loading"><div class="spinner"></div><span>A stylist está analisando suas peças${state.create.refText || state.create.refImage ? " e a referência" : ""}. Leva uns 30 segundos…</span></div>`;
  if (state.error) return `<div class="notice warn">${esc(state.error)}</div>`;
  const r = state.results;
  if (!r) return "";
  return `<div class="stack">
    <div class="section-head"><h3>${r.mode === "ai" ? "Looks sugeridos" : "Combinações sorteadas"}</h3><span class="small">${r.looks.length}</span></div>
    ${r.bodyRead ? `<div class="notice"><b>Leitura do corpo:</b> ${esc(r.bodyRead)}</div>` : ""}
    ${r.refRead ? `<div class="notice"><b>Sobre a referência:</b> ${esc(r.refRead)}</div>` : ""}
    ${r.looks.map((l, idx) => lookCard(l, { index: idx, saved: false })).join("")}
  </div>`;
}

function tryOnBlock(l, scopeAttrs) {
  const canAi = !!state.settings.geminiKey && !!state.profile.photo;
  let media = "";
  if (l.tryOnLoading) {
    media = `<div class="tryon loading-tryon">${state.profile.photo ? `<img src="${state.profile.photo}" alt="">` : ""}<div class="tryon-overlay"><div class="spinner"></div><span>Vestindo o look em você…</span></div></div>`;
  } else if (l.tryOn) {
    media = `<div class="tryon"><img src="${l.tryOn}" alt="Você vestindo o look ${esc(l.title)}"></div>`;
  }
  const err = l.tryOnError ? `<div class="notice warn" style="margin:12px 16px 0">${esc(l.tryOnError)}</div>` : "";
  const btns = state.profile.photo ? `<div class="row tryon-actions">
      ${canAi ? `<button class="btn small primary" data-action="tryon-ai" ${scopeAttrs} ${l.tryOnLoading ? "disabled" : ""}>${l.tryOn ? "Gerar de novo" : "Vestir em mim (IA)"}</button>` : ""}
      <button class="btn small" data-action="tryon-manual" ${scopeAttrs}>Montar na minha foto</button>
      ${!canAi ? `<span class="small">Para a foto realista, conecte o provador em Perfil.</span>` : ""}
    </div>` : `<div class="tryon-actions small">Adicione sua foto do corpo em Perfil para ver os looks em você.</div>`;
  return media + err + btns;
}

function lookCard(l, { index, saved }) {
  const scopeAttrs = saved ? `data-scope="saved" data-id="${l.id}"` : `data-scope="result" data-index="${index}"`;
  const items = l.itemIds.map(itemById).filter(Boolean);
  const tiles = items.map((i) => `<div class="tile"><img src="${i.thumb || i.photo}" alt="${esc(i.name)}"><span class="tag ${i.source === "desejo" ? "want" : ""}">${SOURCE_LABEL[i.source]}</span></div>`).join("");
  const toBuy = items.filter((i) => i.source === "desejo");
  return `<article class="look">
    ${tryOnBlock(l, scopeAttrs)}
    <div class="collage ${l.tryOn ? "mini" : ""}" style="grid-template-columns:repeat(${items.length === 2 || items.length === 4 ? 2 : 3},1fr)">${tiles || '<div class="tile"></div>'}</div>
    <div class="body">
      ${saved && l.occasion ? `<span class="eyebrow">${esc(l.occasion)}${l.createdAt ? " · " + new Date(l.createdAt).toLocaleDateString("pt-BR") : ""}</span>` : ""}
      <h4>${esc(l.title)}</h4>
      <div class="pieces">${items.map((i) => esc(i.name || CAT[i.category]?.short)).join(" + ")}</div>
      ${l.why ? `<p style="margin:0">${esc(l.why)}</p>` : ""}
      ${l.tips?.length ? `<ul>${l.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${toBuy.length ? `<div class="buy"><b>Da lista de desejos:</b> ${toBuy.map((i) => i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.name)}</a>` : esc(i.name)).join(", ")}</div>` : ""}
      ${l.buy?.length ? `<div class="buy"><b>Para completar, vale comprar:</b><ul>${l.buy.map((b) => `<li>${esc(b.peca)}${b.por_que ? " — " + esc(b.por_que) : ""}</li>`).join("")}</ul></div>` : ""}
      <div class="row">
        ${saved ? `<button class="btn small danger" data-action="delete-look" data-id="${l.id}">Excluir</button>`
          : `<button class="btn small primary" data-action="save-look" data-index="${index}" ${l.savedId ? "disabled" : ""}>${l.savedId ? "Salvo" : "Salvar look"}</button>`}
      </div>
    </div>
  </article>`;
}

function renderLooks() {
  if (!state.looks.length) {
    return `<h2 class="view-title">Looks salvos</h2>
      <div class="empty"><strong>Nenhum look salvo ainda</strong><span>Crie looks e salve os que você gostar. Eles ficam aqui para consultar antes de sair.</span>
      <button class="btn primary" data-action="nav" data-view="create">Criar look</button></div>`;
  }
  return `<h2 class="view-title">Looks salvos</h2><p class="view-lead">${state.looks.length} ${state.looks.length === 1 ? "look" : "looks"}</p>
    <div class="stack">${state.looks.map((l) => lookCard(l, { saved: true })).join("")}</div>`;
}

function renderProfile() {
  const p = state.profile;
  const aiStatus = state.aiKind === "claude-ai" ? "Conectado ao Claude pela sua conta do claude.ai. Não precisa de chave."
    : state.aiKind === "api" ? "Usando sua chave da API da Anthropic."
    : state.aiKind === "gemini" ? "Usando o Gemini (a mesma chave do provador virtual) para montar os looks."
    : "Sem IA conectada. Abra o app pelo claude.ai ou coloque uma chave da API abaixo.";
  return `<h2 class="view-title">Perfil</h2>
    <div class="stack">
      <div class="card">
        <div class="row" style="align-items:flex-start;flex-wrap:nowrap">
          ${p.photo ? `<img class="profile-photo" src="${p.photo}" alt="Sua foto do corpo">` : `<div class="profile-photo"></div>`}
          <div class="stack" style="min-width:0;flex:1">
            <div class="field"><label for="pf-name">Nome</label><input type="text" id="pf-name" value="${esc(p.name)}"></div>
            <label class="btn small" for="pf-photo" style="width:fit-content">${p.photo ? "Trocar foto" : "Adicionar foto"}<input type="file" id="pf-photo" accept="image/*" hidden></label>
          </div>
        </div>
        <div class="field"><label for="pf-notes">Sobre você</label>
          <textarea id="pf-notes" placeholder="Altura, manequim, o que gosta de valorizar, o que evita…">${esc(p.notes)}</textarea></div>
        <button class="btn primary" data-action="save-profile">Salvar perfil</button>
      </div>

      <div class="card">
        <span class="label" style="font-weight:700">Inteligência artificial</span>
        <div class="notice ${state.aiKind ? "" : "warn"}">${aiStatus}</div>
        ${state.aiKind === "claude-ai" ? "" : `<div class="field">
          <label for="pf-key">Chave da API da Anthropic</label>
          <input type="password" id="pf-key" value="${esc(state.settings.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
          <span class="hint">Fica salva só neste aparelho. Crie em console.anthropic.com.</span>
        </div>
        <button class="btn" data-action="save-key">Salvar chave</button>`}
      </div>

      <div class="card">
        <span class="label" style="font-weight:700">Provador virtual (ver o look no seu corpo)</span>
        <p class="small" style="margin:0">Gera uma foto realista sua vestindo o look, usando a IA de imagem do Google (Gemini). Sem chave, você ainda pode montar o look na sua foto à mão.</p>
        ${window.claude ? `<div class="notice warn">Dentro do claude.ai a foto com IA fica bloqueada. Para usar, abra a versão web do app.</div>` : ""}
        <div class="field">
          <label for="pf-gkey">Chave da API do Gemini</label>
          <input type="password" id="pf-gkey" value="${esc(state.settings.geminiKey)}" placeholder="AIza…" autocomplete="off">
          <span class="hint">Crie em aistudio.google.com → Get API key. A geração de imagem pode exigir faturamento ativo. Fica salva só neste aparelho.</span>
        </div>
        <div class="field">
          <label for="pf-gmodel">Modelo</label>
          <select id="pf-gmodel">${TryOn.GEMINI_MODELS.map((m) => `<option value="${m.id}" ${state.settings.geminiModel === m.id ? "selected" : ""}>${esc(m.label)}</option>`).join("")}
            ${TryOn.GEMINI_MODELS.some((m) => m.id === state.settings.geminiModel) ? "" : `<option value="${esc(state.settings.geminiModel)}" selected>${esc(state.settings.geminiModel)}</option>`}</select>
        </div>
        <label class="toggle" for="pf-auto"><span>Vestir automaticamente ao criar looks</span><input type="checkbox" id="pf-auto" ${state.settings.autoTryOn ? "checked" : ""}></label>
        <button class="btn" data-action="save-gemini">Salvar provador</button>
      </div>

      <div class="card">
        <span class="label" style="font-weight:700">Seus dados</span>
        <p class="small" style="margin:0">${state.items.length} peças e ${state.looks.length} looks guardados neste aparelho.${Store.isMemoryOnly() ? " Atenção: este navegador não está salvando os dados; eles somem ao fechar." : ""}</p>
        <div id="wipe-area"><button class="btn danger" data-action="wipe-ask">Apagar tudo</button></div>
      </div>
    </div>`;
}

// ---------- folhas (modais) ----------
function openSheet(html) {
  closeSheet();
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.id = "sheet";
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeSheet(); });
  document.body.appendChild(wrap);
  document.body.style.overflow = "hidden";
  return wrap;
}
function closeSheet() {
  const s = $("#sheet");
  if (s) s.remove();
  document.body.style.overflow = "";
}

let draft = null; // peça sendo criada/editada

function openItemEditor(item) {
  draft = item ? { ...item } : { id: null, source: state.closet.source, category: state.closet.cat !== "all" ? state.closet.cat : "cima", name: "", color: "", link: "", price: "", notes: "", photo: null, thumb: null };
  renderItemEditor();
}
function renderItemEditor() {
  const d = draft;
  const html = `
    <h3>${d.id ? "Editar peça" : "Nova peça"}</h3>
    <div class="stack">
      <div class="segmented" role="group" aria-label="Onde guardar">
        <button data-action="draft-source" data-v="tenho" aria-pressed="${d.source === "tenho"}">Já tenho</button>
        <button data-action="draft-source" data-v="desejo" aria-pressed="${d.source === "desejo"}">Quero ter</button>
      </div>
      ${photoDrop("ed-photo", d.photo, "Toque para tirar foto ou escolher", "De preferência a peça esticada, fundo liso")}
      ${d.photo && state.aiKind ? `<button class="btn small" data-action="identify" id="identify-btn">${ICON.spark.replace("<svg", '<svg width="16" height="16"')} Preencher com IA</button>` : ""}
      <div class="field"><label for="ed-name">Nome</label><input type="text" id="ed-name" value="${esc(d.name)}" placeholder="Ex.: Jaqueta jeans oversized"></div>
      <div class="field"><span class="label">Categoria</span><div class="chips wrap">
        ${CATS.map((c) => `<button class="chip" data-action="draft-cat" data-v="${c.id}" aria-pressed="${d.category === c.id}">${c.short}</button>`).join("")}
      </div></div>
      <div class="field"><label for="ed-color">Cor</label><input type="text" id="ed-color" value="${esc(d.color)}" placeholder="Ex.: azul claro"></div>
      ${d.source === "desejo" ? `
        <div class="field"><label for="ed-link">Link da loja (opcional)</label><input type="url" id="ed-link" value="${esc(d.link)}" placeholder="https://"></div>
        <div class="field"><label for="ed-price">Preço (opcional)</label><input type="text" id="ed-price" value="${esc(d.price)}" placeholder="R$ 189,90"></div>` : ""}
      <div class="field"><label for="ed-notes">Observações (opcional)</label><input type="text" id="ed-notes" value="${esc(d.notes)}" placeholder="Ex.: tecido leve, cintura alta"></div>
      <div id="ed-error"></div>
      <button class="btn primary block" data-action="save-item">${d.id ? "Salvar alterações" : "Guardar peça"}</button>
      <button class="btn ghost block" data-action="close-sheet">Cancelar</button>
    </div>`;
  const existing = $("#sheet .sheet");
  if (existing) existing.innerHTML = `<div class="grabber"></div>${html}`;
  else openSheet(html);
}
function syncDraftFields() {
  if (!draft) return;
  for (const [k, id] of [["name", "ed-name"], ["color", "ed-color"], ["link", "ed-link"], ["price", "ed-price"], ["notes", "ed-notes"]]) {
    const el = $("#" + id);
    if (el) draft[k] = el.value.trim();
  }
}

function openItemDetail(id) {
  const i = itemById(id);
  if (!i) return;
  openSheet(`
    <div class="stack">
      <img src="${i.photo}" alt="" style="border-radius:var(--radius);max-height:50vh;object-fit:contain;background:var(--surface-2);width:100%">
      <div>
        <span class="tag ${i.source === "desejo" ? "want" : ""}">${SOURCE_LABEL[i.source]}</span>
        <h3 style="margin:8px 0 2px">${esc(i.name || "Sem nome")}</h3>
        <div class="small">${esc(CAT[i.category]?.label)}${i.color ? " · " + esc(i.color) : ""}${i.price ? " · " + esc(i.price) : ""}</div>
        ${i.notes ? `<p style="margin:8px 0 0">${esc(i.notes)}</p>` : ""}
        ${i.link ? `<p style="margin:8px 0 0"><a href="${esc(i.link)}" target="_blank" rel="noopener">Ver na loja</a></p>` : ""}
      </div>
      <button class="btn primary block" data-action="look-with" data-id="${i.id}">Montar look com esta peça</button>
      ${i.source === "desejo" ? `<button class="btn want block" data-action="bought" data-id="${i.id}">Comprei! Mover para “Já tenho”</button>` : ""}
      <div class="row">
        <button class="btn" data-action="edit-item" data-id="${i.id}">Editar</button>
        <span id="del-area"><button class="btn danger" data-action="delete-item-ask" data-id="${i.id}">Excluir</button></span>
      </div>
    </div>`);
}

function openPicker() {
  const sel = new Set(state.create.pinned);
  state.pickerSel = sel;
  const draw = () => {
    const groups = ["tenho", "desejo"].map((src) => {
      const list = state.items.filter((i) => i.source === src);
      if (!list.length) return "";
      return `<div class="section-head"><h3>${src === "tenho" ? "Já tenho" : "Quero ter"}</h3></div>
        <div class="grid">${list.map((i) => itemCard(i, { selectable: true, selected: sel.has(i.id) })).join("")}</div>`;
    }).join("");
    return `<h3>Peças obrigatórias</h3><p class="small" style="margin-top:-6px">Toque para marcar. ${sel.size} selecionada(s).</p>${groups}
      <div style="position:sticky;bottom:0;padding-top:12px;background:var(--bg)"><button class="btn primary block" data-action="confirm-pick">Usar estas peças</button></div>`;
  };
  state.pickerDraw = draw;
  openSheet(draw());
}

// ---------- geração de looks ----------
function poolForCreate() {
  const c = state.create;
  const pinned = new Set(c.pinned);
  return state.items.filter((i) => pinned.has(i.id) || ((c.sources === "ambos" || c.sources === i.source) && c.sections.includes(i.category)));
}

function shuffleLooks() {
  const c = state.create;
  const pool = poolForCreate();
  const pinned = c.pinned.map(itemById).filter(Boolean);
  const by = (cat) => pool.filter((i) => i.category === cat);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const looks = [];
  const seen = new Set();
  for (let tries = 0; looks.length < c.count && tries < 60; tries++) {
    const chosen = new Map(pinned.map((p) => [p.category, p]));
    const has = (cat) => chosen.has(cat);
    const wantsDress = has("inteira") || (!has("cima") && !has("baixo") && by("inteira").length && (Math.random() < 0.35 || !by("cima").length || !by("baixo").length));
    if (wantsDress) { if (!has("inteira") && by("inteira").length) chosen.set("inteira", pick(by("inteira"))); }
    else {
      if (!has("cima") && by("cima").length) chosen.set("cima", pick(by("cima")));
      if (!has("baixo") && by("baixo").length) chosen.set("baixo", pick(by("baixo")));
    }
    if (!has("calcado") && by("calcado").length) chosen.set("calcado", pick(by("calcado")));
    for (const opt of ["casaco", "bolsa", "acessorio"]) if (!has(opt) && by(opt).length && Math.random() < 0.5) chosen.set(opt, pick(by(opt)));
    const ids = [...new Set([...pinned.map((p) => p.id), ...[...chosen.values()].map((i) => i.id)])];
    const key = ids.slice().sort().join(",");
    if (!ids.length || seen.has(key)) continue;
    seen.add(key);
    looks.push({ title: `Combinação ${looks.length + 1}`, itemIds: ids, why: "Sorteio aleatório respeitando as seções (sem análise de estilo). Use a IA para sugestões pensadas na ocasião.", tips: [], buy: [] });
  }
  state.results = { mode: "shuffle", looks };
  state.error = looks.length ? null : "Não deu para montar combinações com esses filtros. Cadastre mais peças ou libere mais seções.";
  if (!looks.length) state.results = null;
  render();
  autoTryOn(looks);
  $("#results")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function generateLooks() {
  const c = state.create;
  const pool = shuffle(poolForCreate());
  const pinnedSet = new Set(c.pinned);
  // peças obrigatórias primeiro; limite para caber nas imagens
  pool.sort((a, b) => (pinnedSet.has(b.id) ? 1 : 0) - (pinnedSet.has(a.id) ? 1 : 0));
  const MAX_ITEMS = 48;
  const items = pool.slice(0, MAX_ITEMS);
  if (!items.length) { state.error = "Nenhuma peça bate com esses filtros."; render(); return; }

  state.loading = true; state.error = null; state.results = null; render();
  $("#results")?.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const prov = await AI.provider();
    const maxImages = prov?.kind === "api" ? 20 : prov?.maxImages || 0;
    const numbered = items.map((it, idx) => ({ num: idx + 1, item: it }));
    const sheetsData = [];
    for (let i = 0; i < numbered.length; i += 24) sheetsData.push(numbered.slice(i, i + 24));

    const images = [];
    const desc = [];
    let budget = maxImages;
    const sheetsToSend = sheetsData.slice(0, Math.max(0, budget));
    for (const s of sheetsToSend) {
      images.push(await Img.contactSheet(s.map((n) => ({ num: n.num, photo: n.item.thumb || n.item.photo }))));
      desc.push(`Imagem ${images.length}: folha com as peças #${s[0].num} a #${s[s.length - 1].num} (o número fica no canto de cada foto).`);
    }
    budget -= sheetsToSend.length;
    let bodySent = false, refSent = false;
    if (c.useBody && state.profile.photo && budget > 0) { images.push(state.profile.photo); desc.push(`Imagem ${images.length}: foto do corpo da pessoa.`); bodySent = true; budget--; }
    if (c.refImage && budget > 0) { images.push(c.refImage); desc.push(`Imagem ${images.length}: imagem de referência de estilo.`); refSent = true; budget--; }

    const catalog = numbered.map(({ num, item }) =>
      `#${num} | ${CAT[item.category]?.label} | ${SOURCE_LABEL[item.source]} | ${item.name || "sem nome"}${item.color ? " | cor: " + item.color : ""}${item.notes ? " | obs: " + item.notes : ""}${pinnedSet.has(item.id) ? " | OBRIGATÓRIA" : ""}`).join("\n");

    const prompt = `Você é uma personal stylist brasileira, atenta a tendências, que monta looks com as peças reais do guarda-roupa da pessoa.

TAREFA: monte ${c.count} look(s) diferentes para a ocasião abaixo, usando SOMENTE peças do catálogo (pelo número).

OCASIÃO: ${c.occasion}${c.details ? "\nDETALHES: " + c.details : ""}
${c.refText ? "REFERÊNCIA DE ESTILO (texto): " + c.refText : ""}
${state.profile.notes ? "SOBRE A PESSOA: " + state.profile.notes : ""}
ORIGEM DAS PEÇAS: ${{ ambos: "pode misturar 'Tenho' (já está no guarda-roupa) com 'Quero ter' (lista de desejos para comprar); priorize o que a pessoa já tem e use 'Quero ter' quando elevar o look", tenho: "só peças que a pessoa já tem", desejo: "só peças da lista de desejos" }[c.sources]}

IMAGENS ANEXADAS:
${desc.length ? desc.join("\n") : "nenhuma (use só o catálogo em texto)"}

CATÁLOGO (número | seção | origem | nome | detalhes):
${catalog}

REGRAS:
- Cada look precisa ser completo e vestível: parte de cima + parte de baixo, OU uma peça única (vestido/macacão). Inclua calçado se houver no catálogo. Casaco, bolsa e acessórios quando fizerem sentido.
- Peças marcadas OBRIGATÓRIA devem estar em TODOS os looks.
- Os looks devem ser diferentes entre si.
- Pense em clima, conforto e adequação à ocasião (ex.: show em pé por horas pede calçado confortável).
${bodySent ? "- Use a foto do corpo só para falar de proporções, caimento e cortes que valorizam. Seja gentil e positiva; nunca comente peso nem fale em 'defeitos'." : ""}
${c.refText || refSent ? "- Explique como cada look conversa com a referência (cores, silhuetas, peças-chave, atitude)." : ""}
- Se faltar uma peça importante para o look ficar perfeito, sugira em "comprar" (descrição curta de peça genérica, sem marcas).
- Escreva em português do Brasil, frases curtas e diretas.

FORMATO: responda só com JSON neste formato:
{"leitura_do_corpo": "1-2 frases ou null", "leitura_da_referencia": "1-2 frases ou null", "looks": [{"titulo": "nome curto do look", "pecas": [1, 5, 9], "por_que": "2-3 frases", "dicas": ["dica de styling: como usar, dobrar, cabelo, maquiagem"], "comprar": [{"peca": "descrição", "por_que": "motivo"}]}]}`;

    const ctl = new AbortController();
    state.abort = ctl;
    const out = await AI.askJson(prompt, images, { tier: "default", signal: ctl.signal });
    const byNum = new Map(numbered.map((n) => [n.num, n.item.id]));
    const looks = (out?.looks || []).map((l, idx) => {
      let ids = (l.pecas || []).map((n) => byNum.get(Number(String(n).replace("#", "")))).filter(Boolean);
      for (const p of c.pinned) if (!ids.includes(p) && itemById(p)) ids.unshift(p);
      ids = [...new Set(ids)];
      return { title: l.titulo || `Look ${idx + 1}`, itemIds: ids, why: l.por_que || "", tips: Array.isArray(l.dicas) ? l.dicas : [], buy: Array.isArray(l.comprar) ? l.comprar.filter((b) => b && b.peca) : [] };
    }).filter((l) => l.itemIds.length);
    if (!looks.length) throw new Error("A IA não conseguiu montar looks com essas peças. Tente liberar mais seções.");
    state.results = { mode: "ai", looks, bodyRead: out.leitura_do_corpo || null, refRead: out.leitura_da_referencia || null };
    autoTryOn(looks);
  } catch (e) {
    state.error = e.message === "NO_AI" ? "A IA não está conectada. Veja em Perfil." : e.message || "Algo deu errado. Tente de novo.";
  } finally {
    state.loading = false;
    render();
  }
}

function autoTryOn(looks) {
  if (!state.settings.autoTryOn || !state.settings.geminiKey || !state.profile?.photo) return;
  // duas de cada vez para não estourar limite
  let i = 0;
  const next = () => { if (i < looks.length) { const l = looks[i++]; return runTryOn(l).then(next); } };
  next(); next();
}

async function runTryOn(look) {
  const items = look.itemIds.map(itemById).filter(Boolean);
  if (!items.length || !state.profile.photo) return;
  look.tryOnLoading = true; look.tryOnError = null; render();
  try {
    look.tryOn = await TryOn.generate({
      apiKey: state.settings.geminiKey, model: state.settings.geminiModel,
      body: state.profile.photo, items, occasion: state.create.occasion + (state.create.details ? ", " + state.create.details : ""),
    });
  } catch (e) {
    look.tryOnError = e.message || "Não foi possível gerar a foto.";
  } finally {
    look.tryOnLoading = false;
    await syncSavedTryOn(look);
    render();
  }
}

// se o look do resultado já foi salvo, copia a foto para o salvo (e vice-versa)
async function syncSavedTryOn(look) {
  const savedId = look.savedId || (state.looks.includes(look) ? look.id : null);
  const saved = state.looks.find((x) => x.id === savedId);
  if (saved && saved !== look) saved.tryOn = look.tryOn;
  if (saved) await persist("looks");
}

function getLook(el) {
  return el.dataset.scope === "saved" ? state.looks.find((l) => l.id === el.dataset.id) : state.results?.looks[Number(el.dataset.index)];
}

function openMontage(look) {
  const items = look.itemIds.map(itemById).filter(Boolean);
  const sheet = openSheet(`<h3>Montar na minha foto</h3><div class="stack" id="mt-root"><div class="loading"><div class="spinner"></div>Recortando as peças…</div></div>`);
  TryOn.openMontage(sheet.querySelector("#mt-root"), {
    body: state.profile.photo, items,
    onCancel: closeSheet,
    onSave: async (img) => { look.tryOn = img; look.tryOnError = null; await syncSavedTryOn(look); closeSheet(); render(); toast("Foto do look salva"); },
  });
}

async function identifyDraft() {
  const btn = $("#identify-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Analisando a foto…"; }
  syncDraftFields();
  try {
    const out = await AI.askJson(
      `Identifique a peça de roupa/acessório da foto para um app de guarda-roupa. Responda só com JSON: {"nome": "nome curto em português, ex.: Blusa cropped de tricô", "categoria": "uma de: ${CATS.map((c) => c.id).join(", ")}", "cor": "cor principal em português"}. Legenda das categorias: ${CATS.map((c) => `${c.id}=${c.label}`).join("; ")}.`,
      [draft.photo], { tier: "quick" });
    if (out?.nome && !draft.name) draft.name = out.nome;
    if (out?.categoria && CAT[out.categoria]) draft.category = out.categoria;
    if (out?.cor && !draft.color) draft.color = out.cor;
    renderItemEditor();
    toast("Peça identificada. Confira os campos.");
  } catch (e) {
    const area = $("#ed-error");
    if (area) area.innerHTML = `<div class="notice warn">${esc(e.message === "NO_AI" ? "A IA não está conectada." : e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = "Preencher com IA"; }
  }
}

// ---------- eventos ----------
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  if (el.tagName === "A") e.preventDefault();

  switch (a) {
    case "nav": state.view = el.dataset.view; closeSheet(); render(); window.scrollTo(0, 0); break;
    case "closet-source": state.closet.source = el.dataset.source; render(); break;
    case "closet-cat": state.closet.cat = el.dataset.cat; render(); break;
    case "add-item": openItemEditor(null); break;
    case "open-item": openItemDetail(id); break;
    case "edit-item": openItemEditor(itemById(id)); break;
    case "close-sheet": closeSheet(); draft = null; break;
    case "draft-source": syncDraftFields(); draft.source = el.dataset.v; renderItemEditor(); break;
    case "draft-cat": syncDraftFields(); draft.category = el.dataset.v; renderItemEditor(); break;
    case "identify": identifyDraft(); break;
    case "save-item": {
      syncDraftFields();
      if (!draft.photo) { $("#ed-error").innerHTML = '<div class="notice warn">Adicione uma foto da peça.</div>'; return; }
      if (draft.id) state.items = state.items.map((i) => (i.id === draft.id ? { ...draft } : i));
      else state.items.unshift({ ...draft, id: uid(), createdAt: Date.now() });
      state.closet.source = draft.source;
      await persist("items");
      closeSheet(); draft = null; render(); toast("Peça guardada");
      break;
    }
    case "delete-item-ask":
      $("#del-area").innerHTML = `<span class="row"><span class="small">Excluir mesmo?</span><button class="btn danger small" data-action="delete-item" data-id="${id}">Sim, excluir</button></span>`;
      break;
    case "delete-item":
      state.items = state.items.filter((i) => i.id !== id);
      state.create.pinned = state.create.pinned.filter((p) => p !== id);
      await persist("items"); closeSheet(); render(); toast("Peça excluída");
      break;
    case "bought": {
      const it = itemById(id); if (it) it.source = "tenho";
      await persist("items"); closeSheet(); render(); toast("Movida para “Já tenho”");
      break;
    }
    case "look-with":
      state.create.pinned = [id]; state.results = null; state.error = null; state.view = "create"; closeSheet(); render(); window.scrollTo(0, 0);
      break;
    case "occasion": state.create.occasion = el.dataset.v; render(); break;
    case "sources": state.create.sources = el.dataset.v; render(); break;
    case "toggle-section": {
      const s = state.create.sections; const c = el.dataset.cat;
      state.create.sections = s.includes(c) ? s.filter((x) => x !== c) : [...s, c];
      render(); break;
    }
    case "clear-ref": state.create.refImage = null; render(); break;
    case "pick-pinned": openPicker(); break;
    case "clear-pinned": state.create.pinned = []; render(); break;
    case "toggle-pick": {
      const s = state.pickerSel; s.has(id) ? s.delete(id) : s.add(id);
      const sheet = $("#sheet .sheet"); const top = sheet.scrollTop;
      sheet.innerHTML = `<div class="grabber"></div>${state.pickerDraw()}`; sheet.scrollTop = top;
      break;
    }
    case "confirm-pick": state.create.pinned = [...state.pickerSel]; closeSheet(); render(); break;
    case "generate": generateLooks(); break;
    case "shuffle": shuffleLooks(); break;
    case "save-look": {
      const l = state.results?.looks[Number(el.dataset.index)];
      if (!l || l.savedId) return;
      const saved = { ...l, tryOnLoading: false, tryOnError: null, id: uid(), occasion: state.create.occasion + (state.create.refText ? " · " + state.create.refText : ""), createdAt: Date.now() };
      l.savedId = saved.id;
      state.looks.unshift(saved);
      await persist("looks"); render(); toast("Look salvo");
      break;
    }
    case "tryon-ai": { const l = getLook(el); if (l) runTryOn(l); break; }
    case "tryon-manual": { const l = getLook(el); if (l) openMontage(l); break; }
    case "save-gemini":
      state.settings.geminiKey = $("#pf-gkey").value.trim();
      state.settings.geminiModel = $("#pf-gmodel").value;
      state.settings.autoTryOn = $("#pf-auto").checked;
      await persist("settings"); await refreshAi(); toast(state.settings.geminiKey ? "Provador conectado" : "Provador salvo");
      break;
    case "delete-look": state.looks = state.looks.filter((l) => l.id !== id); await persist("looks"); render(); toast("Look excluído"); break;
    case "finish-onboarding": {
      const d = state.onboardDraft;
      d.name = $("#ob-name").value.trim(); d.notes = $("#ob-notes").value.trim();
      state.profile = { name: d.name, photo: d.photo, notes: d.notes, createdAt: Date.now() };
      state.create.useBody = !!d.photo;
      await persist("profile"); render();
      break;
    }
    case "save-profile":
      state.profile.name = $("#pf-name").value.trim(); state.profile.notes = $("#pf-notes").value.trim();
      await persist("profile"); render(); toast("Perfil salvo");
      break;
    case "save-key":
      state.settings.apiKey = $("#pf-key").value.trim();
      await persist("settings"); await refreshAi(); toast(state.aiKind ? "IA conectada" : "Chave removida");
      break;
    case "wipe-ask":
      $("#wipe-area").innerHTML = `<div class="stack"><span class="small">Isso apaga fotos, peças e looks deste aparelho. Não dá para desfazer.</span><div class="row"><button class="btn danger" data-action="wipe">Apagar tudo</button><button class="btn ghost" data-action="nav" data-view="profile">Cancelar</button></div></div>`;
      break;
    case "wipe":
      await Store.clear();
      Object.assign(state, { profile: null, items: [], looks: [], results: null, onboardDraft: null, view: "closet" });
      state.create.pinned = [];
      render();
      break;
  }
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.type === "file" && t.files && t.files[0]) {
    const file = t.files[0];
    try {
      if (t.id === "ob-photo") {
        state.onboardDraft.name = $("#ob-name").value; state.onboardDraft.notes = $("#ob-notes").value;
        state.onboardDraft.photo = await Img.fromFile(file, 1280); render();
      } else if (t.id === "pf-photo") {
        state.profile.photo = await Img.fromFile(file, 1280); state.create.useBody = true; await persist("profile"); render(); toast("Foto atualizada");
      } else if (t.id === "ed-photo") {
        syncDraftFields();
        draft.photo = await Img.fromFile(file, 900);
        draft.thumb = await Img.fromFile(file, 360, 0.8);
        renderItemEditor();
      } else if (t.id === "cr-refimg") {
        state.create.refImage = await Img.fromFile(file, 1024); render();
      }
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  const m = t.dataset.model;
  if (m === "useBody") state.create.useBody = t.checked;
  if (m === "count") state.create.count = Number(t.value);
});

document.addEventListener("input", (e) => {
  const m = e.target.dataset.model;
  if (m === "details" || m === "refText") state.create[m] = e.target.value;
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

// ---------- início ----------
(async function init() {
  render();
  const [profile, items, looks, settings] = await Promise.all([
    Store.get("profile", null), Store.get("items", []), Store.get("looks", []), Store.get("settings", {}),
  ]);
  Object.assign(state, { profile, items, looks, ready: true });
  Object.assign(state.settings, settings || {});
  // Link de configuração: ...#chave=SUA_CHAVE salva a chave do Gemini no aparelho e limpa o endereço.
  const m = location.hash.match(/^#chave=([A-Za-z0-9._\-]+)$/);
  if (m) {
    state.settings.geminiKey = m[1];
    await Store.set("settings", state.settings);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; }
    setTimeout(() => toast("Chave do Gemini salva neste aparelho"), 400);
  }
  if (profile && !profile.photo) state.create.useBody = false;
  render();
  refreshAi();
})();
