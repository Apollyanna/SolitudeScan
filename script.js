/* ==================================================
   SOLITUDESCAN — LÓGICA COMPLETA + VIP AUTOMÁTICO
   + SEGURANÇA REFORÇADA + BLOQUEADOR DE ANÚNCIOS
================================================== */

// CONFIGURAÇÕES DO SUPABASE
const SUPABASE_URL = "https://zvpehjzbwastofjytogn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cGVoanpid2FzdG9manl0b2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDU0NjMsImV4cCI6MjEwMTEyMTQ2M30.KoB3qd86M5sVr_mcsixFAhBqv6rQxmW2LOWNs0_C1lg";
const EMAIL_ADMIN = "apolianadealmeidarocha97@gmail.com";
const CHAVE_PIX = "pix@solitudescan.com";
const TEMPO_PIX_SEGUNDOS = 270;
const DISCORD_URL = "https://discord.gg/fX3wUZBvk";

// DURAÇÃO DOS PLANOS VIP (EM DIAS)
const PLANOS_DURACAO = {
  'VIP Mensal': 30,
  'VIP Trimestral': 90,
  'VIP Anual': 365
};

let _supabase = null;
try {
  if (typeof supabase !== 'undefined' && SUPABASE_ANON_KEY !== "SUA_CHAVE_COMPLETA_AQUI") {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase não disponível. Rodando no modo local.");
}

let usuario = {
  logado: false,
  id: null,
  nome: "LeitorSolitude",
  email: "",
  foto: "https://via.placeholder.com/150",
  telefone: "",
  isVip: false,
  isAdmin: false,
  planoVip: null,
  vipExpiraEm: null,
  favoritos: JSON.parse(localStorage.getItem('solitude_favoritos') || '[]'),
  historico: JSON.parse(localStorage.getItem('solitude_historico') || '[]')
};

let generoAtual = 'Todos';
let termoBusca = '';
let statusFiltro = 'Todos';
let ordemFiltro = 'recentes';
let obraAtualId = null;
let capitulosObraAtual = [];
let indiceCapituloAtual = 0;
let ordemInvertida = false;
let nivelZoomLeitor = 100;
let modoImersivo = false;
let ultimoComentarioEm = 0;
let listaNotificacoes = [];
let planoPixAtual = { plano: '', valor: '' };
let solicitacaoPixAtual = null;
let timerPixInterval = null;
let pixExpirado = false;

let listaObras = [
  {
    id: 1,
    titulo: "O Protagonista Está Obcecado Pela Minha Saúde",
    genero: "Shoujo",
    status: "Em Lançamento",
    autor: "Solitude Studio",
    classificacao: "Livre",
    sinopse: "Reencarnei em um romance trágico onde meu único objetivo é cuidar do protagonista frágil. No entanto, ele parece estar prestando atenção demais em mim...",
    capitulo: "Capítulo 15",
    capa: "https://picsum.photos/300/450?random=1",
    isVip: false,
    visualizacoes: 12450,
    avaliacao: 4.9,
    capitulos: [
      { id: "c1", numero: "Capítulo 01", paginas: ["https://picsum.photos/800/1200?random=101"] },
      { id: "c2", numero: "Capítulo 02", paginas: ["https://picsum.photos/800/1200?random=102"] },
      { id: "c15", numero: "Capítulo 15", paginas: ["https://picsum.photos/800/1200?random=115"] }
    ]
  },
  {
    id: 2,
    titulo: "A Vingança da Duquesa Caída",
    genero: "Romance",
    status: "Em Lançamento",
    autor: "Rosette",
    classificacao: "16",
    sinopse: "Traída pelo homem que amava, a duquesa retorna no tempo exatos cinco anos antes de sua ruína para cobrar cada centavo e cada lágrima.",
    capitulo: "Capítulo 08",
    capa: "https://picsum.photos/300/450?random=2",
    isVip: false,
    visualizacoes: 9820,
    avaliacao: 4.7,
    capitulos: [
      { id: "c208", numero: "Capítulo 08", paginas: ["https://picsum.photos/800/1200?random=208"] }
    ]
  },
  {
    id: 3,
    titulo: "Retorno do Mago das Sombras",
    genero: "Ação",
    status: "Em Lançamento",
    autor: "ShadowK",
    classificacao: "14",
    sinopse: "O mundo foi invadido por portais e monstros implacáveis. Apenas um mago sobreviveu, e agora ele tem uma nova chance de reescrever o destino.",
    capitulo: "Capítulo 22",
    capa: "https://picsum.photos/300/450?random=3",
    isVip: true,
    visualizacoes: 18340,
    avaliacao: 4.8,
    capitulos: [
      { id: "c322", numero: "Capítulo 22", paginas: ["https://picsum.photos/800/1200?random=322"] }
    ]
  },
  {
    id: 4,
    titulo: "A Princesa que Fugiu do Casamento",
    genero: "Isekai",
    status: "Completo",
    autor: "LuaPrateada",
    classificacao: "Livre",
    sinopse: "Acordei como personagem secundária de um livro e decidi fugir do casamento arranjado para viver minha própria aventura.",
    capitulo: "Capítulo 50",
    capa: "https://picsum.photos/300/450?random=4",
    isVip: false,
    visualizacoes: 7620,
    avaliacao: 4.6,
    capitulos: [
      { id: "c450", numero: "Capítulo 50", paginas: ["https://picsum.photos/800/1200?random=450"] }
    ]
  },
  {
    id: 5,
    titulo: "Ascensão do Espadachim Negro",
    genero: "Shounen",
    status: "Em Lançamento",
    autor: "Kuro Blade",
    classificacao: "14",
    sinopse: "Um jovem espadachim amaldiçoado deve dominar a espada negra ancestral para salvar seu clã da extinção total.",
    capitulo: "Capítulo 34",
    capa: "https://picsum.photos/300/450?random=5",
    isVip: false,
    visualizacoes: 15780,
    avaliacao: 4.9,
    capitulos: [
      { id: "c534", numero: "Capítulo 34", paginas: ["https://picsum.photos/800/1200?random=534"] }
    ]
  },
  {
    id: 6,
    titulo: "A Caçadora de Demônios da Capital",
    genero: "Suspense",
    status: "Em Lançamento",
    autor: "Noir Moon",
    classificacao: "18",
    sinopse: "Em uma capital vitoriana infestada de criaturas ocultas, uma detetive solitária caça demônios disfarçados entre a alta sociedade.",
    capitulo: "Capítulo 12",
    capa: "https://picsum.photos/300/450?random=6",
    isVip: true,
    visualizacoes: 6210,
    avaliacao: 4.5,
    capitulos: [
      { id: "c612", numero: "Capítulo 12", paginas: ["https://picsum.photos/800/1200?random=612"] }
    ]
  },
  {
    id: 7,
    titulo: "Café da Meia-Noite",
    genero: "Slice of Life",
    status: "Em Lançamento",
    autor: "Yume Hoshi",
    classificacao: "Livre",
    sinopse: "Um café que só abre à meia-noite recebe clientes com histórias impossíveis. A dona do café parece saber mais do que deveria.",
    capitulo: "Capítulo 19",
    capa: "https://picsum.photos/300/450?random=7",
    isVip: false,
    visualizacoes: 4120,
    avaliacao: 4.4,
    capitulos: [
      { id: "c719", numero: "Capítulo 19", paginas: ["https://picsum.photos/800/1200?random=719"] }
    ]
  },
  {
    id: 8,
    titulo: "Protocolo Valquíria",
    genero: "Sci-fi",
    status: "Em Lançamento",
    autor: "Nova Core",
    classificacao: "16",
    sinopse: "Em 2384, a última frota humana desperta uma I.A. proibida para enfrentar uma ameaça interestelar desconhecida.",
    capitulo: "Capítulo 07",
    capa: "https://picsum.photos/300/450?random=8",
    isVip: true,
    visualizacoes: 3540,
    avaliacao: 4.7,
    capitulos: [
      { id: "c807", numero: "Capítulo 07", paginas: ["https://picsum.photos/800/1200?random=807"] }
    ]
  }
];

const CATALOGO_PADRAO = JSON.parse(JSON.stringify(listaObras));
let obrasRemotas = [];

/* ==========================================
   BLOQUEADOR DE ANÚNCIOS EM TEMPO REAL
========================================== */
function iniciarBloqueadorAnuncios() {
  const palavrasBloqueio = [
    'ad-', 'ads-', 'adsbygoogle', 'googlesyndication', 'doubleclick',
    'taboola', 'outbrain', 'mgid', 'popads', 'propellerads', 'exoclick',
    'juicyads', 'criteo', 'amazon-adsystem', 'sponsor', 'affiliate',
    'popup-ad', 'overlay-ad', 'banner-ad', 'pop-under', 'popunder'
  ];

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        if (node.tagName === 'IFRAME') {
          const src = (node.src || '').toLowerCase();
          const ehSuspeito = palavrasBloqueio.some(p => src.includes(p));
          if (ehSuspeito) {
            node.remove();
            console.log('SolitudeScan: iframe de anúncio bloqueado');
            return;
          }
        }

        if (node.tagName === 'DIV' || node.tagName === 'INS' || node.tagName === 'ASIDE') {
          const id = (node.id || '').toLowerCase();
          const className = (node.className || '').toString().toLowerCase();
          const ehAnuncio = palavrasBloqueio.some(p => id.includes(p) || className.includes(p));
          if (ehAnuncio) {
            node.remove();
            console.log('SolitudeScan: elemento de anúncio bloqueado');
            return;
          }
        }

        if (node.tagName === 'SCRIPT' && node.src) {
          const src = node.src.toLowerCase();
          const dominiosPermitidos = [
            'supabase.co', 'googleapis.com', 'gstatic.com',
            'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'
          ];
          const ehPermitido = dominiosPermitidos.some(d => src.includes(d));
          if (!ehPermitido && !src.startsWith(window.location.origin)) {
            node.remove();
            console.log('SolitudeScan: script externo bloqueado');
          }
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(() => {
    const seletores = 'iframe, ins, .adsbygoogle, [id*="ad-"], [class*="ad-"], [class*="ads-"]';
    document.querySelectorAll(seletores).forEach(el => {
      const id = (el.id || '').toLowerCase();
      const className = (el.className || '').toString().toLowerCase();
      const src = (el.src || '').toLowerCase();
      const ehAnuncio = palavrasBloqueio.some(p =>
        id.includes(p) || className.includes(p) || src.includes(p)
      );
      if (ehAnuncio) el.remove();
    });
  }, 1500);

  window.open = function(...args) {
    console.log('SolitudeScan: pop-up bloqueado');
    return null;
  };
}

/* ==========================================
   PROTEÇÃO CONTRA CLICKJACKING
========================================== */
function ativarProtecaoClickjacking() {
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      document.body.innerHTML = `
        <div style="padding:40px;text-align:center;font-family:sans-serif;">
          <h2>Acesso bloqueado</h2>
          <p>Este site não pode ser exibido em frames externos.</p>
          <a href="${window.self.location.href}">Abrir diretamente</a>
        </div>
      `;
    }
  }
}

/* ==========================================
   FUNÇÕES UTILITÁRIAS
========================================== */
function escaparHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validarSenhaForte(senha) {
  return senha.length >= 8 &&
    /[a-zA-Z]/.test(senha) &&
    /[0-9]/.test(senha) &&
    /[^a-zA-Z0-9]/.test(senha);
}

function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    sucesso: 'fa-circle-check',
    erro: 'fa-circle-xmark',
    alerta: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `<i class="fa-solid ${icons[tipo] || icons.info}"></i><span>${escaparHtml(mensagem)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-sair');
    setTimeout(() => toast.remove(), 300);
  }, duracao);
}

function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (el) el.classList.add('active');

  const footer = document.getElementById('siteFooter');
  if (footer) {
    footer.style.display = (tabId === 'tab-home') ? 'flex' : 'none';
  }
}

function alternarTema() {
  const html = document.documentElement;
  const ehLight = html.classList.contains('light');

  if (ehLight) {
    html.classList.remove('light');
    html.classList.add('dark');
    localStorage.setItem('solitude_theme', 'dark');
    mostrarToast('Tema escuro ativado. Leitura noturna confortável.', 'info', 2000);
  } else {
    html.classList.remove('dark');
    html.classList.add('light');
    localStorage.setItem('solitude_theme', 'light');
    mostrarToast('Tema claro ativado. Boa leitura!', 'info', 2000);
  }

  const icone = document.getElementById('iconeTemaBotao');
  if (icone) {
    icone.className = ehLight ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  }
}

function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.toggle('active');
  document.body.style.overflow = modal.classList.contains('active') ? 'hidden' : 'auto';
}

function formatarNumero(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function ehUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
}

function todasAsObras() {
  const mapa = new Map();
  [...listaObras, ...obrasRemotas].forEach(o => mapa.set(String(o.id), o));
  return [...mapa.values()];
}

// === FIM DA PARTE 1 ===

/* ==========================================
   CARREGAMENTO E RENDERIZAÇÃO DE OBRAS
========================================== */
async function carregarObras() {
  const container = document.getElementById('mangaContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--texto-claro);">
      <i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--primaria); margin-bottom:10px;"></i>
      <p>Carregando obras...</p>
    </div>
  `;

  let obras = [];

  if (_supabase) {
    try {
      if (termoBusca) {
        const { data } = await _supabase.rpc('search_works', { query: termoBusca, p_limit: 30 });
        if (data && Array.isArray(data)) {
          obras = data.map(mudarCamposSupabaseParaLocal);
        }
      } else {
        let query = _supabase
          .from('works')
          .select('*, work_genres(genres(name))')
          .eq('is_published', true)
          .is('deleted_at', null);

        if (generoAtual === 'Favoritos') {
          if (usuario.favoritos.length === 0) { renderizarGridObras([]); return; }
          query = query.in('id', usuario.favoritos);
        } else if (generoAtual !== 'Todos') {
          const { data: g } = await _supabase.from('genres').select('id').eq('name', generoAtual).limit(1);
          if (g && g.length > 0) {
            const { data: wg } = await _supabase.from('work_genres').select('work_id').eq('genre_id', g[0].id);
            const ids = (wg || []).map(x => x.work_id);
            if (ids.length === 0) { renderizarGridObras([]); return; }
            query = query.in('id', ids);
          } else {
            const tipoSlug = generoAtual.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            query = query.eq('type', tipoSlug);
          }
        }

        if (statusFiltro === 'Em Lançamento') query = query.eq('status', 'ongoing');
        else if (statusFiltro === 'Completo') query = query.eq('status', 'completed');

        if (ordemFiltro === 'alfabetica') query = query.order('title', { ascending: true });
        else if (ordemFiltro === 'populares') query = query.order('views_count', { ascending: false });
        else if (ordemFiltro === 'avaliacao') query = query.order('rating_avg', { ascending: false });
        else query = query.order('last_chapter_at', { ascending: false, nullsFirst: false });

        query = query.limit(60);

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          obras = data.map(mudarCamposSupabaseParaLocal);
          obrasRemotas = obras;
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar no Supabase, usando catálogo local:', err);
    }
  }

  if (obras.length === 0 && !termoBusca) {
    obras = listaObras;
    if (generoAtual === 'Favoritos') {
      obras = obras.filter(o => usuario.favoritos.includes(o.id));
    } else if (generoAtual !== 'Todos') {
      obras = obras.filter(o => o.genero === generoAtual);
    }
    if (statusFiltro !== 'Todos') obras = obras.filter(o => o.status === statusFiltro);
    obras = ordenarObras(obras);
  }

  renderizarGridObras(obras);
}

function ordenarObras(obras) {
  const copia = [...obras];
  if (ordemFiltro === 'alfabetica') {
    copia.sort((a, b) => a.titulo.localeCompare(b.titulo));
  } else if (ordemFiltro === 'populares') {
    copia.sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0));
  } else if (ordemFiltro === 'avaliacao') {
    copia.sort((a, b) => (b.avaliacao || 0) - (a.avaliacao || 0));
  }
  return copia;
}

function mudarCamposSupabaseParaLocal(obra) {
  const generos = Array.isArray(obra.work_genres)
    ? obra.work_genres.map(wg => wg.genres ? wg.genres.name : null).filter(Boolean)
    : [];

  const statusMap = {
    ongoing: 'Em Lançamento',
    completed: 'Completo',
    hiatus: 'Em Hiato',
    dropped: 'Cancelado',
    licensed: 'Licenciado',
    cancelled: 'Cancelado'
  };

  return {
    id: obra.id,
    titulo: obra.title,
    genero: generos.length > 0 ? generos[0] : (obra.type || 'Manhwa'),
    generos: generos,
    status: statusMap[obra.status] || 'Em Lançamento',
    autor: obra.author || 'Desconhecido',
    sinopse: obra.synopsis || '',
    capitulo: obra.chapters_count > 0 ? ('Capítulo ' + obra.chapters_count) : 'Ver Capítulos',
    capa: obra.cover_url || 'https://via.placeholder.com/300x450',
    banner: obra.banner_url || obra.cover_url || '',
    slug: obra.slug || '',
    tipo: obra.type || 'manhwa',
    ano: obra.year || null,
    isVip: obra.is_vip || false,
    isAdulto: obra.is_adult || false,
    classificacao: (obra.rating_age && obra.rating_age > 10) ? (obra.rating_age + '+') : 'Livre',
    visualizacoes: obra.views_count || 0,
    avaliacao: parseFloat(obra.rating_avg || 0),
    capitulos: []
  };
}

function renderizarGridObras(obras) {
  const container = document.getElementById('mangaContainer');

  if (obras.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:30px; color:var(--texto-claro);">
        Nenhuma obra encontrada.
      </div>`;
    return;
  }

  container.innerHTML = obras.map(obra => `
    <div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
      ${obra.isVip ? '<div class="vip-badge">VIP</div>' : ''}
      ${usuario.favoritos.includes(obra.id) ? '<div class="fav-badge"><i class="fa-solid fa-heart" style="color:var(--primaria);"></i></div>' : ''}
      <img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy">
      <div class="manga-info">
        <p class="manga-title">${escaparHtml(obra.titulo)}</p>
        <p class="manga-cap">${escaparHtml(obra.capitulo)}</p>
      </div>
    </div>
  `).join('');
}

function filtrarGenero(genero, el) {
  generoAtual = genero;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  carregarObras();
}

function filtrarObras() {
  const input = document.getElementById('searchInput');
  if (input) {
    termoBusca = input.value.toLowerCase().trim();
    carregarObras();
  }
}

function aplicarFiltrosAvancados() {
  const tituloGrid = document.getElementById('gridTitleSection');
  if (tituloGrid) {
    if (statusFiltro === 'Em Lançamento') tituloGrid.textContent = 'Em Lançamento';
    else if (ordemFiltro === 'populares') tituloGrid.textContent = 'Mais Populares';
    else if (ordemFiltro === 'alfabetica') tituloGrid.textContent = 'Ordem Alfabética';
    else if (ordemFiltro === 'avaliacao') tituloGrid.textContent = 'Melhor Avaliados';
    else tituloGrid.textContent = 'Últimas Atualizações';
  }

  mostrarToast(`Exibindo: ${tituloGrid ? tituloGrid.textContent : 'obras'}`, 'info', 2000);
  carregarObras();
}

function criarItemCarousel(obra, comUltimoCap = false) {
  const hist = usuario.historico.find(h => String(h.id) === String(obra.id));
  const textoInfo = comUltimoCap && hist ? hist.ultimoCap : (obra.capitulo || 'Ver Capítulos');

  return `
    <div class="carousel-item">
      <div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
        ${obra.isVip ? '<div class="vip-badge">VIP</div>' : ''}
        <img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy" style="height:180px;">
        <div class="manga-info">
          <p class="manga-title">${escaparHtml(obra.titulo)}</p>
          <p class="manga-cap">${escaparHtml(textoInfo)}</p>
        </div>
      </div>
    </div>
  `;
}

async function renderizarTendencias() {
  const container = document.getElementById('tendenciasContainer');
  if (!container) return;

  let tendencia = [];

  if (_supabase) {
    try {
      const { data, error } = await _supabase
        .from('works')
        .select('*, work_genres(genres(name))')
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('views_count', { ascending: false })
        .limit(6);
      if (!error && data && data.length > 0) {
        tendencia = data.map(mudarCamposSupabaseParaLocal);
      }
    } catch (e) { console.warn(e); }
  }

  if (tendencia.length === 0) {
    tendencia = [...todasAsObras()]
      .sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0))
      .slice(0, 6);
  }

  container.innerHTML = tendencia.map(obra => criarItemCarousel(obra)).join('');
  carregarHeroBanner();
}

let heroIndice = 0;
let heroObras = [];

async function carregarHeroBanner() {
  if (heroObras.length === 0) {
    if (_supabase) {
      try {
        const { data: b } = await _supabase.from('banners').select('*').eq('is_active', true).order('position').limit(5);
        if (b && b.length > 0) {
          heroObras = b.map(x => ({ id: x.work_id || null, titulo: x.title, capa: x.image_url, genero: x.subtitle || 'DESTAQUE', isVip: false }));
        }
      } catch (e) { console.warn(e); }
    }
    if (heroObras.length === 0 && _supabase) {
      try {
        const { data } = await _supabase.from('works').select('*, work_genres(genres(name))').eq('is_published', true).is('deleted_at', null).eq('is_featured', true).limit(5);
        if (data && data.length > 0) heroObras = data.map(mudarCamposSupabaseParaLocal);
      } catch (e) { console.warn(e); }
    }
    if (heroObras.length === 0) {
      heroObras = [...todasAsObras()].sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0)).slice(0, 5);
    }
  }
  rotacionarHero();
}

function rotacionarHero() {
  const section = document.getElementById('heroBannerSection');
  const titleEl = document.getElementById('heroTitleDisplay');
  const tagEl = document.getElementById('heroGenreTag');
  if (!section || !titleEl || heroObras.length === 0) return;

  const obra = heroObras[heroIndice % heroObras.length];
  heroIndice++;

  titleEl.textContent = obra.titulo;
  if (tagEl) tagEl.textContent = String(obra.genero || 'MANHWA').toUpperCase();
  section.style.background = `linear-gradient(180deg, rgba(10,5,11,0.2) 0%, var(--fundo) 100%), url('${obra.capa}') center/cover no-repeat`;
  section.style.cursor = 'pointer';
  section.onclick = () => { if (obra.id) abrirDetalhesObra(obra.id); };
}

async function renderizarContinueLendo() {
  const container = document.getElementById('continueLendoContainer');
  const section = document.getElementById('continueLendoSection');
  if (!container || !section) return;

  let itens = [];

  if (_supabase && usuario.logado && usuario.id) {
    try {
      const { data } = await _supabase.rpc('get_continue_reading', { p_user_id: usuario.id });
      if (data && Array.isArray(data) && data.length > 0) {
        itens = data.map(h => ({
          id: h.work_id,
          titulo: h.title,
          capa: h.cover_url,
          capitulo: h.current_chapter ? ('Capítulo ' + h.current_chapter) : 'Capítulo 1',
          isVip: false
        }));
      }
    } catch (e) { console.warn(e); }
  }

  if (itens.length === 0 && usuario.historico.length > 0) {
    itens = usuario.historico
      .map(h => {
        const obra = todasAsObras().find(o => String(o.id) === String(h.id));
        return obra ? Object.assign({}, obra, { doHistoricoLocal: true, ultimoCap: h.ultimoCap }) : null;
      })
      .filter(Boolean)
      .slice(0, 6);
  }

  if (itens.length === 0) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  container.innerHTML = itens.slice(0, 6).map(obra => criarItemCarousel(obra, !!obra.doHistoricoLocal)).join('');
}

async function renderizarRanking() {
  const container = document.getElementById('rankingContainer');
  if (!container) return;

  let top10 = [];

  if (_supabase) {
    try {
      const { data } = await _supabase
        .from('works')
        .select('*, work_genres(genres(name))')
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('views_count', { ascending: false })
        .limit(10);
      if (data && data.length > 0) top10 = data.map(mudarCamposSupabaseParaLocal);
    } catch (e) { console.warn(e); }
  }

  if (top10.length === 0) {
    top10 = [...todasAsObras()]
      .sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0))
      .slice(0, 10);
  }

  if (top10.length === 0) {
    container.innerHTML = '<p style="grid-column:1/-1; font-size:0.8rem; color:var(--texto-claro); text-align:center; padding:20px;">O ranking aparece assim que as obras tiverem visualizações.</p>';
    return;
  }

  container.innerHTML = top10.map((obra, idx) => `
    <div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
      <div class="rank-badge">${idx + 1}</div>
      ${obra.isVip ? '<div class="vip-badge">VIP</div>' : ''}
      <img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy">
      <div class="manga-info">
        <p class="manga-title">${escaparHtml(obra.titulo)}</p>
        <p class="manga-cap">${formatarNumero(obra.visualizacoes || 0)} views</p>
      </div>
    </div>
  `).join('');
}

function renderizarConcluidas() {
  const container = document.getElementById('concluidasContainer');
  if (!container) return;

  const concluidas = [...todasAsObras()].filter(o => o.status === 'Completo');

  if (concluidas.length === 0) {
    container.innerHTML = '<p style="grid-column:1/-1; font-size:0.8rem; color:var(--texto-claro); text-align:center; padding:20px;">Nenhuma obra concluída ainda. Em breve!</p>';
    return;
  }

  container.innerHTML = concluidas.map(obra => `
    <div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
      <div class="vip-badge" style="background: linear-gradient(135deg, var(--sucesso), #059669);">COMPLETO</div>
      <img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy">
      <div class="manga-info">
        <p class="manga-title">${escaparHtml(obra.titulo)}</p>
        <p class="manga-cap">${escaparHtml(obra.genero)}</p>
      </div>
    </div>
  `).join('');
}

// === FIM DA PARTE 2 ===

/* ==========================================
   DETALHES DA OBRA
========================================== */
async function abrirDetalhesObra(id) {
  let obra = listaObras.find(o => String(o.id) === String(id));

  if (!obra && _supabase) {
    try {
      const { data } = await _supabase.from('works').select('*').eq('id', id).single();
      if (data) obra = mudarCamposSupabaseParaLocal(data);
    } catch (e) {
      console.warn("Erro ao carregar detalhes do Supabase:", e);
    }
  }

  if (!obra) return;

  obraAtualId = id;

  if (_supabase) {
    try {
      const { data: caps } = await _supabase.from('chapters').select('*').eq('work_id', id).order('chapter_number', { ascending: true });
      if (caps && caps.length > 0) {
        capitulosObraAtual = caps.map(c => ({
          id: c.id,
          numero: `Capítulo ${c.chapter_number}`,
          paginas: c.pages || []
        }));
      } else {
        capitulosObraAtual = obra.capitulos || [];
      }
    } catch (e) {
      capitulosObraAtual = obra.capitulos || [];
    }
  } else {
    capitulosObraAtual = obra.capitulos || [];
  }

  document.getElementById('detalhesTitulo').textContent = obra.titulo;
  document.getElementById('detalhesCapa').src = obra.capa;
  document.getElementById('detalhesGenero').textContent = `Gênero: ${obra.genero}`;
  document.getElementById('detalhesStatus').textContent = `Status: ${obra.status}`;
  document.getElementById('detalhesAutor').textContent = `Autor: ${obra.autor}`;
  document.getElementById('detalhesSinopse').textContent = obra.sinopse;

  renderizarBannerDetalhes(obra);
  renderizarMetadadosDetalhes(obra);
  renderizarGenerosDetalhes(obra);
  carregarEquipeObra(obra);
  renderizarCapitulosInfo(obra);
  garantirBotaoCompartilhar();
  garantirBotaoAdicionarLista();
  renderizarCurtirObra(obra);
  renderizarBadgesDetalhes(obra);
  renderizarAcoesDetalhes(obra);

  obra.visualizacoes = (obra.visualizacoes || 0) + 1;
  renderizarTendencias();
  renderizarRanking();

  atualizarBolinhasAvaliacao(obra.avaliacao || 0);
  atualizarBotaoFavorito();
  atualizarListaCapitulos();
  carregarComentariosObra(id);
  toggleModal('detalhesModal');

  registrarVisualizacaoObra(id);
  carregarObrasRelacionadas(id);
}

/* ==========================================
   FASE 5 — PÁGINA DA OBRA (F5-1)
========================================== */
function garantirSecaoBannerDetalhes() {
  let sec = document.getElementById('detalhesBannerSection');
  if (!sec) {
    const capa = document.getElementById('detalhesCapa');
    if (!capa || !capa.parentNode) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesBannerSection';
    sec.style.cssText = 'width:100%; height:180px; border-radius:10px; margin-bottom:12px; background-size:cover; background-position:center; position:relative; overflow:hidden; display:none;';
    capa.parentNode.parentNode.insertBefore(sec, capa.parentNode);
  }
  return sec;
}

function garantirSecaoMetadadosDetalhes() {
  let sec = document.getElementById('detalhesMetadadosSection');
  if (!sec) {
    const sinopse = document.getElementById('detalhesSinopse');
    if (!sinopse) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesMetadadosSection';
    sec.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(90px, 1fr)); gap:6px; margin:12px 0;';
    sinopse.parentNode.insertBefore(sec, sinopse.nextSibling);
  }
  return sec;
}

function garantirSecaoGenerosDetalhes() {
  let sec = document.getElementById('detalhesGenerosSection');
  if (!sec) {
    const generoEl = document.getElementById('detalhesGenero');
    if (!generoEl) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesGenerosSection';
    sec.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 12px;';
    generoEl.parentNode.insertBefore(sec, generoEl.nextSibling);
    generoEl.style.display = 'none';
  }
  return sec;
}

function renderizarBannerDetalhes(obra) {
  const sec = garantirSecaoBannerDetalhes();
  if (!sec) return;
  if (obra.banner) {
    sec.style.backgroundImage = `linear-gradient(180deg, rgba(10,5,11,0.3) 0%, rgba(10,5,11,0.8) 100%), url('${escaparHtml(obra.banner)}')`;
    sec.style.display = 'block';
  } else {
    sec.style.display = 'none';
  }
}

function renderizarMetadadosDetalhes(obra) {
  const sec = garantirSecaoMetadadosDetalhes();
  if (!sec) return;
  const items = [
    { icone: 'fa-eye', label: 'Views', valor: formatarNumero(obra.visualizacoes || 0) },
    { icone: 'fa-star', label: 'Nota', valor: (obra.avaliacao || 0).toFixed(1) },
    { icone: 'fa-calendar', label: 'Ano', valor: obra.ano || '--' },
    { icone: 'fa-book-open', label: 'Tipo', valor: (obra.tipo || 'manhwa').toUpperCase() }
  ];
  sec.innerHTML = items.map(i => `
    <div style="background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:8px; text-align:center;">
      <i class="fa-solid ${i.icone}" style="color:var(--primaria); font-size:0.85rem;"></i>
      <p style="font-weight:800; font-size:0.9rem; margin:4px 0 0;">${i.valor}</p>
      <p style="font-size:0.6rem; color:var(--texto-claro); margin:0;">${i.label}</p>
    </div>
  `).join('');
}

function renderizarGenerosDetalhes(obra) {
  const sec = garantirSecaoGenerosDetalhes();
  if (!sec) return;
  const generos = (obra.generos && obra.generos.length > 0) ? obra.generos : [obra.genero];
  sec.innerHTML = generos.map(g => `
    <span onclick="fecharDetalhesEFiltrarGenero('${escaparHtml(g)}')" style="background:var(--primaria); color:#fff; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700; cursor:pointer; display:inline-block;">${escaparHtml(g)}</span>
  `).join('');
}

function fecharDetalhesEFiltrarGenero(genero) {
  toggleModal('detalhesModal');
  filtrarGenero(genero, null);
  switchTab('tab-home', null);
}

/* ==========================================
   FASE 5 — PÁGINA DA OBRA (F5-2)
========================================== */
function garantirSecaoEquipeDetalhes() {
  let sec = document.getElementById('detalhesEquipeSection');
  if (!sec) {
    const autorEl = document.getElementById('detalhesAutor');
    if (!autorEl) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesEquipeSection';
    sec.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:8px; margin:10px 0;';
    autorEl.parentNode.insertBefore(sec, autorEl.nextSibling);
    autorEl.style.display = 'none';
  }
  return sec;
}

function garantirSecaoCapitulosInfo() {
  let sec = document.getElementById('detalhesCapitulosInfo');
  if (!sec) {
    const lista = document.getElementById('listaCapitulosContainer');
    if (!lista) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesCapitulosInfo';
    sec.style.cssText = 'background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;';
    lista.parentNode.insertBefore(sec, lista);
  }
  return sec;
}

function garantirBotaoCompartilhar() {
  let btn = document.getElementById('btnCompartilharObra');
  if (!btn) {
    const btnFav = document.getElementById('btnFavoritar');
    if (!btnFav) return null;
    btn = document.createElement('button');
    btn.id = 'btnCompartilharObra';
    btn.className = 'btn-acao';
    btn.style.cssText = btnFav.style.cssText + ' margin-top:8px;';
    btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Compartilhar Obra';
    btn.onclick = compartilharObraAtual;
    btnFav.parentNode.insertBefore(btn, btnFav.nextSibling);
  }
  return btn;
}

function garantirBotaoAdicionarLista() {
  let btn = document.getElementById('btnAdicionarLista');
  if (!btn) {
    const btnShare = document.getElementById('btnCompartilharObra');
    if (!btnShare) return null;
    btn = document.createElement('button');
    btn.id = 'btnAdicionarLista';
    btn.style.cssText = btnShare.style.cssText + ' margin-top:6px;';
    btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Adicionar à Lista';
    btn.onclick = () => abrirModalEscolherLista(obraAtualId);
    btnShare.parentNode.insertBefore(btn, btnShare.nextSibling);
  }
  return btn;
}

async function carregarEquipeObra(obra) {
  const sec = garantirSecaoEquipeDetalhes();
  if (!sec) return;
  const equipe = [];

  if (_supabase && obra.id && ehUuid(obra.id)) {
    try {
      const { data: w } = await _supabase
        .from('works')
        .select('author_id, artist_id, scanlator_id, creators!works_author_id_fkey(name), creators_artist!works_artist_id_fkey(name), scanlators(name)')
        .eq('id', obra.id)
        .single();

      if (w) {
        if (w.creators && w.creators.name) equipe.push({ papel: 'Autor', nome: w.creators.name });
        else if (obra.autor && obra.autor !== 'Desconhecido') equipe.push({ papel: 'Autor', nome: obra.autor });

        if (w.creators_artist && w.creators_artist.name) equipe.push({ papel: 'Artista', nome: w.creators_artist.name });

        if (w.scanlators && w.scanlators.name) equipe.push({ papel: 'Scanlator', nome: w.scanlators.name });
      } else {
        if (obra.autor && obra.autor !== 'Desconhecido') equipe.push({ papel: 'Autor', nome: obra.autor });
      }
    } catch (e) {
      console.warn(e);
      if (obra.autor && obra.autor !== 'Desconhecido') equipe.push({ papel: 'Autor', nome: obra.autor });
    }
  } else {
    if (obra.autor && obra.autor !== 'Desconhecido') equipe.push({ papel: 'Autor', nome: obra.autor });
  }

  if (equipe.length === 0) {
    sec.style.display = 'none';
    return;
  }

  sec.style.display = 'grid';
  sec.innerHTML = equipe.map(e => `
    <div style="background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:8px; text-align:center;">
      <p style="font-size:0.6rem; color:var(--texto-claro); margin:0; text-transform:uppercase; letter-spacing:0.5px;">${escaparHtml(e.papel)}</p>
      <p style="font-weight:700; font-size:0.8rem; margin:4px 0 0;">${escaparHtml(e.nome)}</p>
    </div>
  `).join('');
}

async function renderizarCapitulosInfo(obra) {
  const sec = garantirSecaoCapitulosInfo();
  if (!sec) return;

  let totalCaps = 0;
  let ultimoCap = null;

  if (_supabase && obra.id && ehUuid(obra.id)) {
    try {
      const { count } = await _supabase
        .from('chapters')
        .select('id', { count: 'exact', head: true })
        .eq('work_id', obra.id)
        .eq('is_published', true);
      totalCaps = count || 0;

      const { data: ult } = await _supabase
        .from('chapters')
        .select('chapter_number, release_at')
        .eq('work_id', obra.id)
        .eq('is_published', true)
        .order('chapter_number', { ascending: false })
        .limit(1);
      if (ult && ult.length > 0) ultimoCap = ult[0];
    } catch (e) {
      console.warn(e);
    }
  }

  if (totalCaps === 0) {
    totalCaps = capitulosObraAtual.length;
  }

  const dataUltimo = ultimoCap && ultimoCap.release_at
    ? new Date(ultimoCap.release_at).toLocaleDateString('pt-BR')
    : '--';

  sec.innerHTML = `
    <div>
      <p style="font-size:0.65rem; color:var(--texto-claro); margin:0; text-transform:uppercase;">Total</p>
      <p style="font-weight:800; font-size:1rem; margin:2px 0 0;">${totalCaps} capítulo${totalCaps !== 1 ? 's' : ''}</p>
    </div>
    <div style="text-align:right;">
      <p style="font-size:0.65rem; color:var(--texto-claro); margin:0; text-transform:uppercase;">Último</p>
      <p style="font-weight:800; font-size:0.85rem; margin:2px 0 0;">${dataUltimo}</p>
    </div>
  `;
}

async function compartilharObraAtual() {
  if (!obraAtualId) return;
  const obra = todasAsObras().find(o => String(o.id) === String(obraAtualId));
  if (!obra) return;

  const url = window.location.origin + window.location.pathname + '?obra=' + obra.id;
  const texto = `Confira "${obra.titulo}" na SolitudeScan`;

  if (navigator.share) {
    try {
      await navigator.share({ title: obra.titulo, text: texto, url: url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    mostrarToast('Link copiado para a área de transferência!', 'sucesso');
  } catch (e) {
    mostrarToast('Link: ' + url, 'info', 6000);
  }
}

/* ==========================================
   FASE 5 — PÁGINA DA OBRA (F5-3)
========================================== */
function garantirSecaoBadgesDetalhes() {
  let sec = document.getElementById('detalhesBadgesSection');
  if (!sec) {
    const titulo = document.getElementById('detalhesTitulo');
    if (!titulo) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesBadgesSection';
    sec.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 10px;';
    titulo.parentNode.insertBefore(sec, titulo.nextSibling);
  }
  return sec;
}

function renderizarBadgesDetalhes(obra) {
  const sec = garantirSecaoBadgesDetalhes();
  if (!sec) return;

  const statusEl = document.getElementById('detalhesStatus');
  if (statusEl) statusEl.style.display = 'none';

  const coresStatus = {
    'Em Lançamento': 'var(--sucesso)',
    'Completo': 'var(--primaria)',
    'Em Hiato': 'var(--alerta)',
    'Cancelado': 'var(--erro)',
    'Licenciado': 'var(--texto-claro)'
  };

  const corStatus = coresStatus[obra.status] || 'var(--texto-claro)';

  sec.innerHTML = `
    <span style="background:${corStatus}; color:#fff; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800; text-transform:uppercase;">${escaparHtml(obra.status)}</span>
    <span style="background:var(--fundo-card); border:1px solid var(--borda); color:var(--texto-claro); padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800;">${escaparHtml(obra.classificacao || 'Livre')}</span>
    ${obra.isVip ? '<span style="background:var(--alerta); color:#fff; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800;">VIP</span>' : ''}
    ${obra.isAdulto ? '<span style="background:var(--erro); color:#fff; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800;">+18</span>' : ''}
  `;
}

function garantirSecaoAcoesDetalhes() {
  let sec = document.getElementById('detalhesAcoesSection');
  if (!sec) {
    const lista = document.getElementById('listaCapitulosContainer');
    if (!lista) return null;
    sec = document.createElement('div');
    sec.id = 'detalhesAcoesSection';
    sec.style.cssText = 'margin:12px 0;';
    lista.parentNode.insertBefore(sec, lista);
  }
  return sec;
}

function renderizarAcoesDetalhes(obra) {
  const sec = garantirSecaoAcoesDetalhes();
  if (!sec) return;

  let indiceAlvo = 0;
  let textoBotao = 'Ler Primeiro Capítulo';

  const histLocal = usuario.historico.find(h => String(h.id) === String(obra.id));

  if (histLocal && capitulosObraAtual.length > 0) {
    const idx = capitulosObraAtual.findIndex(c => c.numero === histLocal.ultimoCap);
    if (idx >= 0) {
      indiceAlvo = idx;
      textoBotao = 'Continuar Leitura — ' + capitulosObraAtual[idx].numero;
    }
  }

  sec.innerHTML = `
    <button style="width:100%; background:var(--primaria); color:#fff; border:none; padding:12px; border-radius:8px; font-weight:800; font-size:0.9rem; cursor:pointer;" onclick="abrirLeitor(${indiceAlvo})">
      <i class="fa-solid fa-book-open"></i> ${escaparHtml(textoBotao)}
    </button>
  `;
}

function atualizarBolinhasAvaliacao(nota) {
  const notaEl = document.getElementById('notaExibicao');
  if (notaEl) notaEl.textContent = `${nota.toFixed(1)} / 5.0`;
  const dots = document.querySelectorAll('#ratingDotsContainer .rating-dot');
  dots.forEach((el, idx) => {
    el.classList.toggle('active', idx < Math.round(nota));
  });
}

function atualizarListaCapitulos() {
  const container = document.getElementById('listaCapitulosContainer');
  if (!container) return;

  if (capitulosObraAtual.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:var(--texto-claro); text-align:center;">Nenhum capítulo disponível ainda.</p>';
    return;
  }

  let caps = ordemInvertida ? [...capitulosObraAtual].reverse() : capitulosObraAtual;

  container.innerHTML = caps.map((cap, idx) => {
    const realIndex = ordemInvertida ? (capitulosObraAtual.length - 1 - idx) : idx;
    return `
      <button class="chip" style="width:100%; text-align:left; border-radius:6px; display:flex; justify-content:space-between; align-items:center;" onclick="abrirLeitor(${realIndex})">
        <span>${escaparHtml(cap.numero)}</span>
        <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.6;"></i>
      </button>
    `;
  }).join('');
}

function inverterOrdemCapitulos() {
  ordemInvertida = !ordemInvertida;
  atualizarListaCapitulos();
  mostrarToast(ordemInvertida ? 'Capítulos do mais recente para o antigo.' : 'Capítulos do antigo para o mais recente.', 'info', 2000);
}

/* ==========================================
   LEITOR DE CAPÍTULOS
========================================== */
async function abrirLeitor(indice) {
  let obra = listaObras.find(o => String(o.id) === String(obraAtualId));

  verificarVipAtivo();

  if (obra && obra.isVip && !usuario.isVip && !usuario.isAdmin) {
    mostrarToast('Esta obra é exclusiva para membros VIP. Assine um plano para desbloquear!', 'alerta');
    abrirModalVip();
    return;
  }

  indiceCapituloAtual = indice;
  let cap = capitulosObraAtual[indice];
  if (!cap) return;

  document.getElementById('readerTitle').textContent = obra ? obra.titulo : "SolitudeScan";
  document.getElementById('readerCap').textContent = cap.numero;

  const cascataContainer = document.getElementById('readerCascataContainer');
  cascataContainer.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--primaria);"></i></div>';

  if ((!cap.paginas || cap.paginas.length === 0) && _supabase && cap.id) {
    try {
      const { data } = await _supabase.from('chapters').select('pages').eq('id', cap.id).single();
      if (data && data.pages) cap.paginas = data.pages;
    } catch (e) {
      console.warn("Erro ao carregar páginas do capítulo:", e);
    }
  }

  cascataContainer.innerHTML = (cap.paginas || []).map(pag => `
    <img src="${escaparHtml(pag)}" loading="lazy" class="pagina-capitulo" alt="Página do Capítulo" style="width:${nivelZoomLeitor}%; max-width:100%; display:block; margin:0 auto 10px auto; border-radius:4px;">
  `).join('');

  montarRodapeLeitor();
  restaurarProgressoPixel();

  if (obra) {
    adicionarHistorico(obra);
    salvarProgressoLeituraSupabase(obra.id, cap.id || cap.numero, 1);
  }

  if (cap.id) registrarVisualizacaoCapitulo(cap.id);
  if (capitulosObraAtual[indice + 1]) {
    preCarregarImagensCapitulo(capitulosObraAtual[indice + 1].paginas);
  }

  const modalDetalhes = document.getElementById('detalhesModal');
  if (modalDetalhes && modalDetalhes.classList.contains('active')) {
    toggleModal('detalhesModal');
  }

  const readerModal = document.getElementById('readerModal');
  if (readerModal && !readerModal.classList.contains('active')) {
    toggleModal('readerModal');
  }
}

function fecharLeitor() {
  salvarProgressoPixel();
  if (modoImersivo) alternarModoImersivo();
  toggleModal('readerModal');
}

function mudarCapituloLeitor(delta, e) {
  if (e) e.stopPropagation();
  salvarProgressoPixel();
  const novoIndice = indiceCapituloAtual + delta;
  if (novoIndice < 0) {
    mostrarToast('Você já está no primeiro capítulo desta obra.', 'info');
    return;
  }
  if (novoIndice >= capitulosObraAtual.length) {
    mostrarToast('Você chegou ao último capítulo disponível. Volte em breve!', 'info');
    return;
  }
  abrirLeitor(novoIndice);
}

function ajustarZoomLeitor(delta) {
  nivelZoomLeitor = Math.min(Math.max(nivelZoomLeitor + delta, 50), 150);
  document.querySelectorAll('.pagina-capitulo').forEach(img => {
    img.style.width = `${nivelZoomLeitor}%`;
  });
}

function alternarTelaCheia() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => mostrarToast('Não foi possível ativar a tela cheia: ' + err.message, 'erro'));
  } else {
    document.exitFullscreen();
  }
}

function alternarModoImersivo() {
  modoImersivo = !modoImersivo;
  document.body.classList.toggle('imersivo', modoImersivo);
  mostrarToast(
    modoImersivo ? 'Modo imersivo ativado. Boa leitura sem distrações!' : 'Modo imersivo desativado.',
    'info', 2500
  );
}

function iniciarGestosLeitor() {
  const area = document.getElementById('readerCascataContainer');
  if (!area) return;

  let startX = 0, startY = 0;

  area.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  area.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
      if (dx < 0) mudarCapituloLeitor(1);
      else mudarCapituloLeitor(-1);
    }
  }, { passive: true });

  area.addEventListener('scroll', () => {
    const total = area.scrollHeight - area.clientHeight;
    const pct = total > 0 ? Math.round((area.scrollTop / total) * 100) : 0;
    const el = document.getElementById('readerProgress');
    if (el) el.textContent = pct + '%';
  }, { passive: true });
}

// === FIM DA PARTE 3 ===

/* ==========================================
   FAVORITOS E HISTÓRICO
========================================== */
async function alternarFavorito() {
  const idx = usuario.favoritos.indexOf(obraAtualId);
  if (idx >= 0) {
    usuario.favoritos.splice(idx, 1);
    mostrarToast('Obra removida dos seus favoritos.', 'info');
  } else {
    usuario.favoritos.push(obraAtualId);
    mostrarToast('Obra adicionada aos favoritos!', 'sucesso');
  }

  localStorage.setItem('solitude_favoritos', JSON.stringify(usuario.favoritos));
  atualizarBotaoFavorito();

  if (_supabase && usuario.logado) {
    try {
      const { data: { user } } = await _supabase.auth.getUser();
      if (user) {
        if (idx >= 0) {
          await _supabase.from('favorites').delete().eq('user_id', user.id).eq('work_id', obraAtualId);
        } else {
          await _supabase.from('favorites').upsert({ user_id: user.id, work_id: obraAtualId });
        }
      }
    } catch (e) {
      console.warn("Erro ao sincronizar favorito na nuvem:", e);
    }
  }

  carregarObras();
  renderizarContinueLendo();
}

function atualizarBotaoFavorito() {
  const btn = document.getElementById('btnFavoritar');
  if (!btn) return;
  const ehFav = usuario.favoritos.includes(obraAtualId);
  btn.innerHTML = ehFav
    ? '<i class="fa-solid fa-heart" style="color:var(--primaria);"></i> Remover dos Favoritos'
    : '<i class="fa-regular fa-heart"></i> Adicionar aos Favoritos';
}

function adicionarHistorico(obra) {
  const idx = usuario.historico.findIndex(h => String(h.id) === String(obra.id));
  if (idx >= 0) usuario.historico.splice(idx, 1);

  usuario.historico.unshift({
    id: obra.id,
    titulo: obra.titulo,
    ultimoCap: capitulosObraAtual[indiceCapituloAtual] ? capitulosObraAtual[indiceCapituloAtual].numero : 'Capítulo 1'
  });

  usuario.historico = usuario.historico.slice(0, 15);
  localStorage.setItem('solitude_historico', JSON.stringify(usuario.historico));
  atualizarPerfilTela();
}

/* ==========================================
   AUTENTICAÇÃO
========================================== */
function fazerLogin() {
  toggleModal('loginModal');
}

function abrirCadastro() {
  toggleModal('loginModal');
  toggleModal('registerModal');
}

async function verificarSessaoSupabase() {
  if (!_supabase) return;
  const { data: { session } } = await _supabase.auth.getSession();
  if (session && session.user) {
    usuario.logado = true;
    usuario.id = session.user.id;
    usuario.email = session.user.email;
    usuario.nome = session.user.email.split('@')[0];
    usuario.isAdmin = session.user.email === EMAIL_ADMIN;
    await carregarPerfilRemoto(session.user.id);
    await verificarVipPorPagamentos(session.user.email);
    verificarVipAtivo();
    atualizarPerfilTela();
    atualizarVisibilidadeAdmin();
  }
}

async function carregarPerfilRemoto(userId) {
  if (!_supabase) return;
  try {
    const { data } = await _supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      usuario.isAdmin = !!data.is_admin || usuario.email === EMAIL_ADMIN;
      usuario.isVip = !!data.is_vip || usuario.isVip;
    }
  } catch (e) {
    usuario.isAdmin = usuario.email === EMAIL_ADMIN;
  }
}

async function verificarVipPorPagamentos(email) {
  if (!_supabase || !email) return;
  try {
    const { data } = await _supabase
      .from('payment_requests')
      .select('id, plano, created_at')
      .eq('email', email)
      .eq('status', 'aprovado')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const pag = data[0];
      const dias = PLANOS_DURACAO[pag.plano] || 30;
      const inicio = new Date(pag.created_at);
      const expiracao = new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000);

      if (new Date() < expiracao) {
        const vipData = {
          ativo: true,
          plano: pag.plano,
          email: email,
          inicio: inicio.toISOString(),
          expiracao: expiracao.toISOString(),
          dias: dias
        };

        let local = null;
        try { local = JSON.parse(localStorage.getItem('solitude_vip_ativo')); } catch (e) { local = null; }
        if (!local || new Date(local.expiracao) < expiracao) {
          localStorage.setItem('solitude_vip_ativo', JSON.stringify(vipData));
        }
      }
    }
  } catch (e) {
    console.warn("Não foi possível verificar VIP:", e);
  }
  verificarVipAtivo();
}

async function executarLoginCustom(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  if (!validarEmail(email)) {
    mostrarToast('Digite um e-mail válido para entrar na sua conta.', 'alerta');
    return;
  }

  if (_supabase) {
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      const msg = /confirmed/i.test(error.message)
        ? 'Sua conta ainda não foi confirmada. Abra o link que enviamos para seu e-mail e tente de novo.'
        : error.message;
      mostrarToast('Falha ao entrar: ' + msg, 'erro');
      return;
    }
    if (data.user) {
      usuario.id = data.user.id;
      await carregarPerfilRemoto(data.user.id);
    }
  }

  usuario.logado = true;
  usuario.email = email;
  usuario.nome = email.split('@')[0];
  usuario.isAdmin = usuario.isAdmin || email === EMAIL_ADMIN;
  await verificarVipPorPagamentos(email);
  verificarVipAtivo();

  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  toggleModal('loginModal');
  mostrarToast(`Bem-vindo de volta, ${usuario.nome}! Boa leitura.`, 'sucesso');
}

async function executarCadastro(e) {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim();
  const senha = document.getElementById('regSenha').value;
  const conf = document.getElementById('regSenhaConf').value;

  if (!validarEmail(email)) {
    mostrarToast('E-mail inválido. Confira o endereço e tente novamente.', 'alerta');
    return;
  }
  if (!validarSenhaForte(senha)) {
    mostrarToast('Senha fraca! Use no mínimo 8 caracteres com letras, números e um símbolo.', 'alerta');
    return;
  }
  if (senha !== conf) {
    mostrarToast('As senhas digitadas não coincidem.', 'alerta');
    return;
  }

  if (_supabase) {
    const { data, error } = await _supabase.auth.signUp({ email, password: senha });
    if (error) {
      mostrarToast('Erro no cadastro: ' + error.message, 'erro');
      return;
    }
    if (data.user && !data.session) {
      toggleModal('registerModal');
      mostrarToast('Conta criada! Enviamos uma confirmação para seu e-mail: abra o link e depois volte para entrar.', 'sucesso', 8000);
      return;
    }
  }

  toggleModal('registerModal');
  mostrarToast('Conta criada com sucesso! Agora é só entrar e aproveitar a leitura.', 'sucesso');
}

function fazerLogout() {
  usuario.logado = false;
  usuario.isAdmin = false;
  usuario.id = null;
  if (_supabase) _supabase.auth.signOut();
  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  mostrarToast('Você saiu da sua conta. Até a próxima leitura!', 'info');
}

function atualizarVisibilidadeAdmin() {
  const btn = document.getElementById('btnAdminNav');
  if (btn) btn.style.display = (usuario.logado && usuario.isAdmin) ? 'flex' : 'none';
}

/* ==========================================
   PERFIL DO USUÁRIO
========================================== */
function atualizarPerfilTela() {
  const loggedOutView = document.getElementById('loggedOutView');
  const loggedInView = document.getElementById('loggedInView');

  if (loggedOutView) loggedOutView.style.display = usuario.logado ? 'none' : 'block';
  if (loggedInView) loggedInView.style.display = usuario.logado ? 'block' : 'none';

  if (usuario.logado) {
    const nameDisp = document.getElementById('userNameDisplay');
    const avatarImg = document.getElementById('userAvatarImg');

    if (nameDisp) nameDisp.textContent = usuario.nome;
    if (avatarImg) avatarImg.src = usuario.foto;

    atualizarDisplayVip();
    garantirZonaPerigoPerfil();

    const profileHeader = document.querySelector('.profile-header > div:last-child');
    if (profileHeader) {
      let vipInfoBox = document.getElementById('vipInfoBox');

      if (usuario.isVip) {
        const dias = calcularDiasRestantes();
        const vipData = JSON.parse(localStorage.getItem('solitude_vip_ativo') || '{}');
        const expiracao = new Date(vipData.expiracao);

        if (!vipInfoBox) {
          vipInfoBox = document.createElement('div');
          vipInfoBox.id = 'vipInfoBox';
          profileHeader.appendChild(vipInfoBox);
        }

        const dataFormatada = expiracao.toLocaleDateString('pt-BR');
        vipInfoBox.className = `vip-timer-display ${dias <= 7 ? 'expirando' : ''}`;
        vipInfoBox.innerHTML = `
          <i class="fa-solid fa-crown"></i>
          <span>Expira em: <strong>${dataFormatada}</strong> (${dias} dias)</span>
        `;
      } else if (vipInfoBox) {
        vipInfoBox.remove();
      }
    }

    renderizarAbasPerfil();
  }
}

/* ==========================================
   SISTEMA VIP AUTOMÁTICO
========================================== */
function ativarVipAutomatico(plano, email) {
  const dias = PLANOS_DURACAO[plano];
  if (!dias) {
    mostrarToast('Plano inválido. Contate o suporte.', 'erro');
    return false;
  }

  const agora = new Date();
  const vipAtualStr = localStorage.getItem('solitude_vip_ativo');
  let baseData = agora;

  if (vipAtualStr) {
    try {
      const vipAtual = JSON.parse(vipAtualStr);
      const expAtual = new Date(vipAtual.expiracao);
      if (expAtual > agora) baseData = expAtual;
    } catch (e) {
      baseData = agora;
    }
  }

  const expiracao = new Date(baseData.getTime() + dias * 24 * 60 * 60 * 1000);

  const vipData = {
    ativo: true,
    plano: plano,
    email: email,
    inicio: agora.toISOString(),
    expiracao: expiracao.toISOString(),
    dias: dias
  };

  localStorage.setItem('solitude_vip_ativo', JSON.stringify(vipData));

  usuario.isVip = true;
  usuario.planoVip = plano;
  usuario.vipExpiraEm = expiracao;

  if (_supabase && usuario.logado) {
    atualizarVipNoSupabase(email, expiracao, plano);
  }

  return true;
}

async function atualizarVipNoSupabase(email, expiracao, plano) {
  try {
    await _supabase.from('profiles').upsert({
      email: email,
      is_vip: true,
      vip_plan: plano,
      vip_expires_at: expiracao.toISOString()
    });
  } catch (e) {
    console.warn("Erro ao salvar VIP no Supabase:", e);
  }
}

function verificarVipAtivo() {
  const vipDataStr = localStorage.getItem('solitude_vip_ativo');

  if (!vipDataStr) {
    usuario.isVip = false;
    usuario.planoVip = null;
    usuario.vipExpiraEm = null;
    return;
  }

  let vipData;
  try {
    vipData = JSON.parse(vipDataStr);
  } catch (e) {
    localStorage.removeItem('solitude_vip_ativo');
    usuario.isVip = false;
    return;
  }

  const agora = new Date();
  const expiracao = new Date(vipData.expiracao);

  if (agora >= expiracao) {
    localStorage.removeItem('solitude_vip_ativo');
    const eraVip = usuario.isVip;
    usuario.isVip = false;
    usuario.planoVip = null;
    usuario.vipExpiraEm = null;

    if (eraVip) {
      mostrarToast('Seu VIP expirou! Renove para continuar lendo obras exclusivas.', 'alerta', 6000);
    }
    atualizarPerfilTela();
    carregarObras();
    return;
  }

  usuario.isVip = true;
  usuario.planoVip = vipData.plano;
  usuario.vipExpiraEm = expiracao;
}

function calcularDiasRestantes() {
  const vipDataStr = localStorage.getItem('solitude_vip_ativo');
  if (!vipDataStr) return 0;

  try {
    const vipData = JSON.parse(vipDataStr);
    const agora = new Date();
    const expiracao = new Date(vipData.expiracao);
    const diffMs = expiracao - agora;

    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch (e) {
    return 0;
  }
}

function atualizarDisplayVip() {
  const planBadge = document.getElementById('userPlanBadge');
  if (!planBadge) return;

  if (usuario.isAdmin) {
    planBadge.textContent = 'Administrador';
    planBadge.style.background = 'var(--admin)';
    return;
  }

  if (!usuario.isVip) {
    planBadge.textContent = 'Plano Gratuito';
    planBadge.style.background = 'var(--texto-claro)';
    return;
  }

  const dias = calcularDiasRestantes();
  const plano = usuario.planoVip || 'VIP';

  if (dias <= 0) {
    planBadge.textContent = 'VIP Expirado';
    planBadge.style.background = 'var(--erro)';
  } else if (dias <= 7) {
    planBadge.textContent = `${plano} • ${dias} dias restantes`;
    planBadge.style.background = 'linear-gradient(135deg, var(--alerta), #d97706)';
  } else {
    planBadge.textContent = `${plano} • ${dias} dias restantes`;
    planBadge.style.background = 'linear-gradient(135deg, var(--primaria), var(--rosa-escuro))';
  }
}

function mostrarFlashSucessoVIP() {
  const flash = document.createElement('div');
  flash.className = 'vip-success-animation';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1500);
}

/* ==========================================
   EDIÇÃO DE PERFIL
========================================== */
async function salvarPerfil(e) {
  e.preventDefault();

  const fileInput = document.getElementById('editFotoArquivo');
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    mostrarToast('Processando sua foto...', 'info', 2000);
    let urlFinal = null;

    if (_supabase && usuario.logado) {
      try {
        const { data: { user } } = await _supabase.auth.getUser();
        if (user) {
          const path = `${user.id}/avatar_${Date.now()}.jpg`;
          const { error } = await _supabase.storage.from('avatars').upload(path, file, { upsert: true });
          if (!error) {
            urlFinal = _supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
          }
        }
      } catch (err) {
        console.warn("Upload de foto na nuvem falhou, usando modo local:", err);
      }
    }

    if (!urlFinal) {
      try {
        urlFinal = await redimensionarImagem(file);
      } catch (err) {
        urlFinal = null;
      }
    }
    if (urlFinal) usuario.foto = urlFinal;
  }

  usuario.nome = document.getElementById('editNome').value || usuario.nome;
  usuario.email = document.getElementById('editEmail').value || usuario.email;
  usuario.telefone = document.getElementById('editTel').value || usuario.telefone;

  localStorage.setItem('solitude_foto', usuario.foto);
  localStorage.setItem('solitude_nome', usuario.nome);
  localStorage.setItem('solitude_tel', usuario.telefone);

  atualizarPerfilTela();
  toggleModal('configModal');
  mostrarToast('Perfil atualizado com sucesso!', 'sucesso');
}

async function abrirConfigPerfil() {
  document.getElementById('editNome').value = usuario.nome;
  document.getElementById('editEmail').value = usuario.email;
  document.getElementById('editTel').value = usuario.telefone;
  const prev = document.getElementById('editFotoPreview');
  if (prev) prev.src = usuario.foto;

  if (listasPersonalizadas.length === 0) {
    await carregarListasDoUsuario();
  }

  toggleModal('configModal');
}

function previewFotoPerfil(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    mostrarToast('Escolha uma imagem válida da sua galeria.', 'alerta');
    return;
  }
  const prev = document.getElementById('editFotoPreview');
  if (prev) prev.src = URL.createObjectURL(file);
}

function redimensionarImagem(file, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// === FIM DA PARTE 4 ===

/* ==========================================
   PAINEL ADMINISTRATIVO
========================================== */
function aplicarOverridesLocais() {
  const removidas = JSON.parse(localStorage.getItem('solitude_obras_removidas') || '[]');
  const vipLocal = JSON.parse(localStorage.getItem('solitude_vip_local') || '{}');
  listaObras = listaObras.filter(o => !removidas.includes(String(o.id)));
  listaObras.forEach(o => {
    if (vipLocal[String(o.id)] !== undefined) o.isVip = vipLocal[String(o.id)];
  });
}

async function abrirPainelAdmin() {
  if (!usuario.logado || !usuario.isAdmin) {
    mostrarToast('Área restrita! Somente a administração da SolitudeScan acessa este painel.', 'erro');
    return;
  }
  injetarCampoPaginasAdmin();
  carregarGenerosNoForm();
  carregarDashboardAdmin();
  carregarSolicitacoesPagamento();
  carregarGerenciamentoObras();
  carregarModeracaoComentarios();
  carregarBannersAdmin();
  carregarGerenciamentoCapitulos();
  carregarGerenciamentoPessoas();
  toggleModal('adminModal');
}

async function carregarGerenciamentoObras() {
  const container = document.getElementById('adminObrasContainer');
  if (!container) return;

  let obras = [];
  if (_supabase) {
    try {
      const { data } = await _supabase.from('works')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      obras = (data || []).map(w => ({ id: w.id, titulo: w.title, isVip: w.is_vip, destaque: w.is_featured }));
    } catch (e) {
      console.warn(e);
    }
  }
  if (obras.length === 0) obras = listaObras.map(o => ({ id: o.id, titulo: o.titulo, isVip: o.isVip, destaque: false }));

  container.innerHTML = obras.map(obra => `
    <div class="pay-item">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:0.75rem; font-weight:700;">${escaparHtml(obra.titulo)}</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-aprovar" onclick="abrirEdicaoObra('${obra.id}')">Editar</button>
          <button class="btn-aprovar" onclick="alternarDestaqueObra('${obra.id}')">${obra.destaque ? 'Destacada' : 'Destacar'}</button>
          <button class="btn-aprovar" onclick="alternarVipObra('${obra.id}')">${obra.isVip ? 'Remover VIP' : 'Tornar VIP'}</button>
          <button class="btn-recusar" onclick="pedirExclusaoObra('${obra.id}')">Excluir</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function alternarDestaqueObra(id) {
  if (!usuario.isAdmin || !ehUuid(id)) return;
  const { data } = await _supabase.from('works').select('is_featured').eq('id', id).single();
  if (!data) return;
  await _supabase.from('works').update({ is_featured: !data.is_featured }).eq('id', id);
  heroObras = [];
  mostrarToast(!data.is_featured ? 'Obra destacada no hero!' : 'Destaque removido.', 'sucesso');
  carregarGerenciamentoObras();
  carregarHeroBanner();
}

function pedirExclusaoObra(id) {
  const obra = listaObras.find(o => String(o.id) === String(id));
  const titulo = obra ? obra.titulo : 'esta obra';
  abrirConfirmacao(
    'Excluir obra',
    `Tem certeza que deseja excluir "${titulo}"? Os capítulos também serão removidos e essa ação não pode ser desfeita.`,
    () => excluirObra(id)
  );
}

async function excluirObra(id) {
  if (!usuario.isAdmin) {
    mostrarToast('Sem permissão para excluir obras.', 'erro');
    return;
  }

  if (ehUuid(id)) {
    if (_supabase) {
      try {
        await _supabase.from('chapters').delete().eq('work_id', id);
        const { error } = await _supabase.from('works').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        mostrarToast('Erro ao excluir no banco: ' + e.message, 'erro');
        return;
      }
    }
  } else {
    const removidas = JSON.parse(localStorage.getItem('solitude_obras_removidas') || '[]');
    if (!removidas.includes(String(id))) removidas.push(String(id));
    localStorage.setItem('solitude_obras_removidas', JSON.stringify(removidas));
  }

  listaObras = listaObras.filter(o => String(o.id) !== String(id));
  carregarObras();
  renderizarTendencias();
  renderizarRanking();
  carregarGerenciamentoObras();
  carregarNotificacoes();
  mostrarToast('Obra excluída do catálogo com sucesso.', 'sucesso');
}

async function alternarVipObra(id) {
  if (!usuario.isAdmin) {
    mostrarToast('Sem permissão para alterar obras.', 'erro');
    return;
  }

  const obra = listaObras.find(o => String(o.id) === String(id));
  const novoStatus = obra ? !obra.isVip : true;

  if (ehUuid(id)) {
    if (_supabase) {
      try {
        const { error } = await _supabase.from('works').update({ is_vip: novoStatus }).eq('id', id);
        if (error) throw error;
      } catch (e) {
        mostrarToast('Erro ao atualizar a obra: ' + e.message, 'erro');
        return;
      }
    }
  } else {
    const vipLocal = JSON.parse(localStorage.getItem('solitude_vip_local') || '{}');
    vipLocal[String(id)] = novoStatus;
    localStorage.setItem('solitude_vip_local', JSON.stringify(vipLocal));
  }

  if (obra) obra.isVip = novoStatus;
  carregarObras();
  renderizarTendencias();
  renderizarRanking();
  carregarGerenciamentoObras();
  mostrarToast(novoStatus ? 'Obra marcada como VIP: só assinantes leem.' : 'Obra liberada como grátis para todos!', 'sucesso');
}

function restaurarCatalogoPadrao() {
  if (!usuario.isAdmin) {
    mostrarToast('Sem permissão para restaurar o catálogo.', 'erro');
    return;
  }

  abrirConfirmacao(
    'Restaurar catálogo padrão',
    'As obras padrão da SolitudeScan voltarão a aparecer no site. Deseja continuar?',
    () => {
      localStorage.removeItem('solitude_obras_removidas');
      localStorage.removeItem('solitude_vip_local');
      listaObras = JSON.parse(JSON.stringify(CATALOGO_PADRAO));
      carregarObras();
      renderizarTendencias();
      renderizarRanking();
      renderizarContinueLendo();
      carregarGerenciamentoObras();
      carregarNotificacoes();
      mostrarToast('Catálogo padrão restaurado com sucesso!', 'sucesso');
    }
  );
}

/* ==========================================
   SOLICITAÇÕES DE PAGAMENTO (VIP)
========================================== */
async function carregarSolicitacoesPagamento() {
  const container = document.getElementById('adminPagamentosContainer');
  if (!container) return;

  if (!_supabase) {
    container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Sem conexão com o banco.</p>';
    return;
  }

  try {
    const { data } = await _supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Nenhuma solicitação de pagamento.</p>';
      return;
    }

    container.innerHTML = data.map(p => `
      <div class="pay-item">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <strong style="font-size:0.75rem;">${escaparHtml(p.nome)}</strong>
            <p style="font-size:0.65rem; color:var(--texto-claro); margin:2px 0 0;">${escaparHtml(p.email)}</p>
            <p style="font-size:0.65rem; margin:2px 0 0;">${escaparHtml(p.plano)} — ${escaparHtml(p.valor)}</p>
          </div>
          <span style="font-size:0.65rem; font-weight:800; color:${p.status === 'aprovado' ? 'var(--sucesso)' : (p.status === 'recusado' ? 'var(--erro)' : 'var(--alerta)')};">${escaparHtml(p.status)}</span>
        </div>
        ${p.status === 'pendente' ? `
          <div class="pay-item-actions" style="display:flex; gap:6px; margin-top:6px;">
            <button class="btn-aprovar" onclick="aprovarPagamento('${p.id}')">Aprovar</button>
            <button class="btn-recusar" onclick="recusarPagamento('${p.id}')">Recusar</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (e) {
    console.warn(e);
    container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Erro ao carregar solicitações.</p>';
  }
}

async function aprovarPagamento(id) {
  if (!usuario.isAdmin || !_supabase) return;
  try {
    const { error } = await _supabase.from('payment_requests').update({ status: 'aprovado' }).eq('id', id);
    if (error) throw error;
    mostrarToast('Pagamento aprovado! O VIP será ativado e o cliente avisado por e-mail.', 'sucesso');
    carregarSolicitacoesPagamento();
    carregarDashboardAdmin();
  } catch (e) {
    mostrarToast('Erro ao aprovar: ' + e.message, 'erro');
  }
}

async function recusarPagamento(id) {
  if (!usuario.isAdmin || !_supabase) return;
  try {
    const { error } = await _supabase.from('payment_requests').update({ status: 'recusado' }).eq('id', id);
    if (error) throw error;
    mostrarToast('Pagamento recusado.', 'info');
    carregarSolicitacoesPagamento();
    carregarDashboardAdmin();
  } catch (e) {
    mostrarToast('Erro ao recusar: ' + e.message, 'erro');
  }
}

/* ==========================================
   CADASTRO DE OBRAS (ADMIN)
========================================== */
async function adicionarObra(e) {
  e.preventDefault();
  if (!usuario.isAdmin) { mostrarToast('Sem permissão para cadastrar obras.', 'erro'); return; }

  const tituloObra = document.getElementById('admTitulo').value.trim();
  if (!tituloObra) { mostrarToast('Digite o título da obra.', 'alerta'); return; }

  const generoObra = document.getElementById('admGenero').value;
  const capInicial = document.getElementById('admCapitulo').value;
  const isVipObra = document.getElementById('admVip').value === 'true';
  const elSinopse = document.getElementById('admSinopse');
  const sinopseObra = (elSinopse && elSinopse.value.trim()) || 'Obra cadastrada pelo painel administrativo da SolitudeScan.';

  mostrarToast('Enviando capa e páginas... aguarde.', 'info', 4000);

  let capaUrl = (document.getElementById('admCapa').value || '').trim();
  const inputCapaFile = document.getElementById('admCapaArquivo');
  if (inputCapaFile && inputCapaFile.files.length > 0) {
    const urlEnviada = await uploadCapaSupabase(inputCapaFile);
    if (urlEnviada) capaUrl = urlEnviada;
  }

  const inputPaginas = document.getElementById('admPaginasArquivo');
  const paginas = await uploadPaginasSupabase(inputPaginas ? inputPaginas.files : []);

  const slug = tituloObra.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (!_supabase) { mostrarToast('Sem conexão com o banco de dados.', 'erro'); return; }

  try {
    const { data: novaObra, error: errObra } = await _supabase.from('works').insert([{
      title: tituloObra,
      slug: slug,
      type: 'manhwa',
      status: 'ongoing',
      synopsis: sinopseObra,
      cover_url: capaUrl || 'https://via.placeholder.com/300x450',
      is_vip: isVipObra,
      is_published: true,
      published_at: new Date().toISOString()
    }]).select().single();

    if (errObra) throw errObra;

    const { data: g } = await _supabase.from('genres').select('id').eq('name', generoObra).limit(1);
    if (g && g.length > 0) {
      await _supabase.from('work_genres').upsert({ work_id: novaObra.id, genre_id: g[0].id });
    }

    const numCap = parseFloat((capInicial || '').replace(/[^0-9.]/g, '')) || 1;
    await _supabase.from('chapters').insert([{
      work_id: novaObra.id,
      chapter_number: numCap,
      title: capInicial || ('Capítulo ' + numCap),
      pages: paginas.length > 0 ? paginas : ['https://via.placeholder.com/800x1200'],
      pages_count: Math.max(paginas.length, 1),
      is_published: true,
      release_at: new Date().toISOString()
    }]);

    mostrarToast(`"${tituloObra}" publicada com sucesso!`, 'sucesso');
  } catch (err) {
    mostrarToast('Erro ao salvar no banco: ' + err.message, 'erro');
    return;
  }

  carregarObras();
  renderizarTendencias();
  renderizarRanking();
  carregarNotificacoes();
  carregarGerenciamentoObras();
  toggleModal('adminModal');
}

async function uploadCapaSupabase(fileInput) {
  if (!_supabase || !fileInput || !fileInput.files.length) return null;

  const file = fileInput.files[0];
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `capas/${fileName}`;

  const { data, error } = await _supabase.storage
    .from('covers')
    .upload(filePath, file);

  if (error) {
    mostrarToast("Erro ao enviar imagem da capa: " + error.message, 'erro');
    return null;
  }

  const { data: publicUrlData } = _supabase.storage
    .from('covers')
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}

async function uploadPaginasSupabase(fileList) {
  if (!_supabase || !fileList || fileList.length === 0) return [];
  const urls = [];
  for (const file of Array.from(fileList)) {
    if (!file.type.startsWith('image/')) continue;
    const ext = file.name.split('.').pop();
    const path = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await _supabase.storage.from('chapters').upload(path, file, { contentType: file.type });
    if (!error) {
      urls.push(_supabase.storage.from('chapters').getPublicUrl(path).data.publicUrl);
    }
  }
  return urls;
}

function injetarCampoPaginasAdmin() {
  if (document.getElementById('admPaginasArquivo')) return;
  const capInput = document.getElementById('admCapaArquivo');
  if (!capInput) return;
  const wrap = capInput.closest('.form-group') || capInput.parentNode;
  const div = document.createElement('div');
  div.className = 'form-group';
  div.innerHTML = '<label>Páginas do capítulo (pode selecionar várias)</label><input type="file" id="admPaginasArquivo" accept="image/*" multiple>';
  wrap.parentNode.insertBefore(div, wrap.nextSibling);
}

async function carregarGenerosNoForm() {
  const sel = document.getElementById('admGenero');
  if (!_supabase || !sel) return;
  try {
    const { data } = await _supabase.from('genres').select('name').eq('is_active', true).order('sort_order');
    if (data && data.length > 0) {
      sel.innerHTML = data.map(g => `<option value="${escaparHtml(g.name)}">${escaparHtml(g.name)}</option>`).join('');
    }
  } catch (e) { console.warn(e); }
}

async function carregarDashboardAdmin() {
  const anchor = document.getElementById('adminPagamentosContainer');
  if (!_supabase || !anchor) return;

  let sec = document.getElementById('adminDashboardSection');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'adminDashboardSection';
    sec.style.marginBottom = '14px';
    anchor.parentNode.insertBefore(sec, anchor);
  }
  sec.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Carregando estatísticas...</p>';

  try {
    const { data: obrasD, count: totalObras } = await _supabase.from('works').select('views_count', { count: 'exact' });
    const { count: totalCaps } = await _supabase.from('chapters').select('id', { count: 'exact', head: true });
    const { count: totalUsers } = await _supabase.from('profiles').select('id', { count: 'exact', head: true });
    const { data: paysPend } = await _supabase.from('payment_requests').select('id').eq('status', 'pendente');

    const totalViews = (obrasD || []).reduce((s, o) => s + (o.views_count || 0), 0);
    const cards = [
      ['fa-eye', formatarNumero(totalViews), 'Views'],
      ['fa-book', totalObras || 0, 'Obras'],
      ['fa-layer-group', totalCaps || 0, 'Capítulos'],
      ['fa-users', totalUsers || 0, 'Leitores'],
      ['fa-hourglass-half', (paysPend || []).length, 'Pix pendentes']
    ];

    sec.innerHTML = '<h4 style="font-size:0.9rem; color:var(--rosa-claro); margin-bottom:8px;"><i class="fa-solid fa-chart-line"></i> Dashboard</h4>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(85px, 1fr)); gap:8px;">' +
      cards.map(c => `
        <div style="background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:10px; text-align:center;">
          <i class="fa-solid ${c[0]}" style="color:var(--primaria); font-size:1rem;"></i>
          <p style="font-weight:800; font-size:1rem; margin:4px 0 0;">${c[1]}</p>
          <p style="font-size:0.6rem; color:var(--texto-claro); margin:0;">${c[2]}</p>
        </div>`).join('') +
      '</div>';
  } catch (e) {
    sec.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Estatísticas indisponíveis.</p>';
  }
}

// === FIM DA PARTE 5 ===

/* ==========================================
   MODAIS VIP E PAGAMENTO PIX
========================================== */
function abrirModalVip() {
  toggleModal('vipModal');
}

function abrirModalPix(plano, valor) {
  planoPixAtual = { plano, valor };
  pixExpirado = false;
  solicitacaoPixAtual = null;
  pararTimerPix();

  document.getElementById('pixDetalhePlano').textContent = `${plano} — ${valor}`;
  document.getElementById('pixPassoDados').style.display = 'block';
  document.getElementById('pixPassoPagamento').style.display = 'none';
  document.getElementById('pixMsgExpirado').style.display = 'none';

  const btnConf = document.getElementById('btnConfirmarPix');
  if (btnConf) btnConf.disabled = false;

  const timerEl = document.getElementById('pixTimer');
  if (timerEl) {
    timerEl.textContent = '04:30';
    timerEl.classList.remove('timer-perigo', 'timer-expirado');
  }

  const emailInput = document.getElementById('pixEmail');
  if (emailInput && usuario.email) emailInput.value = usuario.email;

  const nomeInput = document.getElementById('pixNome');
  if (nomeInput && usuario.logado && !usuario.nome.includes('@')) nomeInput.value = usuario.nome;

  toggleModal('vipModal');
  toggleModal('pixModal');
}

function fecharPixModal() {
  pararTimerPix();
  toggleModal('pixModal');
}

async function gerarCobrancaPix(e) {
  e.preventDefault();
  const nome = document.getElementById('pixNome').value.trim();
  const email = document.getElementById('pixEmail').value.trim();

  if (nome.length < 2) {
    mostrarToast('Informe seu nome para a conferência do pagamento.', 'alerta');
    return;
  }
  if (!validarEmail(email)) {
    mostrarToast('Informe um e-mail válido: o VIP será ativado exatamente neste endereço.', 'alerta');
    return;
  }

  const expiraEm = new Date(Date.now() + TEMPO_PIX_SEGUNDOS * 1000).toISOString();
  let idSolicitacao = 'local_' + Date.now();

  if (_supabase) {
    try {
      const { data, error } = await _supabase.from('payment_requests').insert([{
        nome,
        email,
        plano: planoPixAtual.plano,
        valor: planoPixAtual.valor,
        metodo: 'pix',
        status: 'pendente',
        expires_at: expiraEm
      }]).select().single();
      if (!error && data) idSolicitacao = data.id;
    } catch (err) {
      console.warn("Erro ao registrar solicitação:", err);
    }
  }

  solicitacaoPixAtual = { id: idSolicitacao, nome, email, expiraEm };
  document.getElementById('pixPassoDados').style.display = 'none';
  document.getElementById('pixPassoPagamento').style.display = 'block';
  iniciarTimerPix();
  mostrarToast('Cobrança gerada! Você tem 4 minutos e 30 segundos para concluir o Pix.', 'info', 5000);
}

function iniciarTimerPix() {
  const el = document.getElementById('pixTimer');
  pararTimerPix();

  timerPixInterval = setInterval(() => {
    if (!solicitacaoPixAtual) {
      pararTimerPix();
      return;
    }

    const restante = Math.floor((new Date(solicitacaoPixAtual.expiraEm) - Date.now()) / 1000);

    if (restante <= 0) {
      pararTimerPix();
      pixExpirado = true;
      if (el) {
        el.textContent = '00:00';
        el.classList.add('timer-expirado');
      }
      const btn = document.getElementById('btnConfirmarPix');
      if (btn) btn.disabled = true;
      document.getElementById('pixMsgExpirado').style.display = 'block';
      mostrarToast('Tempo esgotado! O pagamento não foi confirmado e a solicitação foi cancelada.', 'erro', 6000);
      return;
    }

    const m = String(Math.floor(restante / 60)).padStart(2, '0');
    const s = String(restante % 60).padStart(2, '0');
    if (el) el.textContent = `${m}:${s}`;
    if (restante <= 60 && el) el.classList.add('timer-perigo');
  }, 1000);
}

function pararTimerPix() {
  if (timerPixInterval) {
    clearInterval(timerPixInterval);
    timerPixInterval = null;
  }
}

function copiarChavePix() {
  navigator.clipboard.writeText(CHAVE_PIX).catch(() => {
    mostrarToast('Não foi possível copiar automaticamente. Chave: ' + CHAVE_PIX, 'info');
  });
  mostrarToast('Chave Pix copiada! Cole no aplicativo do seu banco para pagar.', 'sucesso');
}

function concluirPagamentoPix() {
  if (pixExpirado) {
    mostrarToast('Esta cobrança expirou. Feche e gere uma nova solicitação de pagamento.', 'erro');
    return;
  }

  pararTimerPix();
  toggleModal('pixModal');
  mostrarToast('Pagamento informado! A administração vai conferir o Pix no banco e o VIP será ativado automaticamente no seu e-mail assim que a conferência for concluída.', 'sucesso', 8000);
}

/* ==========================================
   NOTIFICAÇÕES
========================================== */
async function carregarNotificacoes() {
  let notifs = [];

  if (_supabase) {
    try {
      const { data } = await _supabase
        .from('chapters')
        .select('id, work_id, chapter_number, created_at, works(title)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        notifs = data.map(c => ({
          id: String(c.id),
          obraId: c.work_id,
          titulo: (c.works && c.works.title) || 'Obra',
          texto: `Capítulo ${c.chapter_number} já disponível!`
        }));
      }
    } catch (e) {
      console.warn("Erro ao buscar notificações:", e);
    }
  }

  if (notifs.length === 0) {
    listaObras.forEach(o => (o.capitulos || []).forEach(c => {
      notifs.push({
        id: String(c.id),
        obraId: o.id,
        titulo: o.titulo,
        texto: `${c.numero} já disponível!`
      });
    }));
    notifs = notifs.slice(0, 10);
  }

  listaNotificacoes = notifs;

  const lidas = JSON.parse(localStorage.getItem('solitude_notif_lidas') || '[]');
  const naoLidas = notifs.filter(n => !lidas.includes(n.id)).length;
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.style.display = naoLidas > 0 ? 'flex' : 'none';
    badge.textContent = naoLidas > 9 ? '9+' : String(naoLidas);
  }
}

function abrirNotificacoes() {
  const container = document.getElementById('notifListContainer');
  if (!container) return;

  if (listaNotificacoes.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:var(--texto-claro); text-align:center; padding:20px;">Nenhuma notificação por aqui ainda.</p>';
  } else {
    container.innerHTML = listaNotificacoes.map(n => `
      <div class="notif-item" onclick="abrirObraDaNotificacao('${n.obraId}')">
        <div class="notif-icon"><i class="fa-solid fa-book-open"></i></div>
        <div>
          <p style="font-size:0.8rem; font-weight:700;">${escaparHtml(n.titulo)}</p>
          <p style="font-size:0.7rem; color:var(--texto-claro);">${escaparHtml(n.texto)}</p>
        </div>
      </div>
    `).join('');
  }

  localStorage.setItem('solitude_notif_lidas', JSON.stringify(listaNotificacoes.map(n => n.id)));
  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'none';

  toggleModal('notifModal');
}

function abrirObraDaNotificacao(obraId) {
  toggleModal('notifModal');
  if (obraId && obraId !== 'undefined') abrirDetalhesObra(obraId);
}

/* ==========================================
   BANNERS DO HERO (ADMIN)
========================================== */
async function carregarBannersAdmin() {
  const anchor = document.getElementById('adminObrasContainer');
  if (!_supabase || !anchor) return;

  let sec = document.getElementById('adminBannersSection');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'adminBannersSection';
    sec.style.marginTop = '14px';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  }

  sec.innerHTML = `
    <h4 style="font-size:0.9rem; color:var(--rosa-claro); margin-bottom:8px;"><i class="fa-solid fa-panorama"></i> Banners do Hero</h4>
    <div class="form-group"><label>Imagem do banner</label><input type="file" id="admBannerArquivo" accept="image/*"></div>
    <div class="form-group"><label>Título exibido</label><input type="text" id="admBannerTitulo" placeholder="Ex: Estreia da semana!"></div>
    <button class="btn-aprovar" style="width:100%;" onclick="adicionarBanner()">Adicionar Banner</button>
    <div id="listaBannersAdmin" style="margin-top:8px;"></div>`;

  const { data } = await _supabase.from('banners').select('*').order('position');
  const lista = document.getElementById('listaBannersAdmin');
  if (!data || data.length === 0) {
    lista.innerHTML = '<p style="font-size:0.7rem; color:var(--texto-claro);">Nenhum banner — o hero usa obras em destaque.</p>';
    return;
  }
  lista.innerHTML = data.map(b => `
    <div class="pay-item">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span style="font-size:0.75rem;">${escaparHtml(b.title)}</span>
        <button class="btn-recusar" onclick="excluirBanner('${b.id}')">Remover</button>
      </div>
    </div>`).join('');
}

async function adicionarBanner() {
  if (!usuario.isAdmin) return;
  const fileInput = document.getElementById('admBannerArquivo');
  if (!fileInput || fileInput.files.length === 0) { mostrarToast('Escolha uma imagem para o banner.', 'alerta'); return; }

  const file = fileInput.files[0];
  const ext = file.name.split('.').pop();
  const path = `banner_${Date.now()}.${ext}`;
  const { error } = await _supabase.storage.from('banners').upload(path, file, { contentType: file.type });
  if (error) { mostrarToast('Erro no upload: ' + error.message, 'erro'); return; }
  const url = _supabase.storage.from('banners').getPublicUrl(path).data.publicUrl;

  const titulo = (document.getElementById('admBannerTitulo').value || '').trim() || 'Destaque SolitudeScan';
  const { error: errIns } = await _supabase.from('banners').insert([{ title: titulo, image_url: url, is_active: true, position: Date.now() % 100000 }]);
  if (errIns) { mostrarToast('Erro: ' + errIns.message, 'erro'); return; }

  heroObras = [];
  mostrarToast('Banner adicionado ao hero!', 'sucesso');
  carregarBannersAdmin();
  carregarHeroBanner();
}

async function excluirBanner(id) {
  if (!usuario.isAdmin) return;
  await _supabase.from('banners').delete().eq('id', id);
  heroObras = [];
  mostrarToast('Banner removido.', 'info');
  carregarBannersAdmin();
  carregarHeroBanner();
}

/* ==========================================
   MODERAÇÃO DE COMENTÁRIOS (ADMIN)
========================================== */
async function carregarModeracaoComentarios() {
  const anchor = document.getElementById('adminBannersSection');
  if (!_supabase || !anchor) return;

  let sec = document.getElementById('adminModeracaoSection');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'adminModeracaoSection';
    sec.style.marginTop = '14px';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  }

  const { data } = await _supabase
    .from('comments')
    .select('*, profiles(username, display_name)')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(20);

  sec.innerHTML = '<h4 style="font-size:0.9rem; color:var(--rosa-claro); margin-bottom:8px;"><i class="fa-solid fa-shield-halved"></i> Moderação de Comentários</h4>';

  if (!data || data.length === 0) {
    sec.innerHTML += '<p style="font-size:0.7rem; color:var(--texto-claro);">Nenhum comentário para moderar.</p>';
    return;
  }

  sec.innerHTML += data.map(c => `
    <div class="pay-item">
      <p style="font-size:0.7rem; margin:0 0 4px;"><b>${escaparHtml((c.profiles && (c.profiles.display_name || c.profiles.username)) || 'Anônimo')}</b>: ${escaparHtml(c.content)}</p>
      <div style="display:flex; gap:6px;">
        <button class="btn-aprovar" onclick="ocultarComentario('${c.id}')">Ocultar</button>
        <button class="btn-recusar" onclick="excluirComentario('${c.id}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

async function ocultarComentario(id) {
  if (!usuario.isAdmin) return;
  await _supabase.from('comments').update({ is_hidden: true }).eq('id', id);
  mostrarToast('Comentário ocultado.', 'info');
  carregarModeracaoComentarios();
}

async function excluirComentario(id) {
  if (!usuario.isAdmin) return;
  await _supabase.from('comments').delete().eq('id', id);
  mostrarToast('Comentário excluído.', 'info');
  carregarModeracaoComentarios();
}

// === FIM DA PARTE 6 ===

/* ==========================================
   COMENTÁRIOS (ÁRVORE COM RESPOSTAS)
========================================== */
let comentariosCache = {};
let responderAComentarioId = null;

async function carregarComentariosObra(obraId) {
  const container = document.getElementById('listaComentarios');
  if (!container) return;
  comentariosCache = {};
  responderAComentarioId = null;

  if (_supabase) {
    try {
      const { data } = await _supabase
        .from('comments')
        .select('*')
        .eq('work_id', obraId)
        .eq('is_hidden', false)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        data.forEach(c => { comentariosCache[c.id] = Object.assign({}, c, { respostas: [] }); });

        const raizes = [];
        data.forEach(c => {
          const nodo = comentariosCache[c.id];
          if (c.parent_id && comentariosCache[c.parent_id]) {
            comentariosCache[c.parent_id].respostas.push(nodo);
          } else {
            raizes.push(nodo);
          }
        });
        raizes.reverse();

        container.innerHTML = raizes.map(c => renderizarComentario(c, 0)).join('');
        carregarCurtidasComentarios();
        return;
      }
    } catch (e) {
      console.warn("Erro ao buscar comentários:", e);
    }
  }

  container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Seja o primeiro a comentar!</p>';
}

function renderizarComentario(c, nivel) {
  const margem = nivel > 0 ? 'margin-left:26px;' : '';
  const respostas = (c.respostas || []).map(r => renderizarComentario(r, nivel + 1)).join('');
  const dataStr = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '';

  return `
    <div style="${margem}">
      <div style="padding:8px 10px; background:var(--fundo-card); border-radius:6px; font-size:0.75rem; border:1px solid var(--borda); margin-top:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--primaria);">${escaparHtml(c.user_name || 'Leitor')}</strong>
          <span style="font-size:0.6rem; color:var(--texto-claro);">${dataStr}</span>
        </div>
        <p style="margin:4px 0;">${escaparHtml(c.content)}</p>
        <div style="display:flex; gap:12px; align-items:center;">
          <button id="like-com-${c.id}" onclick="curtirComentario('${c.id}')" style="background:none; border:none; color:var(--texto-claro); font-size:0.65rem; cursor:pointer; padding:0;">
            <i class="fa-regular fa-heart"></i> <span>0</span>
          </button>
          <button onclick="responderComentario('${c.id}')" style="background:none; border:none; color:var(--texto-claro); font-size:0.65rem; cursor:pointer; padding:0;">
            <i class="fa-solid fa-reply"></i> Responder
          </button>
          <button onclick="abrirDenuncia('comment', '${c.id}')" style="background:none; border:none; color:var(--texto-claro); font-size:0.65rem; cursor:pointer; padding:0;">
            <i class="fa-solid fa-flag"></i> Denunciar
          </button>
        </div>
      </div>
      ${respostas}
    </div>
  `;
}

function responderComentario(comentarioId) {
  const alvo = comentariosCache[comentarioId];
  if (!alvo) return;
  responderAComentarioId = comentarioId;

  let hint = document.getElementById('hintRespondendo');
  if (!hint) {
    const input = document.getElementById('inputComentario');
    if (!input) return;
    hint = document.createElement('div');
    hint.id = 'hintRespondendo';
    hint.style.cssText = 'font-size:0.65rem; color:var(--primaria); margin-top:4px; display:flex; align-items:center; gap:6px;';
    input.parentNode.insertBefore(hint, input.nextSibling);
  }
  hint.innerHTML = `Respondendo a <b>${escaparHtml(alvo.user_name || 'Leitor')}</b> <button onclick="cancelarResposta()" style="background:none; border:none; color:var(--texto-claro); cursor:pointer; font-size:0.65rem;">cancelar</button>`;

  const input = document.getElementById('inputComentario');
  if (input) input.focus();
}

function cancelarResposta() {
  responderAComentarioId = null;
  const hint = document.getElementById('hintRespondendo');
  if (hint) hint.remove();
}

async function adicionarComentario(e) {
  e.preventDefault();
  const input = document.getElementById('inputComentario');
  if (!input || !input.value.trim()) return;

  const agora = Date.now();
  if (agora - ultimoComentarioEm < 10000) {
    mostrarToast('Calma! Aguarde 10 segundos entre um comentário e outro.', 'alerta');
    return;
  }
  ultimoComentarioEm = agora;

  const texto = input.value.trim();

  if (texto.length > 2000) {
    mostrarToast('Comentário muito longo. Máximo de 2000 caracteres.', 'alerta');
    return;
  }

  const marcas = JSON.parse(localStorage.getItem('solitude_comentario_marcas') || '[]')
    .filter(t => agora - t < 60000);
  if (marcas.length >= 5) {
    mostrarToast('Limite de 5 comentários por minuto atingido. Aguarde um pouco.', 'alerta');
    return;
  }
  marcas.push(agora);
  localStorage.setItem('solitude_comentario_marcas', JSON.stringify(marcas));

  const parentId = responderAComentarioId;

  if (_supabase && usuario.logado) {
    try {
      await _supabase.from('comments').insert([{
        work_id: obraAtualId,
        user_name: usuario.nome,
        content: texto,
        parent_id: parentId
      }]);
    } catch (err) {
      console.warn("Erro ao salvar comentário na nuvem:", err);
    }
  }

  input.value = '';
  cancelarResposta();
  carregarComentariosObra(obraAtualId);
  mostrarToast(parentId ? 'Resposta publicada!' : 'Comentário publicado!', 'sucesso', 2500);
}

/* ==========================================
   CURTIDAS (FASE 7)
========================================== */
async function carregarCurtidasComentarios() {
  const ids = Object.keys(comentariosCache);
  if (ids.length === 0 || !_supabase) return;

  try {
    const { data } = await _supabase
      .from('likes')
      .select('target_id, user_id')
      .eq('target_type', 'comment')
      .in('target_id', ids);

    const contagem = {};
    (data || []).forEach(l => {
      contagem[l.target_id] = (contagem[l.target_id] || 0) + 1;
      if (usuario.id && l.user_id === usuario.id) {
        const btn = document.getElementById('like-com-' + l.target_id);
        if (btn) {
          btn.style.color = 'var(--primaria)';
          btn.querySelector('i').className = 'fa-solid fa-heart';
        }
      }
    });

    ids.forEach(id => {
      const btn = document.getElementById('like-com-' + id);
      if (btn) btn.querySelector('span').textContent = String(contagem[id] || 0);
    });
  } catch (e) {
    console.warn(e);
  }
}

async function curtirComentario(comentarioId) {
  if (!usuario.logado || !_supabase) {
    mostrarToast('Entre na sua conta para curtir.', 'alerta');
    return;
  }
  try {
    await _supabase.rpc('toggle_like', { p_target_type: 'comment', p_target_id: comentarioId });
    carregarComentariosObra(obraAtualId);
  } catch (e) {
    mostrarToast('Erro ao curtir: ' + e.message, 'erro');
  }
}

function garantirBotaoCurtirObra() {
  let btn = document.getElementById('btnCurtirObra');
  if (!btn) {
    const btnFav = document.getElementById('btnFavoritar');
    if (!btnFav) return null;
    btn = document.createElement('button');
    btn.id = 'btnCurtirObra';
    btn.style.cssText = 'margin-top:8px; background:var(--fundo-card); border:1px solid var(--borda); color:var(--texto); padding:8px 12px; border-radius:6px; font-size:0.75rem; cursor:pointer;';
    btnFav.parentNode.insertBefore(btn, btnFav.nextSibling);
  }
  return btn;
}

async function renderizarCurtirObra(obra) {
  const btn = garantirBotaoCurtirObra();
  if (!btn) return;

  let count = 0;
  let eu = false;

  if (_supabase && ehUuid(obra.id)) {
    try {
      const { data } = await _supabase.from('likes').select('user_id').eq('target_type', 'work').eq('target_id', obra.id);
      count = (data || []).length;
      eu = (data || []).some(l => l.user_id === usuario.id);
    } catch (e) {
      console.warn(e);
    }
  }

  btn.innerHTML = `<i class="fa-${eu ? 'solid' : 'regular'} fa-thumbs-up" style="color:${eu ? 'var(--primaria)' : 'inherit'}"></i> Curtir · ${count}`;
  btn.onclick = async () => {
    if (!usuario.logado || !_supabase) {
      mostrarToast('Entre na sua conta para curtir.', 'alerta');
      return;
    }
    await _supabase.rpc('toggle_like', { p_target_type: 'work', p_target_id: obra.id });
    renderizarCurtirObra(obra);
  };
}

/* ==========================================
   DENÚNCIAS (FASE 7)
========================================== */
let denunciaAlvoAtual = null;

const MOTIVOS_DENUNCIA = [
  { valor: 'spam', rotulo: 'Spam ou propaganda' },
  { valor: 'offensive', rotulo: 'Conteúdo ofensivo' },
  { valor: 'spoiler', rotulo: 'Spoiler sem aviso' },
  { valor: 'copyright', rotulo: 'Violação de direitos autorais' },
  { valor: 'other', rotulo: 'Outro motivo' }
];

function garantirModalDenuncia() {
  let modal = document.getElementById('denunciaModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'denunciaModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:420px; width:92%; margin:auto; background:var(--fundo-card); border:1px solid var(--borda); border-radius:12px; padding:16px;">
      <h3 style="font-size:0.95rem; margin:0 0 10px; color:var(--rosa-claro);">Denunciar conteúdo</h3>
      <div id="denunciaMotivos" style="display:flex; flex-direction:column; gap:6px; margin:10px 0;"></div>
      <textarea id="denunciaDescricao" rows="3" placeholder="Descreva o problema (opcional)" style="width:100%; background:var(--fundo); border:1px solid var(--borda); border-radius:6px; color:var(--texto); padding:8px; font-size:0.75rem; resize:vertical;"></textarea>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button onclick="enviarDenuncia()" style="flex:1; background:var(--primaria); color:#fff; border:none; padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Enviar</button>
        <button onclick="toggleModal('denunciaModal')" style="flex:1; background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function abrirDenuncia(tipo, id) {
  if (!usuario.logado) {
    mostrarToast('Entre na sua conta para denunciar.', 'alerta');
    return;
  }
  denunciaAlvoAtual = { tipo: tipo, id: id };

  const modal = garantirModalDenuncia();
  const caixa = modal.querySelector('#denunciaMotivos');
  caixa.innerHTML = MOTIVOS_DENUNCIA.map((m, i) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.75rem; color:var(--texto); background:var(--fundo); border:1px solid var(--borda); border-radius:6px; padding:8px; cursor:pointer;">
      <input type="radio" name="motivoDenuncia" value="${m.valor}" ${i === 0 ? 'checked' : ''}> ${m.rotulo}
    </label>
  `).join('');

  const desc = modal.querySelector('#denunciaDescricao');
  if (desc) desc.value = '';

  toggleModal('denunciaModal');
}

async function enviarDenuncia() {
  if (!denunciaAlvoAtual || !_supabase) return;

  const marcado = document.querySelector('input[name="motivoDenuncia"]:checked');
  const motivo = marcado ? marcado.value : 'other';
  const desc = (document.getElementById('denunciaDescricao').value || '').trim();

  try {
    const { data } = await _supabase.rpc('criar_denuncia', {
      p_target_type: denunciaAlvoAtual.tipo,
      p_target_id: denunciaAlvoAtual.id,
      p_reason: motivo,
      p_description: desc || null
    });

    if (data && data.ok) {
      mostrarToast('Denúncia enviada. Nossa moderação vai analisar. Obrigado!', 'sucesso');
    } else {
      mostrarToast('Não foi possível enviar a denúncia.', 'erro');
    }
  } catch (e) {
    mostrarToast('Erro ao enviar denúncia: ' + e.message, 'erro');
  }

  denunciaAlvoAtual = null;
  toggleModal('denunciaModal');
}

/* ==========================================
   VISUALIZAÇÕES E PROGRESSO
========================================== */
async function registrarVisualizacaoObra(obraId) {
  if (!_supabase) return;
  try {
    await _supabase.rpc('increment_work_views', { target_work_id: obraId });
  } catch (e) {
    console.warn("Não foi possível registrar visualização:", e);
  }
}

async function registrarVisualizacaoCapitulo(capituloId) {
  if (!_supabase) return;
  try {
    await _supabase.rpc('increment_chapter_views', { target_chapter_id: capituloId });
  } catch (e) {
    console.warn("Não foi possível registrar visualização do capítulo:", e);
  }
}

function preCarregarImagensCapitulo(urlsPaginas) {
  if (!urlsPaginas || !Array.isArray(urlsPaginas)) return;
  urlsPaginas.forEach(url => {
    const img = new Image();
    img.src = url;
  });
}

async function salvarProgressoLeituraSupabase(workId, chapterId, ultimaPagina = 1) {
  if (!_supabase || !usuario.logado) return;

  try {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    await _supabase.from('reading_history').upsert({
      user_id: user.id,
      work_id: workId,
      chapter_id: chapterId,
      last_page: ultimaPagina,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("Erro ao salvar histórico no Supabase:", e);
  }
}

/* ==========================================
   AVALIAÇÃO DE OBRAS
========================================== */
async function avaliarObra(obraId, notaEstrelas) {
  if (!usuario.logado) {
    mostrarToast('Entre na sua conta para avaliar esta obra!', 'alerta');
    return;
  }

  if (!_supabase) {
    atualizarBolinhasAvaliacao(notaEstrelas);
    mostrarToast('Modo offline: sua avaliação foi registrada neste dispositivo.', 'info');
    return;
  }

  try {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return;

    const { error } = await _supabase.from('ratings').upsert({
      user_id: user.id,
      work_id: obraId,
      stars: notaEstrelas,
      created_at: new Date().toISOString()
    }, { onConflict: 'user_id,work_id' });

    if (error) throw error;

    const { data: w } = await _supabase.from('works').select('rating_avg').eq('id', obraId).single();
    if (w) atualizarBolinhasAvaliacao(parseFloat(w.rating_avg || 0));
    mostrarToast('Obrigado por avaliar esta obra!', 'sucesso');
  } catch (e) {
    mostrarToast('Erro ao salvar avaliação: ' + e.message, 'erro');
  }
}

/* ==========================================
   CONFIRMAÇÕES E DROPDOWNS
========================================== */
let acaoConfirmada = null;

function abrirConfirmacao(titulo, msg, onOk) {
  document.getElementById('confirmTitulo').textContent = titulo;
  document.getElementById('confirmMsg').textContent = msg;
  acaoConfirmada = onOk;
  const btn = document.getElementById('confirmBtnOk');
  btn.onclick = () => {
    toggleModal('confirmModal');
    if (acaoConfirmada) acaoConfirmada();
    acaoConfirmada = null;
  };
  toggleModal('confirmModal');
}

function abrirDropdown(event, menuId) {
  event.stopPropagation();
  document.querySelectorAll('.custom-select-menu').forEach(m => {
    if (m.id !== menuId) m.classList.remove('aberto');
  });
  document.getElementById(menuId).classList.toggle('aberto');
}

function fecharDropdowns() {
  document.querySelectorAll('.custom-select-menu').forEach(m => m.classList.remove('aberto'));
}

document.addEventListener('click', fecharDropdowns);

function definirOrdem(valor, rotulo) {
  ordemFiltro = valor;
  document.getElementById('labelOrdem').textContent = rotulo;
  fecharDropdowns();
  aplicarFiltrosAvancados();
}

function definirStatus(valor, rotulo) {
  statusFiltro = valor;
  document.getElementById('labelStatus').textContent = rotulo;
  fecharDropdowns();
  aplicarFiltrosAvancados();
}

/* ==========================================
   PÁGINAS LEGAIS (RODAPÉ)
========================================== */
function abrirInfoLegal(tipo) {
  const conteudos = {
    termos: {
      t: 'Termos de Serviço',
      d: 'Ao usar a SolitudeScan, você concorda em utilizar a plataforma apenas para leitura pessoal e não comercial. Todo o conteúdo exibido pertence aos respectivos autores e editoras. A SolitudeScan atua como um agregador de divulgação e não hospeda arquivos originais. Contas que tentarem burlar a segurança, revender conteúdo ou praticar spam poderão ser suspensas sem aviso prévio.'
    },
    privacidade: {
      t: 'Política de Privacidade',
      d: 'Coletamos apenas o essencial para o funcionamento da sua conta: e-mail, nome, foto de perfil e histórico de leitura. Não vendemos nem compartilhamos seus dados com terceiros. Os pagamentos são conferidos manualmente e usados apenas para ativar o plano VIP. Você pode solicitar a remoção dos seus dados a qualquer momento.'
    },
    dmca: {
      t: 'DMCA',
      d: 'Respeitamos os direitos autorais. Se você é autor, editora ou detentor de direitos e acredita que alguma obra disponível infringe seus direitos, envie uma solicitação para dmca@solitudescan.com com a identificação da obra e a comprovação de titularidade. O conteúdo será removido prontamente.'
    }
  };
  const c = conteudos[tipo] || conteudos.termos;
  document.getElementById('infoModalTitulo').textContent = c.t;
  document.getElementById('infoModalTexto').textContent = c.d;
  toggleModal('infoModal');
}

/* ==========================================
   OBRAS RELACIONADAS
========================================== */
function garantirSecaoRelacionadas() {
  let sec = document.getElementById('relacionadasSection');
  if (!sec) {
    const lista = document.getElementById('listaCapitulosContainer');
    if (!lista) return null;
    sec = document.createElement('div');
    sec.id = 'relacionadasSection';
    sec.style.marginTop = '12px';
    sec.innerHTML = '<h4 style="font-size:0.9rem; color:var(--rosa-claro); margin-bottom:8px;"><i class="fa-solid fa-wand-magic-sparkles"></i> Obras Relacionadas</h4><div class="carousel-track" id="relacionadasContainer"></div>';
    lista.parentNode.insertBefore(sec, lista.nextSibling);
  }
  return document.getElementById('relacionadasContainer');
}

async function carregarObrasRelacionadas(obraId) {
  const container = garantirSecaoRelacionadas();
  if (!container) return;

  let rel = [];
  if (_supabase) {
    try {
      const { data } = await _supabase.rpc('get_related_works', { p_work_id: obraId, p_limit: 6 });
      if (data && Array.isArray(data)) rel = data.map(mudarCamposSupabaseParaLocal);
    } catch (e) { console.warn(e); }
  }

  if (rel.length === 0) {
    const atual = todasAsObras().find(o => String(o.id) === String(obraId));
    rel = todasAsObras().filter(o => String(o.id) !== String(obraId) && atual && o.genero === atual.genero).slice(0, 6);
  }

  if (rel.length === 0) {
    container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Sem obras relacionadas ainda.</p>';
    return;
  }
  container.innerHTML = rel.map(obra => criarItemCarousel(obra)).join('');
}

// === FIM DA PARTE 7 ===

/* ==========================================
   FASE 6 — LEITOR PROFISSIONAL (F6-1)
========================================== */
function injetarEstiloAutoImersivo() {
  if (document.getElementById('estiloAutoImersivo')) return;
  const area = document.getElementById('readerCascataContainer');
  if (!area) return;

  let el = area;
  while (el && el.id !== 'readerModal') {
    el.setAttribute('data-leitor-essencial', '1');
    el = el.parentElement;
  }

  const style = document.createElement('style');
  style.id = 'estiloAutoImersivo';
  style.textContent = '#readerModal > * { transition: opacity 0.25s ease; } #readerModal.auto-imersivo > *:not([data-leitor-essencial]) { opacity: 0 !important; pointer-events: none !important; }';
  document.head.appendChild(style);
}

function iniciarAtalhosTecladoLeitor() {
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('readerModal');
    if (!modal || !modal.classList.contains('active')) return;

    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowRight': mudarCapituloLeitor(1); break;
      case 'ArrowLeft': mudarCapituloLeitor(-1); break;
      case '+':
      case '=': ajustarZoomLeitor(10); break;
      case '-':
      case '_': ajustarZoomLeitor(-10); break;
      case 'f':
      case 'F': alternarTelaCheia(); break;
      case 'i':
      case 'I': alternarModoImersivo(); break;
      case 'Escape': fecharLeitor(); break;
    }
  });
}

function iniciarGestosAvancadosLeitor() {
  const area = document.getElementById('readerCascataContainer');
  if (!area) return;

  let pinchInicial = 0;
  let zoomInicial = 100;
  let ultimoTap = 0;

  area.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinchInicial = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      zoomInicial = nivelZoomLeitor;
    }
  }, { passive: true });

  area.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinchInicial > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const novo = Math.round(zoomInicial * (dist / pinchInicial));
      nivelZoomLeitor = Math.min(Math.max(novo, 50), 150);
      document.querySelectorAll('.pagina-capitulo').forEach(img => {
        img.style.width = nivelZoomLeitor + '%';
      });
    }
  }, { passive: true });

  area.addEventListener('touchend', e => {
    if (e.touches.length < 2) pinchInicial = 0;

    if (e.changedTouches.length === 1) {
      const agora = Date.now();
      if (agora - ultimoTap < 300) {
        nivelZoomLeitor = nivelZoomLeitor > 100 ? 100 : 140;
        document.querySelectorAll('.pagina-capitulo').forEach(img => {
          img.style.width = nivelZoomLeitor + '%';
        });
        mostrarToast('Zoom: ' + nivelZoomLeitor + '%', 'info', 1200);
        ultimoTap = 0;
      } else {
        ultimoTap = agora;
      }
    }
  }, { passive: true });

  area.addEventListener('scroll', () => {
    const ultimo = area._ultimoScroll || 0;
    const descendo = area.scrollTop > ultimo && area.scrollTop > 120;
    area._ultimoScroll = area.scrollTop;

    const modal = document.getElementById('readerModal');
    if (modal && !modoImersivo) modal.classList.toggle('auto-imersivo', descendo);
  }, { passive: true });
}

/* ==========================================
   FASE 6 — LEITOR PROFISSIONAL (F6-2)
========================================== */
let timerSalvamentoProgresso = null;

function chaveProgressoLeitura() {
  const cap = capitulosObraAtual[indiceCapituloAtual];
  if (!obraAtualId || !cap) return null;
  return 'solitude_progresso_' + obraAtualId + '_' + (cap.id || cap.numero);
}

function salvarProgressoPixel() {
  const area = document.getElementById('readerCascataContainer');
  const chave = chaveProgressoLeitura();
  if (!area || !chave) return;

  const total = area.scrollHeight - area.clientHeight;
  if (total <= 0) return;
  const pct = Math.min(100, Math.max(0, Math.round((area.scrollTop / total) * 100)));
  localStorage.setItem(chave, String(pct));
}

function restaurarProgressoPixel() {
  const area = document.getElementById('readerCascataContainer');
  const chave = chaveProgressoLeitura();
  if (!area || !chave) return;

  const pct = parseInt(localStorage.getItem(chave) || '0', 10);
  if (pct <= 1 || pct >= 99) return;

  const aplicar = () => {
    const total = area.scrollHeight - area.clientHeight;
    if (total > 0) area.scrollTop = (pct / 100) * total;
  };
  setTimeout(aplicar, 150);
  setTimeout(aplicar, 700);
}

function iniciarSalvamentoProgresso() {
  const area = document.getElementById('readerCascataContainer');
  if (!area) return;
  area.addEventListener('scroll', () => {
    if (timerSalvamentoProgresso) clearTimeout(timerSalvamentoProgresso);
    timerSalvamentoProgresso = setTimeout(salvarProgressoPixel, 400);
  }, { passive: true });
}

function montarRodapeLeitor() {
  const area = document.getElementById('readerCascataContainer');
  if (!area) return;
  const ehUltimo = indiceCapituloAtual >= capitulosObraAtual.length - 1;

  area.insertAdjacentHTML('beforeend', `
    <div style="text-align:center; padding:24px 12px 48px;">
      ${ehUltimo
        ? '<button style="background:var(--primaria); color:#fff; border:none; padding:12px 22px; border-radius:8px; font-weight:800; font-size:0.85rem; cursor:pointer;" onclick="fecharLeitor()">Você chegou ao capítulo mais recente. Voltar à lista</button>'
        : '<button style="background:var(--primaria); color:#fff; border:none; padding:12px 22px; border-radius:8px; font-weight:800; font-size:0.85rem; cursor:pointer;" onclick="mudarCapituloLeitor(1)">Próximo Capítulo</button>'}
    </div>
  `);
}

/* ==========================================
   FASE 8 — EDIÇÃO DE OBRA (F8R-1)
========================================== */
let editandoObraId = null;

function garantirModalEditarObra() {
  let modal = document.getElementById('editarObraModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'editarObraModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px; width:94%; margin:auto; background:var(--fundo-card); border:1px solid var(--borda); border-radius:12px; padding:16px; max-height:85vh; overflow-y:auto;">
      <h3 style="font-size:0.95rem; margin:0 0 12px; color:var(--rosa-claro);">Editar Obra</h3>
      <div class="form-group"><label>Título</label><input type="text" id="editObraTitulo"></div>
      <div class="form-group"><label>Sinopse</label><textarea id="editObraSinopse" rows="4"></textarea></div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <div class="form-group"><label>Status</label><select id="editObraStatus">
          <option value="ongoing">Em Lançamento</option>
          <option value="completed">Completo</option>
          <option value="hiatus">Em Hiato</option>
          <option value="dropped">Cancelado</option>
          <option value="licensed">Licenciado</option>
        </select></div>
        <div class="form-group"><label>Tipo</label><select id="editObraTipo">
          <option value="manhwa">Manhwa</option>
          <option value="manga">Mangá</option>
          <option value="manhua">Manhua</option>
          <option value="webtoon">Webtoon</option>
          <option value="novel">Novel</option>
        </select></div>
        <div class="form-group"><label>Classificação</label><select id="editObraClassificacao">
          <option value="10">Livre</option>
          <option value="14">14+</option>
          <option value="16">16+</option>
          <option value="18">18+</option>
        </select></div>
        <div class="form-group"><label>Ano</label><input type="number" id="editObraAno"></div>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin:10px 0; font-size:0.75rem;">
        <label><input type="checkbox" id="editObraVip"> VIP</label>
        <label><input type="checkbox" id="editObraDestaque"> Destaque</label>
        <label><input type="checkbox" id="editObraPublicada"> Publicada</label>
        <label><input type="checkbox" id="editObraAdulto"> +18</label>
      </div>
      <div class="form-group"><label>Gêneros</label><div id="editObraGeneros" style="display:flex; flex-wrap:wrap; gap:6px;"></div></div>
      <div class="form-group"><label>Trocar capa (arquivo)</label><input type="file" id="editObraCapaArquivo" accept="image/*"></div>
      <div class="form-group"><label>Trocar banner (arquivo)</label><input type="file" id="editObraBannerArquivo" accept="image/*"></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button onclick="salvarEdicaoObra()" style="flex:1; background:var(--primaria); color:#fff; border:none; padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Salvar</button>
        <button onclick="toggleModal('editarObraModal')" style="flex:1; background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function garantirSelectsEquipe(modal) {
  if (modal.querySelector('#editObraAutor')) return;
  const generosBox = modal.querySelector('#editObraGeneros');
  if (!generosBox) return;
  const wrap = generosBox.closest('.form-group');
  const div = document.createElement('div');
  div.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:8px;';
  div.innerHTML = `
    <div class="form-group"><label>Autor</label><select id="editObraAutor"></select></div>
    <div class="form-group"><label>Artista</label><select id="editObraArtista"></select></div>
    <div class="form-group" style="grid-column:1/-1;"><label>Scanlator</label><select id="editObraScanlator"></select></div>
  `;
  wrap.parentNode.insertBefore(div, wrap);
}

async function uploadBannerSupabase(fileInput) {
  if (!_supabase || !fileInput || !fileInput.files.length) return null;
  const file = fileInput.files[0];
  const ext = file.name.split('.').pop();
  const path = `banner_${Date.now()}.${ext}`;
  const { error } = await _supabase.storage.from('banners').upload(path, file, { contentType: file.type });
  if (error) { mostrarToast('Erro no banner: ' + error.message, 'erro'); return null; }
  return _supabase.storage.from('banners').getPublicUrl(path).data.publicUrl;
}

async function abrirEdicaoObra(id) {
  if (!usuario.isAdmin || !_supabase || !ehUuid(id)) return;
  editandoObraId = id;
  const modal = garantirModalEditarObra();

  const { data: w } = await _supabase.from('works').select('*').eq('id', id).single();
  if (!w) return;

  modal.querySelector('#editObraTitulo').value = w.title || '';
  modal.querySelector('#editObraSinopse').value = w.synopsis || '';
  modal.querySelector('#editObraStatus').value = w.status || 'ongoing';
  modal.querySelector('#editObraTipo').value = w.type || 'manhwa';
  modal.querySelector('#editObraClassificacao').value = String(w.rating_age || 10);
  modal.querySelector('#editObraAno').value = w.year || '';
  modal.querySelector('#editObraVip').checked = !!w.is_vip;
  modal.querySelector('#editObraDestaque').checked = !!w.is_featured;
  modal.querySelector('#editObraPublicada').checked = !!w.is_published;
  modal.querySelector('#editObraAdulto').checked = !!w.is_adult;

  const { data: todos } = await _supabase.from('genres').select('id, name').order('sort_order');
  const { data: atuais } = await _supabase.from('work_genres').select('genre_id').eq('work_id', id);
  const idsAtuais = (atuais || []).map(g => g.genre_id);

  modal.querySelector('#editObraGeneros').innerHTML = (todos || []).map(g => `
    <label style="display:flex; align-items:center; gap:6px; font-size:0.7rem; background:var(--fundo); border:1px solid var(--borda); border-radius:6px; padding:5px 8px; cursor:pointer;">
      <input type="checkbox" value="${g.id}" ${idsAtuais.includes(g.id) ? 'checked' : ''}> ${escaparHtml(g.name)}
    </label>
  `).join('');

  garantirSelectsEquipe(modal);
  const { data: creators } = await _supabase.from('creators').select('id, name').order('name');
  const { data: scanlators } = await _supabase.from('scanlators').select('id, name').order('name');
  const optC = (creators || []).map(c => `<option value="${c.id}">${escaparHtml(c.name)}</option>`).join('');
  const optS = (scanlators || []).map(s => `<option value="${s.id}">${escaparHtml(s.name)}</option>`).join('');
  const selA = modal.querySelector('#editObraAutor');
  selA.innerHTML = '<option value="">Sem autor</option>' + optC;
  const selAr = modal.querySelector('#editObraArtista');
  selAr.innerHTML = '<option value="">Sem artista</option>' + optC;
  const selSc = modal.querySelector('#editObraScanlator');
  selSc.innerHTML = '<option value="">Sem scanlator</option>' + optS;
  selA.value = w.author_id || '';
  selAr.value = w.artist_id || '';
  selSc.value = w.scanlator_id || '';

  toggleModal('editarObraModal');
}

async function salvarEdicaoObra() {
  if (!usuario.isAdmin || !editandoObraId || !_supabase) return;
  const modal = document.getElementById('editarObraModal');
  const get = s => modal.querySelector(s);

  let capaUrl = null;
  let bannerUrl = null;
  if (get('#editObraCapaArquivo').files.length > 0) capaUrl = await uploadCapaSupabase(get('#editObraCapaArquivo'));
  if (get('#editObraBannerArquivo').files.length > 0) bannerUrl = await uploadBannerSupabase(get('#editObraBannerArquivo'));

  const updates = {
    title: get('#editObraTitulo').value.trim(),
    synopsis: get('#editObraSinopse').value.trim(),
    status: get('#editObraStatus').value,
    type: get('#editObraTipo').value,
    rating_age: parseInt(get('#editObraClassificacao').value, 10) || 10,
    year: parseInt(get('#editObraAno').value, 10) || null,
    is_vip: get('#editObraVip').checked,
    is_featured: get('#editObraDestaque').checked,
    is_published: get('#editObraPublicada').checked,
    is_adult: get('#editObraAdulto').checked
  };
  if (capaUrl) updates.cover_url = capaUrl;
  if (bannerUrl) updates.banner_url = bannerUrl;
  updates.author_id = get('#editObraAutor').value || null;
  updates.artist_id = get('#editObraArtista').value || null;
  updates.scanlator_id = get('#editObraScanlator').value || null;

  const { error } = await _supabase.from('works').update(updates).eq('id', editandoObraId);
  if (error) { mostrarToast('Erro ao salvar: ' + error.message, 'erro'); return; }

  const marcados = Array.from(modal.querySelectorAll('#editObraGeneros input:checked')).map(i => i.value);
  await _supabase.from('work_genres').delete().eq('work_id', editandoObraId);
  if (marcados.length > 0) {
    await _supabase.from('work_genres').insert(marcados.map(gid => ({ work_id: editandoObraId, genre_id: gid })));
  }

  mostrarToast('Obra atualizada com sucesso!', 'sucesso');
  toggleModal('editarObraModal');
  carregarGerenciamentoObras();
  carregarObras();
}

/* ==========================================
   FASE 8 — GERENCIAR CAPÍTULOS (F8R-2)
========================================== */
function paraInputData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

async function carregarGerenciamentoCapitulos() {
  const anchor = document.getElementById('adminModeracaoSection')
    || document.getElementById('adminBannersSection')
    || document.getElementById('adminObrasContainer');
  if (!_supabase || !anchor) return;

  let sec = document.getElementById('adminCapitulosSection');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'adminCapitulosSection';
    sec.style.marginTop = '14px';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  }

  const { data: obras } = await _supabase.from('works').select('id, title').is('deleted_at', null).order('title');

  sec.innerHTML = `
    <h4 style="font-size:0.9rem; color:var(--rosa-claro); margin-bottom:8px;"><i class="fa-solid fa-layer-group"></i> Gerenciar Capítulos</h4>
    <div class="form-group"><label>Obra</label><select id="adminCapitulosObra" onchange="carregarCapitulosDaObra(this.value)">
      <option value="">Selecione uma obra</option>
      ${(obras || []).map(o => `<option value="${o.id}">${escaparHtml(o.title)}</option>`).join('')}
    </select></div>
    <div id="listaCapitulosAdmin"></div>
  `;
}

async function carregarCapitulosDaObra(workId) {
  const container = document.getElementById('listaCapitulosAdmin');
  if (!container || !workId) return;

  const { data } = await _supabase.from('chapters').select('*').eq('work_id', workId).order('chapter_number', { ascending: false });

  if (!data || data.length === 0) {
    container.innerHTML = '<p style="font-size:0.7rem; color:var(--texto-claro);">Nenhum capítulo nesta obra.</p>';
    return;
  }

  container.innerHTML = data.map(c => {
    const statusTxt = c.is_published ? 'Publicado' : (c.release_at ? 'Agendado' : 'Rascunho');
    return `
      <div class="pay-item" style="margin-top:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
          <strong>Cap. ${c.chapter_number}</strong>
          <span style="color:var(--texto-claro);">${statusTxt}</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; align-items:center;">
          <input type="datetime-local" id="ag-${c.id}" value="${paraInputData(c.release_at)}" style="background:var(--fundo); border:1px solid var(--borda); border-radius:6px; color:var(--texto); padding:5px; font-size:0.7rem;">
          <button class="btn-aprovar" onclick="agendarCapitulo('${c.id}', '${workId}')">Agendar</button>
          <button class="btn-aprovar" onclick="alternarPublicacaoCapitulo('${c.id}', ${!c.is_published}, '${workId}')">${c.is_published ? 'Despublicar' : 'Publicar'}</button>
          <button class="btn-recusar" onclick="excluirCapituloAdmin('${c.id}', '${workId}')">Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

async function agendarCapitulo(capId, workId) {
  if (!usuario.isAdmin) return;
  const input = document.getElementById('ag-' + capId);
  if (!input || !input.value) {
    mostrarToast('Escolha uma data e hora para agendar.', 'alerta');
    return;
  }
  const quando = new Date(input.value);
  const { error } = await _supabase.from('chapters').update({ release_at: quando.toISOString(), is_published: false }).eq('id', capId);
  if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
  mostrarToast('Capítulo agendado. Será publicado automaticamente.', 'sucesso');
  carregarCapitulosDaObra(workId);
}

async function alternarPublicacaoCapitulo(capId, publicar, workId) {
  if (!usuario.isAdmin) return;
  const updates = { is_published: publicar };
  if (publicar) updates.release_at = new Date().toISOString();
  const { error } = await _supabase.from('chapters').update(updates).eq('id', capId);
  if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
  await atualizarContadoresObra(workId);
  mostrarToast(publicar ? 'Capítulo publicado.' : 'Capítulo despublicado.', 'sucesso');
  carregarCapitulosDaObra(workId);
}

async function excluirCapituloAdmin(capId, workId) {
  if (!usuario.isAdmin) return;
  abrirConfirmacao('Excluir capítulo', 'Esta ação não pode ser desfeita. Excluir este capítulo?', async () => {
    const { error } = await _supabase.from('chapters').delete().eq('id', capId);
    if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
    await atualizarContadoresObra(workId);
    mostrarToast('Capítulo excluído.', 'sucesso');
    carregarCapitulosDaObra(workId);
  });
}

async function atualizarContadoresObra(workId) {
  if (!_supabase || !ehUuid(workId)) return;
  const { data } = await _supabase.from('chapters').select('release_at').eq('work_id', workId).eq('is_published', true);
  const count = (data || []).length;
  const last = (data || []).reduce((m, c) => (!m || c.release_at > m) ? c.release_at : m, null);
  await _supabase.from('works').update({ chapters_count: count, last_chapter_at: last }).eq('id', workId);
}

/* ==========================================
   FASE 8 — CRIADORES E SCANLATORS (F8R-3)
========================================== */
async function carregarGerenciamentoPessoas() {
  const anchor = document.getElementById('adminCapitulosSection')
    || document.getElementById('adminModeracaoSection')
    || document.getElementById('adminObrasContainer');
  if (!_supabase || !anchor) return;

  let sec = document.getElementById('adminPessoasSection');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'adminPessoasSection';
    sec.style.marginTop = '14px';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  }

  sec.innerHTML = `
    <h4 style="font-size:0.9rem; color:var(--rosa-claro); margin-bottom:8px;"><i class="fa-solid fa-users"></i> Criadores e Scanlators</h4>
    <div class="form-group"><label>Novo criador (autor/artista)</label>
      <div style="display:flex; gap:6px;"><input type="text" id="novoCreatorNome" placeholder="Nome"><button class="btn-aprovar" onclick="adicionarCreator()">Add</button></div>
    </div>
    <div id="listaCreatorsAdmin"></div>
    <div class="form-group"><label>Nova scanlator</label>
      <div style="display:flex; gap:6px;"><input type="text" id="novoScanlatorNome" placeholder="Nome"><button class="btn-aprovar" onclick="adicionarScanlator()">Add</button></div>
    </div>
    <div id="listaScanlatorsAdmin"></div>
  `;

  carregarCreatorsAdmin();
  carregarScanlatorsAdmin();
}

async function carregarCreatorsAdmin() {
  const container = document.getElementById('listaCreatorsAdmin');
  if (!container) return;
  const { data } = await _supabase.from('creators').select('id, name').order('name');
  if (!data || data.length === 0) { container.innerHTML = '<p style="font-size:0.7rem; color:var(--texto-claro);">Nenhum criador.</p>'; return; }
  container.innerHTML = data.map(c => `
    <div class="pay-item" style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:0.75rem;">${escaparHtml(c.name)}</span>
      <button class="btn-recusar" onclick="excluirCreator('${c.id}')">Excluir</button>
    </div>
  `).join('');
}

async function carregarScanlatorsAdmin() {
  const container = document.getElementById('listaScanlatorsAdmin');
  if (!container) return;
  const { data } = await _supabase.from('scanlators').select('id, name').order('name');
  if (!data || data.length === 0) { container.innerHTML = '<p style="font-size:0.7rem; color:var(--texto-claro);">Nenhuma scanlator.</p>'; return; }
  container.innerHTML = data.map(s => `
    <div class="pay-item" style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:0.75rem;">${escaparHtml(s.name)}</span>
      <button class="btn-recusar" onclick="excluirScanlator('${s.id}')">Excluir</button>
    </div>
  `).join('');
}

async function adicionarCreator() {
  if (!usuario.isAdmin) return;
  const input = document.getElementById('novoCreatorNome');
  const nome = (input.value || '').trim();
  if (!nome) { mostrarToast('Digite o nome do criador.', 'alerta'); return; }
  const { error } = await _supabase.from('creators').insert([{ name: nome }]);
  if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
  input.value = '';
  mostrarToast('Criador adicionado.', 'sucesso');
  carregarCreatorsAdmin();
}

async function adicionarScanlator() {
  if (!usuario.isAdmin) return;
  const input = document.getElementById('novoScanlatorNome');
  const nome = (input.value || '').trim();
  if (!nome) { mostrarToast('Digite o nome da scanlator.', 'alerta'); return; }
  const { error } = await _supabase.from('scanlators').insert([{ name: nome }]);
  if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
  input.value = '';
  mostrarToast('Scanlator adicionada.', 'sucesso');
  carregarScanlatorsAdmin();
}

async function excluirCreator(id) {
  if (!usuario.isAdmin) return;
  const { error } = await _supabase.from('creators').delete().eq('id', id);
  if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
  mostrarToast('Criador excluído.', 'sucesso');
  carregarCreatorsAdmin();
}

async function excluirScanlator(id) {
  if (!usuario.isAdmin) return;
  const { error } = await _supabase.from('scanlators').delete().eq('id', id);
  if (error) { mostrarToast('Erro: ' + error.message, 'erro'); return; }
  mostrarToast('Scanlator excluída.', 'sucesso');
  carregarScanlatorsAdmin();
}

// === FIM DA PARTE 8 ===

/* ==========================================
   FASE 9 — LISTAS PERSONALIZADAS (F9-1)
========================================== */
let listasPersonalizadas = [];
let abaAtivaPerfil = 'historico';

async function carregarListasDoUsuario() {
  const padroes = [
    { id: 'padrao_quero_ler', nome: 'Quero Ler', descricao: 'Obras que você pretende começar', isPadrao: true, itens: [] },
    { id: 'padrao_lendo', nome: 'Lendo', descricao: 'Obras que você está lendo agora', isPadrao: true, itens: [] },
    { id: 'padrao_completo', nome: 'Completo', descricao: 'Obras que você terminou', isPadrao: true, itens: [] },
    { id: 'padrao_dropados', nome: 'Dropados', descricao: 'Obras que você abandonou', isPadrao: true, itens: [] }
  ];

  let custom = [];

  if (_supabase && usuario.logado && usuario.id) {
    try {
      const { data } = await _supabase
        .from('user_lists')
        .select('id, name, description, user_list_items(work_id, status)')
        .eq('user_id', usuario.id)
        .order('created_at', { ascending: true });

      custom = (data || []).map(l => ({
        id: l.id,
        nome: l.name,
        descricao: l.description || '',
        isPadrao: false,
        itens: (l.user_list_items || []).map(i => ({ workId: i.work_id, status: i.status || 'reading' }))
      }));
    } catch (e) {
      console.warn(e);
      custom = JSON.parse(localStorage.getItem('solitude_listas_custom') || '[]');
    }
  } else {
    custom = JSON.parse(localStorage.getItem('solitude_listas_custom') || '[]');
  }

  listasPersonalizadas = [...padroes, ...custom];
}

function persistirListasLocais() {
  const custom = listasPersonalizadas.filter(l => !l.isPadrao);
  localStorage.setItem('solitude_listas_custom', JSON.stringify(custom));
}

function garantirModalListaDetalhada() {
  let modal = document.getElementById('modalListaDetalhada');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modalListaDetalhada';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:420px; width:92%; margin:auto; background:var(--fundo-card); border:1px solid var(--borda); border-radius:12px; padding:16px; max-height:75vh; overflow-y:auto;">
      <h3 id="listaDetalhadaTitulo" style="font-size:0.95rem; margin:0 0 4px; color:var(--rosa-claro);"></h3>
      <p id="listaDetalhadaDesc" style="font-size:0.7rem; color:var(--texto-claro); margin:0 0 10px;"></p>
      <div id="listaDetalhadaItens"></div>
      <button onclick="toggleModal('modalListaDetalhada')" style="width:100%; margin-top:10px; background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Fechar</button>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function trocarAbaPerfil(aba) {
  abaAtivaPerfil = aba;
  renderizarAbasPerfil();
}

function renderizarAbasPerfil() {
  const favContainer = document.getElementById('favoritosContainer');
  const histContainer = document.getElementById('historyContainer');
  if (!favContainer) return;

  const parent = favContainer.parentNode;

  let abasEl = document.getElementById('perfilAbasNavegacao');
  if (!abasEl) {
    abasEl = document.createElement('div');
    abasEl.id = 'perfilAbasNavegacao';
    abasEl.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; margin:12px 0;';
    const titulo = parent.querySelector('h3, h4');
    if (titulo) titulo.parentNode.insertBefore(abasEl, titulo.nextSibling);
    else parent.insertBefore(abasEl, favContainer);
  }

  abasEl.innerHTML = `
    <button onclick="trocarAbaPerfil('historico')" class="chip ${abaAtivaPerfil === 'historico' ? 'active' : ''}" style="flex:1; min-width:70px;">Histórico</button>
    <button onclick="trocarAbaPerfil('favoritos')" class="chip ${abaAtivaPerfil === 'favoritos' ? 'active' : ''}" style="flex:1; min-width:70px;">Favoritos</button>
    <button onclick="trocarAbaPerfil('listas')" class="chip ${abaAtivaPerfil === 'listas' ? 'active' : ''}" style="flex:1; min-width:70px;">Listas</button>
    <button onclick="trocarAbaPerfil('stats')" class="chip ${abaAtivaPerfil === 'stats' ? 'active' : ''}" style="flex:1; min-width:70px;">Stats</button>
  `;

  const painel = document.getElementById('perfilAbaPainel') || (() => {
    const p = document.createElement('div');
    p.id = 'perfilAbaPainel';
    abasEl.parentNode.insertBefore(p, abasEl.nextSibling);
    return p;
  })();

  if (abaAtivaPerfil === 'historico') {
    if (usuario.historico.length === 0) {
      painel.innerHTML = '<p style="font-size:0.8rem; color:var(--texto-claro);">Nenhum histórico recente.</p>';
    } else {
      painel.innerHTML = usuario.historico.map(h => `
        <div style="padding:10px; background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; font-size:0.8rem; margin-bottom:6px; display:flex; justify-content:space-between;">
          <span>${escaparHtml(h.titulo)}</span>
          <strong style="color:var(--primaria);">${escaparHtml(h.ultimoCap)}</strong>
        </div>
      `).join('');
    }
  } else if (abaAtivaPerfil === 'favoritos') {
    const favsObras = listaObras.filter(o => usuario.favoritos.includes(o.id));
    if (favsObras.length === 0) {
      painel.innerHTML = '<p style="font-size:0.8rem; color:var(--texto-claro);">Nenhum favorito adicionado.</p>';
    } else {
      painel.innerHTML = favsObras.map(f => `
        <div style="padding:10px; background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; font-size:0.8rem; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>${escaparHtml(f.titulo)}</span>
          <button onclick="abrirDetalhesObra('${f.id}')" style="background:var(--primaria); color:#fff; padding:4px 8px; border-radius:4px; font-size:0.7rem; border:none; cursor:pointer;">Ver</button>
        </div>
      `).join('');
    }
  } else if (abaAtivaPerfil === 'listas') {
    renderizarPainelListas(painel);
  } else if (abaAtivaPerfil === 'stats') {
    renderizarPainelStats(painel);
  }

  if (histContainer) histContainer.style.display = 'none';
  if (favContainer) favContainer.style.display = 'none';
}

function renderizarPainelListas(painel) {
  painel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <p style="font-size:0.75rem; color:var(--texto-claro); margin:0;">${listasPersonalizadas.length} lista${listasPersonalizadas.length !== 1 ? 's' : ''}</p>
      <button onclick="abrirModalCriarLista()" style="background:var(--primaria); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:0.7rem; font-weight:700; cursor:pointer;">
        <i class="fa-solid fa-plus"></i> Nova Lista
      </button>
    </div>
  ` + (listasPersonalizadas.length === 0
    ? '<p style="font-size:0.8rem; color:var(--texto-claro);">Nenhuma lista criada.</p>'
    : listasPersonalizadas.map(lista => {
        const count = lista.itens.length;
        const podeExcluir = !lista.isPadrao;
        return `
          <div style="padding:10px; background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div style="flex:1; min-width:0;">
                <strong style="font-size:0.8rem; color:var(--rosa-claro);">${escaparHtml(lista.nome)}${lista.isPadrao ? ' (padrão)' : ''}</strong>
                <p style="font-size:0.65rem; color:var(--texto-claro); margin:2px 0 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escaparHtml(lista.descricao || 'Sem descrição')} • ${count} obra${count !== 1 ? 's' : ''}</p>
              </div>
              <div style="display:flex; gap:4px; margin-left:8px;">
                <button onclick="abrirListaDetalhada('${lista.id}')" style="background:var(--primaria); color:#fff; padding:4px 8px; border-radius:4px; font-size:0.65rem; border:none; cursor:pointer;">Abrir</button>
                <button onclick="abrirModalEditarLista('${lista.id}')" style="background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:4px 8px; border-radius:4px; font-size:0.65rem; cursor:pointer;">Editar</button>
                ${podeExcluir ? `<button onclick="excluirLista('${lista.id}')" style="background:var(--erro); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:0.65rem; cursor:pointer;">Excluir</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join(''));
}

function abrirListaDetalhada(listaId) {
  const lista = listasPersonalizadas.find(l => l.id === listaId);
  if (!lista) return;

  const obrasDaLista = lista.itens
    .map(it => {
      const obra = todasAsObras().find(o => String(o.id) === String(it.workId));
      return obra ? Object.assign({}, obra, { statusNaLista: it.status }) : null;
    })
    .filter(Boolean);

  const modal = garantirModalListaDetalhada();
  modal.querySelector('#listaDetalhadaTitulo').textContent = lista.nome;
  modal.querySelector('#listaDetalhadaDesc').textContent = lista.descricao || '';

  const container = modal.querySelector('#listaDetalhadaItens');
  if (obrasDaLista.length === 0) {
    container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Esta lista está vazia. Adicione obras pela página de detalhes.</p>';
  } else {
    container.innerHTML = obrasDaLista.map(o => `
      <div style="padding:8px; background:var(--fundo); border:1px solid var(--borda); border-radius:6px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <span style="font-size:0.75rem; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escaparHtml(o.titulo)}</span>
        <div style="display:flex; gap:4px;">
          <button onclick="abrirDetalhesObra('${o.id}'); toggleModal('modalListaDetalhada');" style="background:var(--primaria); color:#fff; padding:3px 8px; border-radius:4px; font-size:0.65rem; border:none; cursor:pointer;">Ver</button>
          <button onclick="removerObraDeLista('${lista.id}', '${o.id}')" style="background:var(--erro); color:#fff; border:none; padding:3px 8px; border-radius:4px; font-size:0.65rem; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
  }

  toggleModal('modalListaDetalhada');
}

/* ==========================================
   FASE 9 — CRUD DE LISTAS (F9-2)
========================================== */
let modalListaEmEdicaoId = null;
let obraParaAdicionarId = null;

function garantirModalListaForm() {
  let modal = document.getElementById('modalListaForm');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modalListaForm';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:420px; width:92%; margin:auto; background:var(--fundo-card); border:1px solid var(--borda); border-radius:12px; padding:16px;">
      <h3 id="listaFormTitulo" style="font-size:0.95rem; margin:0 0 12px; color:var(--rosa-claro);">Nova Lista</h3>
      <div class="form-group"><label>Nome da lista</label><input type="text" id="listaFormNome" maxlength="60" placeholder="Ex: Lendo agora, Meus favoritos de 2026"></div>
      <div class="form-group"><label>Descrição (opcional)</label><textarea id="listaFormDesc" rows="3" maxlength="200" placeholder="Do que se trata esta lista?"></textarea></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button onclick="salvarLista()" style="flex:1; background:var(--primaria); color:#fff; border:none; padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Salvar</button>
        <button onclick="toggleModal('modalListaForm')" style="flex:1; background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function garantirModalEscolherLista() {
  let modal = document.getElementById('modalEscolherLista');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modalEscolherLista';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:420px; width:92%; margin:auto; background:var(--fundo-card); border:1px solid var(--borda); border-radius:12px; padding:16px; max-height:75vh; overflow-y:auto;">
      <h3 style="font-size:0.95rem; margin:0 0 10px; color:var(--rosa-claro);">Adicionar à lista</h3>
      <div id="escolherListaContainer"></div>
      <div style="border-top:1px solid var(--borda); margin-top:10px; padding-top:10px;">
        <button onclick="toggleModal('modalEscolherLista'); abrirModalCriarLista()" style="width:100%; background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:8px; border-radius:6px; font-size:0.75rem; font-weight:700; cursor:pointer;">
          <i class="fa-solid fa-plus"></i> Criar nova lista
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function abrirModalCriarLista() {
  modalListaEmEdicaoId = null;
  const modal = garantirModalListaForm();
  modal.querySelector('#listaFormTitulo').textContent = 'Nova Lista';
  modal.querySelector('#listaFormNome').value = '';
  modal.querySelector('#listaFormDesc').value = '';
  toggleModal('modalListaForm');
  setTimeout(() => modal.querySelector('#listaFormNome').focus(), 100);
}

function abrirModalEditarLista(listaId) {
  const lista = listasPersonalizadas.find(l => l.id === listaId);
  if (!lista) return;
  modalListaEmEdicaoId = listaId;
  const modal = garantirModalListaForm();
  modal.querySelector('#listaFormTitulo').textContent = 'Editar Lista';
  modal.querySelector('#listaFormNome').value = lista.nome;
  modal.querySelector('#listaFormDesc').value = lista.descricao || '';
  toggleModal('modalListaForm');
}

async function salvarLista() {
  const nome = (document.getElementById('listaFormNome').value || '').trim();
  const desc = (document.getElementById('listaFormDesc').value || '').trim();

  if (!nome) { mostrarToast('Digite o nome da lista.', 'alerta'); return; }
  if (nome.length > 60) { mostrarToast('Nome muito longo (máximo 60 caracteres).', 'alerta'); return; }

  const criando = !modalListaEmEdicaoId;
  let listaSalva = null;

  if (_supabase && usuario.logado) {
    try {
      if (criando) {
        const { data, error } = await _supabase.from('user_lists').insert([{
          user_id: usuario.id,
          name: nome,
          description: desc || null
        }]).select().single();
        if (error) throw error;
        listaSalva = { id: data.id, nome: data.name, descricao: data.description || '', isPadrao: false, itens: [] };
      } else {
        const { error } = await _supabase.from('user_lists').update({ name: nome, description: desc || null }).eq('id', modalListaEmEdicaoId);
        if (error) throw error;
        listaSalva = listasPersonalizadas.find(l => l.id === modalListaEmEdicaoId);
        if (listaSalva) { listaSalva.nome = nome; listaSalva.descricao = desc; }
      }
    } catch (e) {
      mostrarToast('Erro ao salvar lista: ' + e.message, 'erro');
      return;
    }
  }

  if (!_supabase || !usuario.logado) {
    if (criando) {
      listaSalva = {
        id: 'lista_' + Date.now(),
        nome: nome,
        descricao: desc,
        isPadrao: false,
        itens: []
      };
      listasPersonalizadas.unshift(listaSalva);
    } else {
      const lista = listasPersonalizadas.find(l => l.id === modalListaEmEdicaoId);
      if (lista) { lista.nome = nome; lista.descricao = desc; }
    }
    persistirListasLocais();
  } else if (criando && listaSalva) {
    listasPersonalizadas.unshift(listaSalva);
  }

  mostrarToast(criando ? 'Lista criada!' : 'Lista atualizada!', 'sucesso');
  toggleModal('modalListaForm');
  renderizarAbasPerfil();
}

async function excluirLista(listaId) {
  const lista = listasPersonalizadas.find(l => l.id === listaId);
  if (!lista) return;
  if (lista.isPadrao) { mostrarToast('Listas padrão não podem ser excluídas.', 'alerta'); return; }

  abrirConfirmacao('Excluir lista', `Tem certeza que deseja excluir a lista "${lista.nome}"? Todas as obras dentro dela serão removidas da lista, mas não do seu histórico ou favoritos.`, async () => {
    if (_supabase && usuario.logado && ehUuid(listaId)) {
      try {
        await _supabase.from('user_list_items').delete().eq('list_id', listaId);
        const { error } = await _supabase.from('user_lists').delete().eq('id', listaId);
        if (error) throw error;
      } catch (e) {
        mostrarToast('Erro ao excluir: ' + e.message, 'erro');
        return;
      }
    } else {
      persistirListasLocais();
    }

    listasPersonalizadas = listasPersonalizadas.filter(l => l.id !== listaId);
    mostrarToast('Lista excluída.', 'sucesso');
    renderizarAbasPerfil();
  });
}

function abrirModalEscolherLista(workId) {
  if (!workId) return;
  obraParaAdicionarId = workId;

  if (listasPersonalizadas.length === 0) carregarListasDoUsuario();

  const modal = garantirModalEscolherLista();
  const container = modal.querySelector('#escolherListaContainer');

  if (listasPersonalizadas.length === 0) {
    container.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Carregando listas...</p>';
    toggleModal('modalEscolherLista');
    carregarListasDoUsuario().then(() => {
      renderizarOpcoesEscolherLista(container, workId);
    });
    return;
  }

  renderizarOpcoesEscolherLista(container, workId);
  toggleModal('modalEscolherLista');
}

function renderizarOpcoesEscolherLista(container, workId) {
  container.innerHTML = listasPersonalizadas.map(lista => {
    const jaEsta = lista.itens.some(i => String(i.workId) === String(workId));
    return `
      <button onclick="adicionarObraALista('${lista.id}', '${workId}')" ${jaEsta ? 'disabled' : ''} style="width:100%; text-align:left; background:${jaEsta ? 'var(--fundo)' : 'var(--fundo-card)'}; border:1px solid ${jaEsta ? 'var(--sucesso)' : 'var(--borda)'}; border-radius:6px; padding:10px; margin-bottom:6px; cursor:${jaEsta ? 'default' : 'pointer'}; display:flex; justify-content:space-between; align-items:center;">
        <div style="flex:1; min-width:0;">
          <strong style="font-size:0.75rem; color:${jaEsta ? 'var(--sucesso)' : 'var(--rosa-claro)'};">${escaparHtml(lista.nome)}</strong>
          <p style="font-size:0.6rem; color:var(--texto-claro); margin:2px 0 0;">${lista.itens.length} obra${lista.itens.length !== 1 ? 's' : ''}</p>
        </div>
        <span style="font-size:0.65rem; color:${jaEsta ? 'var(--sucesso)' : 'var(--texto-claro)'};">
          ${jaEsta ? '<i class="fa-solid fa-check"></i> Já está' : '<i class="fa-solid fa-plus"></i>'}
        </span>
      </button>
    `;
  }).join('');
}

async function adicionarObraALista(listaId, workId) {
  const lista = listasPersonalizadas.find(l => l.id === listaId);
  if (!lista) return;

  if (lista.itens.some(i => String(i.workId) === String(workId))) {
    mostrarToast('Esta obra já está nesta lista.', 'info');
    return;
  }

  if (_supabase && usuario.logado && ehUuid(listaId) && ehUuid(workId)) {
    try {
      const { error } = await _supabase.from('user_list_items').insert([{
        list_id: listaId,
        work_id: workId,
        position: lista.itens.length,
        status: 'reading'
      }]);
      if (error) throw error;
    } catch (e) {
      mostrarToast('Erro ao adicionar: ' + e.message, 'erro');
      return;
    }
  }

  lista.itens.push({ workId: workId, status: 'reading' });
  if (!_supabase || !usuario.logado) persistirListasLocais();

  const obra = todasAsObras().find(o => String(o.id) === String(workId));
  const nomeObra = obra ? obra.titulo : 'Obra';
  mostrarToast(`"${nomeObra}" adicionada à lista "${lista.nome}".`, 'sucesso');
  toggleModal('modalEscolherLista');
}

async function removerObraDeLista(listaId, workId) {
  const lista = listasPersonalizadas.find(l => l.id === listaId);
  if (!lista) return;

  if (_supabase && usuario.logado && ehUuid(listaId) && ehUuid(workId)) {
    try {
      const { error } = await _supabase.from('user_list_items').delete().eq('list_id', listaId).eq('work_id', workId);
      if (error) throw error;
    } catch (e) {
      mostrarToast('Erro ao remover: ' + e.message, 'erro');
      return;
    }
  }

  lista.itens = lista.itens.filter(i => String(i.workId) !== String(workId));
  if (!_supabase || !usuario.logado) persistirListasLocais();

  mostrarToast('Obra removida da lista.', 'info');
  abrirListaDetalhada(listaId);
  renderizarAbasPerfil();
}

/* ==========================================
   FASE 9 — STATS E EXPORTAÇÃO (F9-3)
========================================== */
async function renderizarPainelStats(painel) {
  painel.innerHTML = '<p style="font-size:0.75rem; color:var(--texto-claro);">Calculando estatísticas...</p>';

  let totalFavoritos = usuario.favoritos.length;
  let totalHistorico = usuario.historico.length;
  let totalCapitulos = usuario.historico.length;
  let totalAvaliacoes = 0;
  let totalListas = listasPersonalizadas.length;

  if (_supabase && usuario.logado) {
    try {
      const { count: cFav } = await _supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', usuario.id);
      const { count: cHist } = await _supabase.from('reading_history').select('id', { count: 'exact', head: true }).eq('user_id', usuario.id);
      const { count: cRat } = await _supabase.from('ratings').select('id', { count: 'exact', head: true }).eq('user_id', usuario.id);
      if (cFav != null) totalFavoritos = cFav;
      if (cHist != null) totalCapitulos = cHist;
      if (cRat != null) totalAvaliacoes = cRat;
    } catch (e) { console.warn(e); }
  }

  const contagemGeneros = {};
  usuario.historico.forEach(h => {
    const obra = todasAsObras().find(o => String(o.id) === String(h.id));
    if (obra && obra.genero) contagemGeneros[obra.genero] = (contagemGeneros[obra.genero] || 0) + 1;
  });
  const generosTop = Object.entries(contagemGeneros).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const minutos = totalCapitulos * 5;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  const tempoStr = horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;

  const cards = [
    { icone: 'fa-book-open', label: 'Obras lidas', valor: totalHistorico },
    { icone: 'fa-layer-group', label: 'Capítulos', valor: totalCapitulos },
    { icone: 'fa-heart', label: 'Favoritos', valor: totalFavoritos },
    { icone: 'fa-star', label: 'Avaliações', valor: totalAvaliacoes },
    { icone: 'fa-list', label: 'Listas', valor: totalListas },
    { icone: 'fa-clock', label: 'Tempo de leitura', valor: tempoStr }
  ];

  painel.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(90px, 1fr)); gap:6px; margin-bottom:12px;">
      ${cards.map(c => `
        <div style="background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:8px; text-align:center;">
          <i class="fa-solid ${c.icone}" style="color:var(--primaria); font-size:0.85rem;"></i>
          <p style="font-weight:800; font-size:0.9rem; margin:4px 0 0;">${c.valor}</p>
          <p style="font-size:0.6rem; color:var(--texto-claro); margin:0;">${c.label}</p>
        </div>
      `).join('')}
    </div>
    ${generosTop.length > 0 ? `
      <p style="font-size:0.7rem; color:var(--texto-claro); margin:0 0 6px;">Seus gêneros mais lidos:</p>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
        ${generosTop.map(g => `<span style="background:var(--primaria); color:#fff; padding:3px 10px; border-radius:12px; font-size:0.65rem; font-weight:700;">${escaparHtml(g[0])} (${g[1]})</span>`).join('')}
      </div>
    ` : ''}
    <button onclick="exportarDadosUsuario()" style="width:100%; background:var(--fundo-card); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">
      <i class="fa-solid fa-download"></i> Exportar meus dados (JSON)
    </button>
  `;
}

async function exportarDadosUsuario() {
  const dados = {
    exportadoEm: new Date().toISOString(),
    plataforma: 'SolitudeScan',
    perfil: {
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      isVip: usuario.isVip,
      planoVip: usuario.planoVip,
      vipExpiraEm: usuario.vipExpiraEm ? (usuario.vipExpiraEm.toISOString ? usuario.vipExpiraEm.toISOString() : usuario.vipExpiraEm) : null
    },
    favoritos: usuario.favoritos,
    historico: usuario.historico,
    listas: listasPersonalizadas
  };

  if (_supabase && usuario.logado) {
    try {
      const { data: favs } = await _supabase.from('favorites').select('work_id, created_at').eq('user_id', usuario.id);
      const { data: hist } = await _supabase.from('reading_history').select('work_id, chapter_id, last_page, updated_at').eq('user_id', usuario.id);
      const { data: rats } = await _supabase.from('ratings').select('work_id, stars, created_at').eq('user_id', usuario.id);
      const { data: coms } = await _supabase.from('comments').select('work_id, content, created_at').eq('user_id', usuario.id);
      dados.nuvem = {
        favoritos: favs || [],
        historico: hist || [],
        avaliacoes: rats || [],
        comentarios: coms || []
      };
    } catch (e) {
      console.warn(e);
    }
  }

  baixarArquivoJson(dados, 'solitude-dados.json');
  mostrarToast('Seus dados foram exportados!', 'sucesso');
}

function baixarArquivoJson(obj, nomeArquivo) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ==========================================
   FASE 9 — EXCLUSÃO DE CONTA (F9-4)
========================================== */
function garantirZonaPerigoPerfil() {
  let sec = document.getElementById('zonaPerigoPerfil');
  if (sec) return sec;
  const loggedIn = document.getElementById('loggedInView');
  if (!loggedIn) return null;

  sec = document.createElement('div');
  sec.id = 'zonaPerigoPerfil';
  sec.style.cssText = 'margin-top:16px; padding:12px; border:1px solid var(--erro); border-radius:8px;';
  sec.innerHTML = `
    <h4 style="font-size:0.8rem; color:var(--erro); margin:0 0 6px;">Zona de Perigo</h4>
    <p style="font-size:0.7rem; color:var(--texto-claro); margin:0 0 8px;">Excluir sua conta remove permanentemente todos os seus dados (favoritos, histórico, listas, avaliações, comentários). Esta ação não pode ser desfeita.</p>
    <button onclick="abrirModalExclusaoConta()" style="background:var(--erro); color:#fff; border:none; padding:8px 12px; border-radius:6px; font-size:0.75rem; font-weight:700; cursor:pointer;">Excluir minha conta</button>
  `;
  loggedIn.appendChild(sec);
  return sec;
}

function garantirModalExclusaoConta() {
  let modal = document.getElementById('modalExclusaoConta');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modalExclusaoConta';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:420px; width:92%; margin:auto; background:var(--fundo-card); border:1px solid var(--erro); border-radius:12px; padding:16px;">
      <h3 style="font-size:0.95rem; margin:0 0 8px; color:var(--erro);">Excluir conta</h3>
      <p style="font-size:0.75rem; color:var(--texto-claro); margin:0 0 10px;">Esta ação é irreversível. Todos os seus dados serão apagados. Para confirmar, digite <b>EXCLUIR</b> abaixo.</p>
      <input type="text" id="confirmacaoExclusaoInput" placeholder="EXCLUIR" style="width:100%; background:var(--fundo); border:1px solid var(--borda); border-radius:6px; color:var(--texto); padding:8px; font-size:0.8rem; margin-bottom:10px;">
      <div style="display:flex; gap:8px;">
        <button onclick="excluirMinhaConta()" style="flex:1; background:var(--erro); color:#fff; border:none; padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Excluir definitivamente</button>
        <button onclick="toggleModal('modalExclusaoConta')" style="flex:1; background:var(--fundo); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function abrirModalExclusaoConta() {
  const modal = garantirModalExclusaoConta();
  modal.querySelector('#confirmacaoExclusaoInput').value = '';
  toggleModal('modalExclusaoConta');
}

async function excluirMinhaConta() {
  const input = document.getElementById('confirmacaoExclusaoInput');
  if (!input || input.value.trim().toUpperCase() !== 'EXCLUIR') {
    mostrarToast('Digite EXCLUIR para confirmar.', 'alerta');
    return;
  }

  if (_supabase && usuario.logado) {
    try {
      const { error } = await _supabase.rpc('excluir_propria_conta');
      if (error) throw error;
    } catch (e) {
      mostrarToast('Erro ao excluir conta: ' + e.message, 'erro');
      return;
    }
    try { await _supabase.auth.signOut(); } catch (e) { console.warn(e); }
  }

  limparDadosLocais();
  mostrarToast('Conta excluída. Até logo.', 'info', 6000);
  setTimeout(() => location.reload(), 1500);
}

function limparDadosLocais() {
  const chaves = Object.keys(localStorage).filter(k => k.startsWith('solitude_'));
  chaves.forEach(k => localStorage.removeItem(k));

  usuario = {
    logado: false,
    id: null,
    nome: "LeitorSolitude",
    email: "",
    foto: "https://via.placeholder.com/150",
    telefone: "",
    isVip: false,
    isAdmin: false,
    planoVip: null,
    vipExpiraEm: null,
    favoritos: [],
    historico: []
  };
  listasPersonalizadas = [];
}

/* ==========================================
   FASE 10 — PWA (F10-2)
========================================== */
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('SolitudeScan: service worker ativo'))
      .catch(e => console.warn('Não foi possível registrar o service worker:', e));
  });
}

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnInstalarApp');
  if (btn) btn.style.display = 'block';
});

function garantirBotaoInstalar() {
  if (document.getElementById('btnInstalarApp')) return;
  const loggedOut = document.getElementById('loggedOutView');
  if (!loggedOut || !loggedOut.parentNode) return;

  const btn = document.createElement('button');
  btn.id = 'btnInstalarApp';
  btn.style.cssText = 'display:none; width:100%; margin-top:10px; background:var(--fundo-card); color:var(--texto); border:1px solid var(--borda); padding:10px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer;';
  btn.innerHTML = '<i class="fa-solid fa-download"></i> Instalar App';
  btn.onclick = instalarApp;
  loggedOut.parentNode.insertBefore(btn, loggedOut.nextSibling);
}

async function instalarApp() {
  if (!deferredInstallPrompt) {
    mostrarToast('Use o menu do navegador e escolha "Adicionar à tela inicial".', 'info', 6000);
    return;
  }
  deferredInstallPrompt.prompt();
  const escolha = await deferredInstallPrompt.userChoice;
  if (escolha.outcome === 'accepted') {
    mostrarToast('App instalado! Acesse pela tela inicial.', 'sucesso');
    deferredInstallPrompt = null;
    const btn = document.getElementById('btnInstalarApp');
    if (btn) btn.style.display = 'none';
  }
}

/* ==========================================
   FASE 10 — SEO (F10-3): LINKS PROFUNDOS
========================================== */
function processarLinksProfundos() {
  const params = new URLSearchParams(window.location.search);
  const obraParam = params.get('obra');
  const buscaParam = params.get('busca');

  if (obraParam && ehUuid(obraParam)) {
    setTimeout(() => abrirDetalhesObra(obraParam), 600);
  }

  if (buscaParam) {
    const input = document.getElementById('searchInput');
    if (input) {
      input.value = buscaParam;
      termoBusca = buscaParam.toLowerCase().trim();
      carregarObras();
    }
  }
}

/* ==========================================
   FASE 11 — ACESSIBILIDADE (F11-1)
========================================== */
function aplicarAcessibilidade() {
  if (!document.getElementById('skipLink')) {
    const skip = document.createElement('a');
    skip.id = 'skipLink';
    skip.href = '#mangaContainer';
    skip.textContent = 'Pular para o conteúdo';
    skip.style.cssText = 'position:absolute; left:-9999px; top:0; background:var(--primaria); color:#fff; padding:10px 16px; z-index:10000; border-radius:0 0 8px 0; font-weight:700;';
    skip.addEventListener('focus', () => { skip.style.left = '0'; });
    skip.addEventListener('blur', () => { skip.style.left = '-9999px'; });
    document.body.prepend(skip);
  }

  const toastContainer = document.getElementById('toastContainer');
  if (toastContainer && !toastContainer.getAttribute('aria-live')) {
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('role', 'status');
  }

  document.querySelectorAll('button').forEach(btn => {
    const texto = (btn.textContent || '').trim();
    const aria = btn.getAttribute('aria-label');
    const title = btn.getAttribute('title');
    if (!texto && !aria && !title) {
      const icone = btn.querySelector('i');
      if (icone) {
        const classes = icone.className || '';
        let rotulo = 'Botão';
        if (classes.includes('fa-heart')) rotulo = 'Favoritar';
        else if (classes.includes('fa-share')) rotulo = 'Compartilhar';
        else if (classes.includes('fa-bookmark')) rotulo = 'Adicionar à lista';
        else if (classes.includes('fa-thumbs-up')) rotulo = 'Curtir';
        else if (classes.includes('fa-moon') || classes.includes('fa-sun')) rotulo = 'Alternar tema';
        else if (classes.includes('fa-bell')) rotulo = 'Notificações';
        else if (classes.includes('fa-xmark') || classes.includes('fa-times')) rotulo = 'Fechar';
        else if (classes.includes('fa-expand') || classes.includes('fa-compress')) rotulo = 'Tela cheia';
        else if (classes.includes('fa-eye')) rotulo = 'Modo imersivo';
        else if (classes.includes('fa-chevron-right')) rotulo = 'Avançar';
        else if (classes.includes('fa-chevron-left')) rotulo = 'Voltar';
        btn.setAttribute('aria-label', rotulo);
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('manga-card')) {
      e.preventDefault();
      document.activeElement.click();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(m => {
        if (m.id !== 'readerModal') toggleModal(m.id);
      });
    }
  });

  if (!document.getElementById('estiloMovimentoReduzido')) {
    const style = document.createElement('style');
    style.id = 'estiloMovimentoReduzido';
    style.textContent = '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }';
    document.head.appendChild(style);
  }
}

function marcarCardsNavegaveis() {
  const aplicar = () => {
    document.querySelectorAll('.manga-card:not([tabindex])').forEach(card => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'link');
    });
  };

  aplicar();

  const observer = new MutationObserver(aplicar);
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ==========================================
   FASE 11 — TESTES AUTOMATIZADOS (F11-2)
========================================== */
async function rodarTestesSolitude() {
  const resultados = [];
  function teste(nome, ok, detalhe) {
    resultados.push({ nome: nome, ok: !!ok, detalhe: detalhe || '' });
  }

  console.log('SolitudeScan: iniciando suíte de testes...');

  const elementos = [
    'mangaContainer', 'toastContainer', 'heroBannerSection', 'tendenciasContainer',
    'rankingContainer', 'continueLendoContainer', 'readerCascataContainer',
    'detalhesModal', 'readerModal', 'loginModal', 'registerModal', 'searchInput',
    'listaCapitulosContainer', 'btnFavoritar'
  ];
  elementos.forEach(id => {
    teste('Elemento #' + id, !!document.getElementById(id));
  });

  const funcoes = [
    'carregarObras', 'abrirDetalhesObra', 'abrirLeitor', 'fecharLeitor',
    'alternarFavorito', 'executarLoginCustom', 'executarCadastro', 'abrirPainelAdmin',
    'exportarDadosUsuario', 'compartilharObraAtual', 'avaliarObra', 'adicionarComentario',
    'carregarListasDoUsuario', 'salvarLista', 'escaparHtml', 'ehUuid', 'formatarNumero'
  ];
  funcoes.forEach(fn => {
    teste('Função ' + fn + '()', typeof window[fn] === 'function');
  });

  try {
    localStorage.setItem('solitude_teste', '1');
    const lido = localStorage.getItem('solitude_teste');
    localStorage.removeItem('solitude_teste');
    teste('localStorage lê/grava', lido === '1');
  } catch (e) {
    teste('localStorage lê/grava', false, e.message);
  }

  teste('Service Worker suportado', 'serviceWorker' in navigator);
  teste('Fetch API suportado', typeof fetch === 'function');
  teste('Clipboard API suportado', !!(navigator.clipboard));

  if (_supabase) {
    try {
      const { error } = await _supabase.from('works').select('id', { count: 'exact', head: true });
      teste('Conexão Supabase (tabela works)', !error, error ? error.message : '');
    } catch (e) {
      teste('Conexão Supabase (tabela works)', false, e.message);
    }

    try {
      const { data } = await _supabase.from('genres').select('id').limit(1);
      teste('Seed de gêneros presente', (data || []).length > 0);
    } catch (e) {
      teste('Seed de gêneros presente', false, e.message);
    }

    try {
      const { data, error } = await _supabase.rpc('search_works', { query: 'teste', p_limit: 1 });
      teste('RPC search_works', !error, error ? error.message : '');
    } catch (e) {
      teste('RPC search_works', false, e.message);
    }

    try {
      const { data } = await _supabase.storage.from('covers').list('', { limit: 1 });
      teste('Bucket covers acessível', !!data);
    } catch (e) {
      teste('Bucket covers acessível', false, e.message);
    }

    try {
      const { data } = await _supabase.from('profiles').select('id').limit(1);
      teste('Tabela profiles legível', !!data);
    } catch (e) {
      teste('Tabela profiles legível', false, e.message);
    }
  } else {
    teste('Conexão Supabase (tabela works)', false, 'Cliente não inicializado');
    teste('Seed de gêneros presente', false, 'Cliente não inicializado');
    teste('RPC search_works', false, 'Cliente não inicializado');
    teste('Bucket covers acessível', false, 'Cliente não inicializado');
    teste('Tabela profiles legível', false, 'Cliente não inicializado');
  }

  const falhas = resultados.filter(r => !r.ok);
  const total = resultados.length;

  console.group('SolitudeScan — Relatório de Testes (' + (total - falhas.length) + '/' + total + ' aprovados)');
  resultados.forEach(r => {
    if (r.ok) {
      console.log('[PASSA] ' + r.nome);
    } else {
      console.warn('[FALHA] ' + r.nome + (r.detalhe ? ' — ' + r.detalhe : ''));
    }
  });
  console.groupEnd();

  if (falhas.length === 0) {
    mostrarToast('Todos os ' + total + ' testes passaram. Projeto saudável!', 'sucesso', 8000);
  } else {
    mostrarToast(falhas.length + ' de ' + total + ' testes falharam. Veja o console (F12).', 'alerta', 8000);
  }

  return resultados;
}

function processarParametroTestes() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('testes') === '1') {
    setTimeout(() => { rodarTestesSolitude(); }, 1200);
  }
}

/* ==========================================
   INICIALIZAÇÃO DA PÁGINA
========================================== */
document.addEventListener("DOMContentLoaded", () => {
  ativarProtecaoClickjacking();
  iniciarBloqueadorAnuncios();

  usuario.foto = localStorage.getItem('solitude_foto') || usuario.foto;
  usuario.nome = localStorage.getItem('solitude_nome') || usuario.nome;
  usuario.telefone = localStorage.getItem('solitude_tel') || usuario.telefone;

  aplicarOverridesLocais();
  verificarVipAtivo();
  carregarListasDoUsuario();
  carregarObras();
  renderizarTendencias();
  renderizarContinueLendo();
  renderizarRanking();
  renderizarConcluidas();
  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  iniciarGestosLeitor();
  carregarNotificacoes();

  injetarEstiloAutoImersivo();
  iniciarAtalhosTecladoLeitor();
  iniciarGestosAvancadosLeitor();
  iniciarSalvamentoProgresso();

  garantirBotaoInstalar();
  processarLinksProfundos();
  aplicarAcessibilidade();
  marcarCardsNavegaveis();
  processarParametroTestes();

  const btnTeste = document.createElement('button');
  btnTeste.textContent = 'Testar Sistema';
  btnTeste.style.cssText = 'position:fixed; bottom:80px; right:20px; background:#10b981; color:#fff; border:none; padding:10px 16px; border-radius:8px; font-weight:700; font-size:0.75rem; z-index:99999; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  btnTeste.onclick = rodarTestesSolitude;
  document.body.appendChild(btnTeste);

  if (_supabase) verificarSessaoSupabase();
});

setInterval(verificarVipAtivo, 3600000);

// === FIM DA PARTE 9 (ARQUIVO COMPLETO) ===

/* ==========================================
SWIPE NO HERO BANNER (passar com o dedo)
========================================== */
(function () {
  let xInicio = null;

  document.addEventListener('touchstart', function (e) {
    const sec = document.getElementById('heroBannerSection');
    if (!sec || !sec.contains(e.target)) return;
    xInicio = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (xInicio === null) return;
    const dx = e.changedTouches[0].clientX - xInicio;
    xInicio = null;
    if (Math.abs(dx) < 40) return;

    if (dx < 0) {
      rotacionarHero(); // swipe pra esquerda = próxima
    } else {
      heroIndice = Math.max(0, heroIndice - 2);
      rotacionarHero(); // swipe pra direita = anterior
    }
  }, { passive: true });
})();

/* ==========================================
HERO CARROSSel — AUTO + SWIPE (definitivo)
========================================== */
if (!window.__heroCarouselAtivo) {
  window.__heroCarouselAtivo = true;

  setInterval(function () {
    if (typeof heroObras !== 'undefined' && heroObras.length > 1) {
      rotacionarHero();
      if (typeof atualizarDotsHero === 'function') atualizarDotsHero();
    }
  }, 5000);

  (function () {
    let x = null;
    document.addEventListener('touchstart', function (e) {
      const sec = document.getElementById('heroBannerSection');
      if (!sec || !sec.contains(e.target)) return;
      x = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (x === null) return;
      const dx = e.changedTouches[0].clientX - x;
      x = null;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) { rotacionarHero(); }
      else { heroIndice = Math.max(0, heroIndice - 2); rotacionarHero(); }
      if (typeof atualizarDotsHero === 'function') atualizarDotsHero();
    }, { passive: true });
  })();
}

/* ==========================================
ESCONDER BOTÃO DE TESTE DOS VISITANTES
(só admin continua vendo)
========================================== */
setTimeout(function () {
  if (window.usuario && usuario.isAdmin) return;
  document.querySelectorAll('button').forEach(function (b) {
    if (b.textContent.trim() === 'Testar Sistema') b.remove();
  });
}, 1500);
