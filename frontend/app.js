const API_BASE_URL = "https://nosql-suply.onrender.com";

const fallback = {
  stats: {
    produtos_rastreados: 0,
    produtos_autenticados: 0,
    alertas_analisados: 0,
    tentativas_fraude_bloqueadas: 0,
  },
  produtos: [],
  alertas: [],
  locais: [],
  lotes: [],
  notas: [],
};

let state = {
  tab: "produtos",
  produtos: [],
  alertas: [],
  locais: [],
  lotes: [],
  notas: [],
  selected: null,
  selectedAlert: null,
  selectedRecord: null,
  authenticated: false,
  apiOnline: true,
};

let eventsReady = false;
let revealReady = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function statusClass(value = "") {
  const normalized = value.toLowerCase();
  if (normalized.includes("alta") || normalized.includes("fraude") || normalized.includes("crit")) return "danger";
  if (normalized.includes("media") || normalized.includes("médio") || normalized.includes("analise") || normalized.includes("trans")) return "warning";
  if (normalized.includes("entreg") || normalized.includes("baixo") || normalized.includes("regular")) return "ok";
  return "neutral";
}

function formatDate(value) {
  if (!value) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function getJson(path, fallbackValue) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`);
    if (!response.ok) throw new Error(`Erro ${response.status}`);
    return await response.json();
  } catch (error) {
    state.apiOnline = false;
    return fallbackValue;
  }
}

function renderStats(stats) {
  Object.entries(stats).forEach(([key, value]) => {
    const target = document.querySelector(`[data-stat="${key}"]`);
    if (target) target.textContent = Number(value || 0).toLocaleString("pt-BR");
  });
}

function productCard(produto) {
  const alert = produto.alertas_ativos?.[0];
  const status = alert?.gravidade || produto.status_atual;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `record-card ${state.selected?.codigo === produto.codigo ? "is-selected" : ""}`;
  button.innerHTML = `
    <span class="delivery-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h8.3A2.5 2.5 0 0 1 16 7.5V9h1.9c.7 0 1.35.33 1.76.9l1.84 2.56c.32.45.5.99.5 1.55V17a2 2 0 0 1-2 2h-.35a2.85 2.85 0 0 1-5.3 0H9.65a2.85 2.85 0 0 1-5.3 0H4a1 1 0 0 1-1-1V7.2Zm13 3.8v4h4v-.76a.7.7 0 0 0-.13-.41L17.83 11H16ZM7 20.2A1.2 1.2 0 1 0 7 17.8a1.2 1.2 0 0 0 0 2.4Zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" />
      </svg>
    </span>
    <div>
      <h3>${produto.nome}</h3>
      <p>${produto.codigo} · ${produto.lote}</p>
      <small>${produto.localizacao_atual?.nome || "Local não informado"}</small>
    </div>
    <div>
      <span class="status-pill ${statusClass(status)}">${produto.status_atual.replaceAll("_", " ")}</span>
      <br><br>
      <span class="status-pill ${alert ? statusClass(alert.gravidade) : "neutral"}">${alert ? "alerta ativo" : "sem alertas"}</span>
    </div>
  `;
  button.addEventListener("click", () => {
    state.selected = produto;
    state.selectedAlert = null;
    state.selectedRecord = null;
    renderList();
    renderDetails(produto);
  });
  return button;
}

function findProductByAlert(alerta) {
  return state.produtos.find((produto) => {
    return produto.codigo === alerta.produto || produto.lote === alerta.lote;
  });
}

function alertCard(alerta) {
  const produto = findProductByAlert(alerta);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `record-card alert-record ${state.selectedAlert === alerta ? "is-selected" : ""}`;
  button.innerHTML = `
    <span class="delivery-icon delivery-icon-alert" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M12 2.4 22 20H2L12 2.4Zm0 5.6c-.55 0-1 .45-1 1v5.2c0 .55.45 1 1 1s1-.45 1-1V9c0-.55-.45-1-1-1Zm0 10.6a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
      </svg>
    </span>
    <div>
      <h3>${alerta.tipo.replaceAll("_", " ")}</h3>
      <p>${alerta.produto} · ${alerta.lote}</p>
      <small>${alerta.descricao}</small>
    </div>
    <div>
      <span class="status-pill ${statusClass(alerta.gravidade)}">${alerta.gravidade}</span>
      <br><br>
      <span class="status-pill neutral">${produto ? "ver produto" : "sem produto"}</span>
    </div>
  `;
  button.addEventListener("click", () => {
    state.selected = produto || null;
    state.selectedAlert = alerta;
    state.selectedRecord = null;
    renderList();
    renderDetails(produto || null, alerta);
  });
  return button;
}

function findProductsByLocal(local) {
  return state.produtos.filter((produto) => {
    const atual = produto.localizacao_atual || {};
    return atual.nome === local.nome || (atual.cidade === local.cidade && atual.estado === local.estado);
  });
}

function findLoteByNota(nota) {
  return state.lotes.find((lote) => lote.nota_fiscal === nota.numero);
}

function findProductByLote(lote) {
  if (!lote) return null;
  return state.produtos.find((produto) => produto.lote === lote.codigo);
}

function localCard(local) {
  const produtosNoLocal = findProductsByLocal(local);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `record-card local-record ${state.selectedRecord?.item === local ? "is-selected" : ""}`;
  button.innerHTML = `
    <span class="delivery-icon delivery-icon-location" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7Zm0 9.8a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z" />
      </svg>
    </span>
    <div>
      <h3>${local.nome}</h3>
      <p>${local.tipo.replaceAll("_", " ")} · ${local.cidade}/${local.estado}</p>
      <small>${produtosNoLocal.length} produto(s) relacionado(s)</small>
    </div>
    <span class="status-pill neutral">ver local</span>
  `;
  button.addEventListener("click", () => {
    state.selected = null;
    state.selectedAlert = null;
    state.selectedRecord = { type: "local", item: local };
    renderList();
    renderRecordDetails("local", local);
  });
  return button;
}

function notaCard(nota) {
  const lote = findLoteByNota(nota);
  const produto = findProductByLote(lote);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `record-card nota-record ${state.selectedRecord?.item === nota ? "is-selected" : ""}`;
  button.innerHTML = `
    <span class="delivery-icon delivery-icon-note" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M6 2.8h8.6L19 7.2v14H6a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2Zm8 1.8V8h3.4L14 4.6ZM7 11h10v1.7H7V11Zm0 4h10v1.7H7V15Zm0-8h4v1.7H7V7Z" />
      </svg>
    </span>
    <div>
      <h3>${nota.numero}</h3>
      <p>${nota.emissor} · ${nota.destinatario}</p>
      <small>${produto ? produto.nome : lote ? lote.produto_base : "sem produto vinculado"}</small>
    </div>
    <span class="status-pill ${statusClass(nota.status_validacao)}">${nota.status_validacao}</span>
  `;
  button.addEventListener("click", () => {
    state.selected = produto || null;
    state.selectedAlert = null;
    state.selectedRecord = { type: "nota", item: nota };
    renderList();
    renderRecordDetails("nota", nota);
  });
  return button;
}

function simpleCard(title, subtitle, badge = "registro") {
  const article = document.createElement("article");
  article.className = "record-card";
  article.innerHTML = `
    <span class="delivery-icon delivery-icon-muted" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5V9h1.8c.75 0 1.46.35 1.9.96l1.82 2.52c.31.43.48.96.48 1.49V18h-2.1a2.9 2.9 0 0 1-5.8 0H9.9a2.9 2.9 0 0 1-5.8 0H3V7.5c0-.55.45-1 1-1Zm12 4.5v3h4l-2.16-3H16Z" />
      </svg>
    </span>
    <div>
      <h3>${title}</h3>
      <p>${subtitle}</p>
    </div>
    <span class="status-pill neutral">${badge}</span>
  `;
  return article;
}

function renderList() {
  const list = $("#recordList");
  const recordCount = $("#recordCount");
  const recordSummaryTitle = $("#recordSummaryTitle");
  list.innerHTML = "";
  if (recordCount) recordCount.textContent = "0";
  if (recordSummaryTitle) {
    recordSummaryTitle.textContent =
      state.tab === "produtos" ? "Rastreios disponíveis" : `Registros de ${state.tab}`;
  }

  if (!state.apiOnline) {
    list.appendChild(simpleCard("API não conectada", "Inicie o FastAPI ou configure API_BASE_URL para carregar dados do MongoDB.", "offline"));
    renderDetails(null);
    return;
  }

  if (!state.authenticated && ["alertas", "notas"].includes(state.tab)) {
    list.appendChild(simpleCard("Acesso restrito", "Entre como operador autorizado para consultar dados sensíveis.", "bloqueado"));
    renderDetails(null);
    return;
  }

  const query = $("#productSearch").value.trim().toLowerCase();
  let items = [];

  if (state.tab === "produtos") {
    items = state.produtos.filter((produto) => {
      return [produto.codigo, produto.nome, produto.lote].join(" ").toLowerCase().includes(query);
    });
    items.forEach((produto) => list.appendChild(productCard(produto)));
  }

  if (state.tab === "alertas") {
    items = state.alertas.filter((alerta) => [alerta.tipo, alerta.produto, alerta.lote].join(" ").toLowerCase().includes(query));
    items.forEach((alerta) => list.appendChild(alertCard(alerta)));
  }

  if (state.tab === "locais") {
    items = state.locais.filter((local) => [local.nome, local.cidade, local.estado].join(" ").toLowerCase().includes(query));
    items.forEach((local) => list.appendChild(localCard(local)));
  }

  if (state.tab === "notas") {
    items = state.notas.filter((nota) => [nota.numero, nota.emissor, nota.destinatario].join(" ").toLowerCase().includes(query));
    items.forEach((nota) => list.appendChild(notaCard(nota)));
  }

  if (!items.length) {
    list.appendChild(simpleCard("Nenhum registro encontrado", "Tente outro código, nome ou lote.", "vazio"));
  }

  if (recordCount) recordCount.textContent = String(items.length);
}

function renderRecordDetails(type, item) {
  const panel = $("#detailPanel");
  if (!state.authenticated && type === "nota") {
    renderDetails(null);
    return;
  }

  if (type === "local") {
    const produtosNoLocal = findProductsByLocal(item);
    const produtos = produtosNoLocal
      .slice(0, 5)
      .map((produto) => `<li>${produto.nome} <span>${produto.codigo}</span></li>`)
      .join("");

    panel.innerHTML = `
      <span class="status-pill neutral">${item.tipo.replaceAll("_", " ")}</span>
      <h3>${item.nome}</h3>
      <p>${item.cidade}/${item.estado} · ${item.pais}</p>
      <p><strong>Produtos vinculados:</strong> ${produtosNoLocal.length}</p>
      <p><strong>Latitude:</strong> ${item.coordenadas?.lat ?? "não informada"}</p>
      <p><strong>Longitude:</strong> ${item.coordenadas?.lng ?? "não informada"}</p>
      <div class="alert-detail-card">
        <h4>Produtos neste local</h4>
        ${
          produtos
            ? `<ul class="linked-list">${produtos}</ul>`
            : "<p>Nenhum produto está registrado neste local no momento.</p>"
        }
      </div>
    `;
    return;
  }

  if (type === "nota") {
    const lote = findLoteByNota(item);
    const produto = findProductByLote(lote);
    panel.innerHTML = `
      <span class="status-pill ${statusClass(item.status_validacao)}">${item.status_validacao}</span>
      <h3>${item.numero}</h3>
      <p>${item.emissor} → ${item.destinatario}</p>
      <p><strong>Emissão:</strong> ${formatDate(item.data_emissao)}</p>
      <p><strong>Quantidade declarada:</strong> ${Number(item.quantidade_declarada || 0).toLocaleString("pt-BR")}</p>
      <p><strong>Valor total:</strong> ${Number(item.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      <div class="alert-detail-card">
        <h4>Vínculo com a cadeia</h4>
        <dl>
          <div><dt>Lote</dt><dd>${lote?.codigo || "não encontrado"}</dd></div>
          <div><dt>Produto</dt><dd>${produto?.nome || lote?.produto_base || "não encontrado"}</dd></div>
          <div><dt>Fabricante</dt><dd>${produto?.fabricante || lote?.fabricante || "não informado"}</dd></div>
          <div><dt>Origem</dt><dd>${lote?.origem || "não informada"}</dd></div>
          <div><dt>Destino</dt><dd>${lote?.destino_previsto || item.destinatario}</dd></div>
          <div><dt>Risco</dt><dd>${lote?.indicadores_risco?.nivel_risco || "não informado"}</dd></div>
        </dl>
      </div>
    `;
  }
}

function renderDetails(produto = state.selected, selectedAlert = state.selectedAlert) {
  const panel = $("#detailPanel");
  if (!state.authenticated) {
    panel.innerHTML = `
      <span class="status-pill warning">acesso limitado</span>
      <h3>Autenticação necessária</h3>
      <p>A busca pública pode validar um produto. Dados operacionais, alertas e auditoria exigem login autorizado e vêm da API FastAPI conectada ao MongoDB.</p>
      <div class="timeline">
        <div class="timeline-item"><strong>Visitante</strong><span>Consulta status básico do produto</span></div>
        <div class="timeline-item"><strong>Operador</strong><span>Registra movimentações e acompanha lotes</span></div>
        <div class="timeline-item"><strong>Auditor</strong><span>Analisa alertas, fraudes e inconsistências</span></div>
      </div>
    `;
    return;
  }

  if (!produto) {
    if (selectedAlert) {
      panel.innerHTML = `
        <span class="status-pill ${statusClass(selectedAlert.gravidade)}">${selectedAlert.gravidade}</span>
        <h3>${selectedAlert.tipo.replaceAll("_", " ")}</h3>
        <p>${selectedAlert.descricao}</p>
        <p><strong>Produto:</strong> ${selectedAlert.produto}</p>
        <p><strong>Lote:</strong> ${selectedAlert.lote}</p>
        <p><strong>Movimentação:</strong> ${selectedAlert.movimentacao || "não informada"}</p>
        <p><strong>Auditoria:</strong> ${selectedAlert.responsavel_auditoria || "não informada"}</p>
        <p><strong>Emissão:</strong> ${formatDate(selectedAlert.data_emissao)}</p>
      `;
      return;
    }
    panel.innerHTML = "<h3>Selecione um produto</h3><p>Os detalhes de rastreamento e alertas aparecem aqui.</p>";
    return;
  }

  const timeline = produto.ultimas_movimentacoes
    .map(
      (item) => `
        <div class="timeline-item">
          <strong>${item.tipo.replaceAll("_", " ")}</strong>
          <span>${formatDate(item.data_hora)} · ${item.local}</span>
        </div>
      `,
    )
    .join("");

  const alert = selectedAlert || produto.alertas_ativos?.[0];
  panel.innerHTML = `
    <span class="status-pill ${statusClass(produto.status_atual)}">${produto.status_atual.replaceAll("_", " ")}</span>
    <h3>${produto.nome}</h3>
    <p>${produto.codigo} · ${produto.lote}</p>
    <p><strong>Fabricante:</strong> ${produto.fabricante}</p>
    <p><strong>Categoria:</strong> ${produto.categoria || "não informada"}</p>
    <p><strong>Status atual:</strong> ${produto.status_atual.replaceAll("_", " ")}</p>
    <p><strong>Local atual:</strong> ${produto.localizacao_atual?.nome || "Não informado"}</p>
    <div class="timeline">${timeline}</div>
    <div class="alert-detail-card">
      <span class="status-pill ${alert ? statusClass(alert.gravidade) : "neutral"}">${alert ? alert.gravidade : "sem alerta"}</span>
      <h4>${alert ? alert.tipo.replaceAll("_", " ") : "Sem alertas ativos"}</h4>
      <p>${alert ? alert.descricao || "Alerta associado ao produto selecionado." : "Nenhuma inconsistência vinculada a este produto no momento."}</p>
      ${
        alert
          ? `<dl>
              <div><dt>Lote</dt><dd>${alert.lote || produto.lote}</dd></div>
              <div><dt>Movimentação</dt><dd>${alert.movimentacao || produto.ultima_movimentacao}</dd></div>
              <div><dt>Status</dt><dd>${alert.status || "em análise"}</dd></div>
              <div><dt>Auditoria</dt><dd>${alert.responsavel_auditoria || "não informada"}</dd></div>
              <div><dt>Emissão</dt><dd>${formatDate(alert.data_emissao)}</dd></div>
            </dl>`
          : ""
      }
    </div>
  `;
}

function setupEvents() {
  if (eventsReady) return;
  eventsReady = true;

  $(".menu-toggle").addEventListener("click", (event) => {
    const open = event.currentTarget.getAttribute("aria-expanded") === "true";
    event.currentTarget.setAttribute("aria-expanded", String(!open));
    $("#navLinks").classList.toggle("is-open", !open);
  });

  window.addEventListener("scroll", () => {
    $(".site-header").dataset.elevated = String(window.scrollY > 10);
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.tab = tab.dataset.tab;
      renderList();
    });
  });

  $("#productSearch").addEventListener("input", renderList);

  $("#heroSearch").addEventListener("submit", (event) => {
    event.preventDefault();
    $("#productSearch").value = $("#heroCode").value;
    document.querySelector("#rastreamento").scrollIntoView({ behavior: "smooth" });
    renderList();
  });

  $("#simulateAlert").addEventListener("click", () => {
    init();
  });

  $("#authButton").addEventListener("click", (event) => {
    state.authenticated = !state.authenticated;
    event.currentTarget.classList.toggle("is-authenticated", state.authenticated);
    event.currentTarget.textContent = state.authenticated ? "Operador autenticado" : "Entrar como operador";
    document.querySelector(".access-strip strong").textContent = state.authenticated ? "sessão autorizada" : "acesso autorizado";
    document.querySelector(".access-strip p").textContent = state.authenticated
      ? "Token de sessão ativo: produtos, alertas e auditorias liberados para este perfil."
      : "Consultas, alertas e auditorias são liberados por usuário autenticado.";
    renderList();
    renderDetails();
  });

  document.addEventListener("pointermove", (event) => {
    document.querySelectorAll(".record-card").forEach((card) => {
      const rect = card.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        card.style.setProperty("--mx", `${x}%`);
        card.style.setProperty("--my", `${y}%`);
      }
    });
  });
}

function setupReveal() {
  if (revealReady) return;
  revealReady = true;

  document
    .querySelectorAll(".reveal-section, .metric-card, .step-card, .benefit-grid article, .security-grid span, .risk-card, .app-panel")
    .forEach((item, index) => {
      item.classList.add("reveal");
      item.style.transitionDelay = `${Math.min(index % 4, 3) * 90}ms`;
    });

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $$(".hero .reveal").forEach((item) => item.classList.add("is-visible"));

  if (prefersReduced) {
    $$(".reveal").forEach((item) => item.classList.add("is-visible"));
    return;
  }

  document.documentElement.classList.add("reveal-enabled");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
  );
  $$(".reveal").forEach((item) => observer.observe(item));
}

async function init() {
  setupEvents();
  setupReveal();
  state.apiOnline = true;
  const [stats, produtos, alertas, locais, lotes, notas] = await Promise.all([
    getJson("/api/stats", fallback.stats),
    getJson("/api/produtos", fallback.produtos),
    getJson("/api/alertas", fallback.alertas),
    getJson("/api/locais", fallback.locais),
    getJson("/api/lotes", fallback.lotes),
    getJson("/api/notas-fiscais", fallback.notas),
  ]);

  state.produtos = produtos;
  state.alertas = alertas;
  state.locais = locais;
  state.lotes = lotes;
  state.notas = notas;
  state.selected = produtos[0];
  renderStats(stats);
  const apiStatus = $("#apiStatus");
  if (apiStatus) {
    apiStatus.textContent = state.apiOnline
      ? `API conectada: ${API_BASE_URL}`
      : `API não conectada: confira CORS, API_BASE_URL ou MongoDB em ${API_BASE_URL}`;
    apiStatus.dataset.state = state.apiOnline ? "online" : "offline";
  }
  $("#alertCount").textContent = alertas.length;
  renderList();
  renderDetails();
}

init();
