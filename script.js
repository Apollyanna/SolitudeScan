/* ==================================================
SOLITUDESCAN — LÓGICA COMPLETA + VIP AUTOMÁTICO
• SEGURANÇA REFORÇADA + BLOQUEADOR DE ANÚNCIOS
================================================== */

// CONFIGURAÇÕES DO SUPABASE
const SUPABASE_URL = "https://zvpehjzbwastofjytogn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cGVoanpid2FzdG9manl0b2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDU0NjMsImV4cCI6MjEwMTEyMTQ2M30.KoB3qd86M5sVr_mcsixFAhBqv6rQxmW2LOWNs0_C1lg";
const EMAIL_ADMIN = "apolianadealmeidarocha97@gmail.com";
const CHAVE_PIX = "solitudescanoficial@gmail.com";
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
document.body.innerHTML = &lt;div style="padding:40px;text-align:center;font-family:sans-serif;"&gt; &lt;h2&gt;Acesso bloqueado&lt;/h2&gt; &lt;p&gt;Este site não pode ser exibido em frames externos.&lt;/p&gt; &lt;a href="${window.self.location.href}">Abrir diretamente</a>
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
.replace(/&/g, '&')
.replace(/</g, '<')
.replace(/>/g, '>')
.replace(/"/g, '"')
.replace(/'/g, ''');
}

function validarEmail(email) {
return /^[^\s@]+@[^\s@]+.[^\s@]{2,}`$/.test(email);
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
toast.className = toast toast-${tipo}; toast.innerHTML =<i class="fa-solid ${icons[tipo] || icons.info}"&gt;&lt;/i&gt;&lt;span&gt;${escaparHtml(mensagem)}</span>`;
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
return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`$/i.test(String(id));
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

container.innerHTML = &lt;div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--texto-claro);"&gt; &lt;i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--primaria); margin-bottom:10px;"&gt;&lt;/i&gt; &lt;p&gt;Carregando obras...&lt;/p&gt; &lt;/div&gt;;

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
container.innerHTML = &lt;div style="grid-column: 1/-1; text-align:center; padding:30px; color:var(--texto-claro);"&gt; Nenhuma obra encontrada. &lt;/div>;
return;
}

container.innerHTML = obras.map(obra => &lt;div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
${obra.isVip ? '&lt;div class="vip-badge"&gt;VIP&lt;/div&gt;' : ''} ${usuario.favoritos.includes(obra.id) ? '<div class="fav-badge"><i class="fa-solid fa-heart" style="color:var(--primaria);"></i></div>' : ''}
<img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy">
<div class="manga-info">
<p class="manga-title">${escaparHtml(obra.titulo)}&lt;/p&gt; &lt;p class="manga-cap"&gt;${escaparHtml(obra.capitulo)}</p>
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

mostrarToast(Exibindo:${tituloGrid ? tituloGrid.textContent : 'obras'}`, 'info', 2000);
carregarObras();
}

function criarItemCarousel(obra, comUltimoCap = false) {
const hist = usuario.historico.find(h => String(h.id) === String(obra.id));
const textoInfo = comUltimoCap && hist ? hist.ultimoCap : (obra.capitulo || 'Ver Capítulos');

return &lt;div class="carousel-item"&gt; &lt;div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
${obra.isVip ? '&lt;div class="vip-badge"&gt;VIP&lt;/div&gt;' : ''} &lt;img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy" style="height:180px;"&gt; &lt;div class="manga-info"&gt; &lt;p class="manga-title"&gt;${escaparHtml(obra.titulo)}</p>
<p class="manga-cap">${escaparHtml(textoInfo)}&lt;/p&gt; &lt;/div&gt; &lt;/div&gt; &lt;/div&gt;;
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
const { data: b } = await _supabase.from('banners').select('').eq('is_active', true).order('position').limit(5);
if (b && b.length > 0) {
heroObras = b.map(x => ({ id: x.work_id || null, titulo: x.title, capa: x.image_url, genero: x.subtitle || 'DESTAQUE', isVip: false }));
}
} catch (e) { console.warn(e); }
}
if (heroObras.length === 0 && _supabase) {
try {
const { data } = await _supabase.from('works').select(', work_genres(genres(name))').eq('is_published', true).is('deleted_at', null).eq('is_featured', true).limit(5);
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
section.style.background = linear-gradient(180deg, rgba(10,5,11,0.2) 0%, var(--fundo) 100%), url('${obra.capa}') center/cover no-repeat`;
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

container.innerHTML = top10.map((obra, idx) => &lt;div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
<div class="rank-badge"> {obra.isVip ? '<div class="vip-badge">VIP</div>' : ''}
<img src=" {escaparHtml(obra.titulo)}" class="manga-img" loading="lazy">
<div class="manga-info">
<p class="manga-title"> {formatarNumero(obra.visualizacoes || 0)} views</p>
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

container.innerHTML = concluidas.map(obra => &lt;div class="manga-card" onclick="abrirDetalhesObra('${obra.id}')">
<div class="vip-badge" style="background: linear-gradient(135deg, var(--sucesso), #059669);">COMPLETO</div>
<img src="${escaparHtml(obra.capa)}" alt="${escaparHtml(obra.titulo)}" class="manga-img" loading="lazy">
<div class="manga-info">
<p class="manga-title">${escaparHtml(obra.titulo)}&lt;/p&gt; &lt;p class="manga-cap"&gt;${escaparHtml(obra.genero)}</p>
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
numero: Capítulo${c.chapter_number}`,
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
document.getElementById('detalhesGenero').textContent = Gênero: ${obra.genero}; document.getElementById('detalhesStatus').textContent =Status: ${obra.status};
document.getElementById('detalhesAutor').textContent = Autor: ${obra.autor}`;
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
sec.style.backgroundImage = linear-gradient(180deg, rgba(10,5,11,0.3) 0%, rgba(10,5,11,0.8) 100%), url('${escaparHtml(obra.banner)}')`;
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
sec.innerHTML = items.map(i => &lt;div style="background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:8px; text-align:center;"&gt; &lt;i class="fa-solid ${i.icone}" style="color:var(--primaria); font-size:0.85rem;"></i>
<p style="font-weight:800; font-size:0.9rem; margin:4px 0 0;">${i.valor}&lt;/p&gt; &lt;p style="font-size:0.6rem; color:var(--texto-claro); margin:0;"&gt;${i.label}</p>
</div>
`).join('');
}

function renderizarGenerosDetalhes(obra) {
const sec = garantirSecaoGenerosDetalhes();
if (!sec) return;
const generos = (obra.generos && obra.generos.length > 0) ? obra.generos : [obra.genero];
sec.innerHTML = generos.map(g => &lt;span onclick="fecharDetalhesEFiltrarGenero('${escaparHtml(g)}')" style="background:var(--primaria); color:#fff; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700; cursor:pointer; display:inline-block;">${escaparHtml(g)}&lt;/span&gt;).join('');
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
sec.innerHTML = equipe.map(e => &lt;div style="background:var(--fundo-card); border:1px solid var(--borda); border-radius:8px; padding:8px; text-align:center;"&gt; &lt;p style="font-size:0.6rem; color:var(--texto-claro); margin:0; text-transform:uppercase; letter-spacing:0.5px;"&gt;${escaparHtml(e.papel)}</p>
<p style="font-weight:700; font-size:0.8rem; margin:4px 0 0;">${escaparHtml(e.nome)}&lt;/p&gt; &lt;/div&gt;).join('');
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

sec.innerHTML = &lt;div&gt; &lt;p style="font-size:0.65rem; color:var(--texto-claro); margin:0; text-transform:uppercase;"&gt;Total&lt;/p&gt; &lt;p style="font-weight:800; font-size:1rem; margin:2px 0 0;"&gt;${totalCaps} capítulo {dataUltimo}</p>
</div>
`;
}

async function compartilharObraAtual() {
if (!obraAtualId) return;
const obra = todasAsObras().find(o => String(o.id) === String(obraAtualId));
if (!obra) return;

const url = window.location.origin + window.location.pathname + '?obra=' + obra.id;
const texto = Confira "${obra.titulo}" na SolitudeScan`;

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

sec.innerHTML = &lt;span style="background:${corStatus}; color:#fff; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800; text-transform:uppercase;"> {escaparHtml(obra.classificacao || 'Livre')}</span>
latex
{obra.isVip ? '&lt;span style="background:var(--alerta); color:#fff; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800;"&gt;VIP&lt;/span&gt;' : ''} 

{obra.isAdulto ? '<span style="background:var(--erro); color:#fff; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800;">+18</span>' : ''}
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

sec.innerHTML = &lt;button style="width:100%; background:var(--primaria); color:#fff; border:none; padding:12px; border-radius:8px; font-weight:800; font-size:0.9rem; cursor:pointer;" onclick="abrirLeitor(${indiceAlvo})">
<i class="fa-solid fa-book-open"></i> ${escaparHtml(textoBotao)} &lt;/button&gt;;
}

function atualizarBolinhasAvaliacao(nota) {
const notaEl = document.getElementById('notaExibicao');
if (notaEl) notaEl.textContent = ${nota.toFixed(1)} / 5.0`;
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
return &lt;button class="chip" style="width:100%; text-align:left; border-radius:6px; display:flex; justify-content:space-between; align-items:center;" onclick="abrirLeitor(${realIndex})">
<span>${escaparHtml(cap.numero)}&lt;/span&gt; &lt;i class="fa-solid fa-chevron-right" style="fo