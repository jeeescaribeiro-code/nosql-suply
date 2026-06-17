const API_BASE_URL = window.API_BASE_URL || "http://127.0.0.1:8000";

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
  notas: [],
};

let state = {
  tab: "produtos",
  produtos: [],
  alertas: [],
  locais: [],
  notas: [],
  selected: null,
  authenticated: false,
  apiOnline: true,
};

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
    state.apiOnline = true;
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
    renderList();
    renderDetails(produto);
  });
  return button;
}

function simpleCard(title, subtitle, badge = "registro") {
  const article = document.createElement("article");
  article.className = "record-card";
  article.innerHTML = `
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
  list.innerHTML = "";
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
    items.forEach((alerta) => list.appendChild(simpleCard(alerta.tipo, `${alerta.produto} · ${alerta.descricao}`, alerta.gravidade)));
  }

  if (state.tab === "locais") {
    items = state.locais.filter((local) => [local.nome, local.cidade, local.estado].join(" ").toLowerCase().includes(query));
    items.forEach((local) => list.appendChild(simpleCard(local.nome, `${local.tipo} · ${local.cidade}/${local.estado}`, "local")));
  }

  if (state.tab === "notas") {
    items = state.notas.filter((nota) => [nota.numero, nota.emissor, nota.destinatario].join(" ").toLowerCase().includes(query));
    items.forEach((nota) => list.appendChild(simpleCard(nota.numero, `${nota.emissor} → ${nota.destinatario}`, "nota fiscal")));
  }

  if (!items.length) {
    list.appendChild(simpleCard("Nenhum registro encontrado", "Tente outro código, nome ou lote.", "vazio"));
  }
}

function renderDetails(produto = state.selected) {
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

  const alert = produto.alertas_ativos?.[0];
  panel.innerHTML = `
    <span class="status-pill ${statusClass(produto.status_atual)}">${produto.status_atual.replaceAll("_", " ")}</span>
    <h3>${produto.nome}</h3>
    <p>${produto.codigo} · ${produto.lote}</p>
    <p><strong>Fabricante:</strong> ${produto.fabricante}</p>
    <p><strong>Local atual:</strong> ${produto.localizacao_atual?.nome || "Não informado"}</p>
    <div class="timeline">${timeline}</div>
    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,.16); margin: 20px 0;">
    <p><strong>Alerta:</strong> ${alert ? `${alert.tipo} (${alert.gravidade})` : "sem alertas ativos"}</p>
  `;
}

function setupEvents() {
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
  document
    .querySelectorAll(".metric-card, .step-card, .benefit-grid article, .security-grid span, .risk-card, .app-panel")
    .forEach((item, index) => {
      item.classList.add("reveal");
      item.style.transitionDelay = `${Math.min(index % 4, 3) * 90}ms`;
    });

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    $$(".reveal").forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.12 },
  );
  $$(".reveal").forEach((item) => observer.observe(item));
}

async function init() {
  setupEvents();
  setupReveal();
  const [stats, produtos, alertas, locais, notas] = await Promise.all([
    getJson("/api/stats", fallback.stats),
    getJson("/api/produtos", fallback.produtos),
    getJson("/api/alertas", fallback.alertas),
    getJson("/api/locais", fallback.locais),
    getJson("/api/notas-fiscais", fallback.notas),
  ]);

  state.produtos = produtos;
  state.alertas = alertas;
  state.locais = locais;
  state.notas = notas;
  state.selected = produtos[0];
  renderStats(stats);
  $("#alertCount").textContent = alertas.length;
  renderList();
  renderDetails();
}

init();
