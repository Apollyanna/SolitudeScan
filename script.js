'use strict';

const CONFIG = Object.freeze({
  SUPABASE_URL: "https://zvpehjzbwastofjytogn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cGVoanpid2FzdG9manl0b2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDU0NjMsImV4cCI6MjEwMTEyMTQ2M30.KoB3qd86M5sVr_mcsixFAhBqv6rQxmW2LOWNs0_C1lg",
  CHAVE_PIX: "solitudescanoficial@gmail.com",
  TEMPO_PIX_SEGUNDOS: 270,
  DISCORD_URL: "https://discord.gg/fX3wUZBvk",
  PLANOS_DURACAO: Object.freeze({ 'VIP Mensal': 30, 'VIP Trimestral': 90, 'VIP Anual': 365 }),
  MAX_UPLOAD_SIZE: 50 * 1024 * 1024,
  RATE_LIMIT_COMENTARIO: 5000,
  MAX_COMENTARIO_LENGTH: 500,
  MAX_HISTORICO_ITEMS: 50
});

const PLACEHOLDERS = Object.freeze({
  AVATAR_SVG: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#1a0f1e'/><circle cx='32' cy='24' r='12' fill='#ec4899'/><path d='M12 56c2-12 10-18 20-18s18 6 20 18z' fill='#ec4899'/></svg>"
  ),
  CAPA_PLACEHOLDER: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'><rect width='300' height='450' fill='#1a0f1e'/><text x='150' y='225' fill='#ec4899' text-anchor='middle' font-size='14' font-family='sans-serif'>SolitudeScan</text></svg>"
  ),
  PAGINA_PLACEHOLDER: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 1200'><rect width='800' height='1200' fill='#0c070f'/><text x='400' y='600' fill='#ec4899' text-anchor='middle' font-size='20' font-family='sans-serif'>Página indisponível</text></svg>"
  )
});

function lerLocal(chave, padrao) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave) || 'null');
    return valor === null ? padrao : valor;
  } catch (e) {
    return padrao;
  }
}

const AppState = {
  supabase: null,
  usuario: {
    logado: false, id: null, nome: "LeitorSolitude", email: "",
    foto: PLACEHOLDERS.AVATAR_SVG, telefone: "",
    isVip: false, isAdmin: false, planoVip: null, vipExpiraEm: null,
    favoritos: lerLocal('solitude_favoritos', []),
    historico: lerLocal('solitude_historico', [])
  },
  catalogo: { obrasRemotas: [], listaObras: [], generoAtual: 'Todos', termoBusca: '', statusFiltro: 'Todos', ordemFiltro: 'recentes' },
  leitor: { obraAtualId: null, capitulosObraAtual: [], indiceCapituloAtual: 0, ordemInvertida: false, nivelZoom: 100, modoImersivo: false },
  comentarios: { ultimoComentarioEm: 0, cache: {}, responderAComentarioId: null },
  notificacoes: { lista: [], dropdownAberto: false },
  pix: { planoAtual: { plano: '', valor: '' }, solicitacaoAtual: null, timerInterval: null, expirado: false },
  hero: { indice: 0, obras: [], interval: null },
  listas: { personalizadas: [], modalEmEdicaoId: null, obraParaAdicionarId: null },
  perfil: { abaAtiva: 'historico' },
  admin: { editandoObraId: null, editandoCapituloId: null, obraAtualAdmin: null, capituloAtualAdmin: null, obrasCarregadas: false, usuariosCarregados: false, pagamentosCarregados: false },
  denuncia: { alvoAtual: null, tipo: '' },
  pwa: { deferredInstallPrompt: null },
  ui: { acaoConfirmada: null, ordemCapitulosInvertida: false, modalAtual: null },
  modais: { listaObras: [], listaUsuarios: [], listaPagamentos: [] }
};

if (!Array.isArray(AppState.usuario.favoritos)) AppState.usuario.favoritos = [];
if (!Array.isArray(AppState.usuario.historico)) AppState.usuario.historico = [];

try {
  if (typeof supabase !== 'undefined') {
    AppState.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('[SolitudeScan] Supabase indisponível, modo offline.');
}

function escaparHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizarUrlImagem(url, fallback, paraHtml = true) {
  const valor = String(url ?? '').trim();
  if (!valor) return fallback;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(valor)) return valor;
  try {
    const parsed = new URL(valor, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return paraHtml ? escaparHtml(parsed.href) : parsed.href;
    }
  } catch (e) {}
  return fallback;
}

function extrairPathStorage(referencia, bucket = 'chapters') {
  const valor = String(referencia ?? '').trim();
  if (!valor) return '';
  const marcadores = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`
  ];
  for (const marcador of marcadores) {
    const indice = valor.indexOf(marcador);
    if (indice !== -1) return decodeURIComponent(valor.slice(indice + marcador.length).split('?')[0]);
  }
  return valor.startsWith(`${bucket}/`) ? valor.slice(bucket.length + 1) : valor;
}

async function criarUrlAssinadaPagina(referencia) {
  if (!AppState.supabase) return '';
  const path = extrairPathStorage(referencia);
  if (!path) return '';
  const { data, error } = await AppState.supabase.storage.from('chapters').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    console.error('[SolitudeScan] Erro ao gerar URL assinada da página:', error);
    return '';
  }
  return sanitizarUrlImagem(data.signedUrl, '');
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validarSenhaForte(senha) {
  return senha.length >= 8 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha) && /[^a-zA-Z0-9]/.test(senha);
}

function ehUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
}

function formatarNumero(num) {
  num = Number(num) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function formatarMoeda(valor) {
  if (typeof valor === 'string') {
    valor = Number(valor.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  }
  const numero = Number(valor);
  return 'R$ ' + (Number.isFinite(numero) ? numero : 0).toFixed(2).replace('.', ',');
}

function dataRelativa(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'há ' + h + 'h';
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return 'há ' + d + ' dias';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarDataCompleta(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function throttle(fn, limit) {
  let ocupado = false;
  return function (...args) {
    if (ocupado) return;
    fn.apply(this, args);
    ocupado = true;
    setTimeout(() => { ocupado = false; }, limit);
  };
}

function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { sucesso: 'fa-circle-check', erro: 'fa-circle-xmark', alerta: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + tipo;
  toast.innerHTML = '<i class="fa-solid ' + (icons[tipo] || icons.info) + '" aria-hidden="true"></i><span>' + escaparHtml(mensagem) + '</span>';
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-sair');
    setTimeout(() => toast.remove(), 300);
  }, duracao);
}

function toggleModal(modalId, forcar) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const abrindo = typeof forcar === 'boolean' ? forcar : !modal.classList.contains('active');
  modal.classList.toggle('active', abrindo);
  const restante = document.querySelector('.modal.active');
  document.body.style.overflow = restante ? 'hidden' : '';
  if (abrindo) {
    AppState.ui.modalAtual = modalId;
    const foco = modal.querySelector('input:not([type="file"]), textarea, button, [tabindex]');
    if (foco) setTimeout(() => foco.focus(), 120);
  } else if (AppState.ui.modalAtual === modalId) {
    AppState.ui.modalAtual = restante ? restante.id : null;
  }
}

function fecharTodosModais() {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
  AppState.ui.modalAtual = null;
}

function abrirConfirmacao(titulo, msg, onOk) {
  const tituloEl = document.getElementById('confirmTitulo');
  const msgEl = document.getElementById('confirmMsg');
  if (tituloEl) tituloEl.textContent = titulo;
  if (msgEl) msgEl.textContent = msg;
  AppState.ui.acaoConfirmada = onOk;
  const btn = document.getElementById('confirmBtnOk');
  if (btn) {
    btn.onclick = () => {
      const acao = AppState.ui.acaoConfirmada;
      AppState.ui.acaoConfirmada = null;
      toggleModal('confirmModal', false);
      if (typeof acao === 'function') acao();
    };
  }
  toggleModal('confirmModal', true);
}

function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const alvo = document.getElementById(tabId);
  if (alvo) alvo.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', el ? n === el : n.dataset.tab === tabId);
  });
  const footer = document.getElementById('siteFooter');
  if (footer) footer.style.display = tabId === 'tab-home' ? 'flex' : 'none';
  if (tabId === 'tab-profile') renderizarAbasPerfil();
  window.scrollTo({ top: 0 });
}

function todasAsObras() {
  const mapa = new Map();
  [AppState.catalogo.listaObras, AppState.catalogo.obrasRemotas].forEach(lista => {
    if (Array.isArray(lista)) lista.forEach(o => mapa.set(String(o.id), o));
  });
  return [...mapa.values()];
}

function encontrarObraPorId(id) {
  return todasAsObras().find(o => String(o.id) === String(id));
}

function ativarProtecaoClickjacking() {
  if (window.top === window.self) return;
  try {
    window.top.location = window.self.location;
  } catch (e) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;"><h2>Acesso bloqueado</h2><p>Este site não pode ser exibido em frames externos.</p><a href="' + escaparHtml(window.self.location.href) + '">Abrir diretamente</a></div>';
  }
}

function ativarProtecoesLeitor() {
  document.addEventListener('contextmenu', e => {
    if (e.target.closest && e.target.closest('#readerModal')) e.preventDefault();
  });
  document.addEventListener('dragstart', e => {
    if (e.target.tagName === 'IMG' && e.target.closest && e.target.closest('#readerModal')) e.preventDefault();
  });
  document.addEventListener('keydown', e => {
    const reader = document.getElementById('readerModal');
    if (!reader || !reader.classList.contains('active')) return;
    const tecla = (e.key || '').toLowerCase();
    if (e.key === 'F12') e.preventDefault();
    if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(tecla)) e.preventDefault();
    if (e.ctrlKey && ['s', 'u', 'p'].includes(tecla)) e.preventDefault();
  });
}

function limparPlaceholdersMortos() {
  document.querySelectorAll('img').forEach(img => {
    if ((img.src || '').includes('via.placeholder.com')) img.src = PLACEHOLDERS.AVATAR_SVG;
  });
}

function fazerLogin() {
  toggleModal('registerModal', false);
  toggleModal('loginModal', true);
}

function abrirCadastro() {
  toggleModal('loginModal', false);
  toggleModal('registerModal', true);
}

async function executarLoginCustom(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  if (!validarEmail(email)) {
    mostrarToast('Digite um e-mail válido para entrar na sua conta.', 'alerta');
    return;
  }
  if (!AppState.supabase) {
    mostrarToast('Sistema offline. Tente novamente em instantes.', 'erro');
    return;
  }

  const { data, error } = await AppState.supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    const msg = /confirmed/i.test(error.message)
      ? 'Sua conta ainda não foi confirmada. Abra o link que enviamos para seu e-mail e tente de novo.'
      : 'E-mail ou senha incorretos.';
    mostrarToast('Falha ao entrar: ' + msg, 'erro');
    return;
  }

  AppState.usuario.logado = true;
  AppState.usuario.id = data.user.id;
  AppState.usuario.email = email;
  AppState.usuario.nome = email.split('@')[0];

  await carregarPerfilRemoto(data.user.id);
  verificarVipAtivo();
  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  carregarNotificacoes();

  document.getElementById('loginSenha').value = '';
  toggleModal('loginModal', false);
  mostrarToast('Bem-vindo de volta, ' + AppState.usuario.nome + '! Boa leitura.', 'sucesso');
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
  if (!AppState.supabase) {
    mostrarToast('Sistema offline. Tente novamente em instantes.', 'erro');
    return;
  }

  const { data, error } = await AppState.supabase.auth.signUp({ email, password: senha });
  if (error) {
    mostrarToast('Erro no cadastro: ' + error.message, 'erro');
    return;
  }

  document.getElementById('regSenha').value = '';
  document.getElementById('regSenhaConf').value = '';
  toggleModal('registerModal', false);

  if (data.user && !data.session) {
    mostrarToast('Conta criada! Enviamos uma confirmação para seu e-mail: abra o link e depois volte para entrar.', 'sucesso', 8000);
  } else {
    mostrarToast('Conta criada com sucesso! Agora é só entrar e aproveitar a leitura.', 'sucesso');
  }
}

async function fazerLogout() {
  if (AppState.supabase) {
    try { await AppState.supabase.auth.signOut(); } catch (e) {}
  }
  Object.assign(AppState.usuario, {
    logado: false, id: null, email: "", nome: "LeitorSolitude", telefone: "",
    foto: PLACEHOLDERS.AVATAR_SVG, isAdmin: false, isVip: false, planoVip: null, vipExpiraEm: null
  });
  ['solitude_foto', 'solitude_nome', 'solitude_tel', 'solitude_vip_ativo'].forEach(k => localStorage.removeItem(k));
  AppState.notificacoes.lista = [];
  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  switchTab('tab-home');
  mostrarToast('Você saiu da sua conta. Até a próxima leitura!', 'info');
}

async function verificarSessaoSupabase() {
  if (!AppState.supabase) return;
  try {
    const { data: { session } } = await AppState.supabase.auth.getSession();
    if (!session || !session.user) return;
    AppState.usuario.logado = true;
    AppState.usuario.id = session.user.id;
    AppState.usuario.email = session.user.email;
    AppState.usuario.nome = session.user.email.split('@')[0];
    await carregarPerfilRemoto(session.user.id);
    verificarVipAtivo();
    atualizarPerfilTela();
    atualizarVisibilidadeAdmin();
    carregarNotificacoes();
  } catch (e) {}
}

async function carregarPerfilRemoto(userId) {
  if (!AppState.supabase) return;
  try {
    const { data } = await AppState.supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!data) return;
    AppState.usuario.isAdmin = !!data.is_admin;
    if (data.display_name || data.username) AppState.usuario.nome = data.display_name || data.username;
    if (data.avatar_url) AppState.usuario.foto = data.avatar_url;
    AppState.usuario.planoVip = data.vip_plan || null;
    AppState.usuario.vipExpiraEm = data.vip_expires_at ? new Date(data.vip_expires_at) : null;
    AppState.usuario.isVip = !!data.is_vip && (!AppState.usuario.vipExpiraEm || AppState.usuario.vipExpiraEm > new Date());
    await carregarFavoritosRemotos(userId);
  } catch (e) {
    AppState.usuario.isAdmin = false;
  }
}

function atualizarVisibilidadeAdmin() {
  const btn = document.getElementById('btnAdminNav');
  if (btn) btn.style.display = AppState.usuario.logado && AppState.usuario.isAdmin ? 'flex' : 'none';
}

function ativarFallbackImagens() {
  const avatares = ['user-avatar-mini', 'profile-avatar-large', 'avatar-preview-large', 'comment-avatar', 'admin-user-avatar'];
  document.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallbackAplicado) return;
    img.dataset.fallbackAplicado = '1';
    const c = img.classList;
    if (c.contains('reader-page') || c.contains('admin-page-img')) img.src = PLACEHOLDERS.PAGINA_PLACEHOLDER;
    else if (avatares.some(a => c.contains(a))) img.src = PLACEHOLDERS.AVATAR_SVG;
    else img.src = PLACEHOLDERS.CAPA_PLACEHOLDER;
  }, true);
}

function verificarVipAtivo() {
  localStorage.removeItem('solitude_vip_ativo');
  const u = AppState.usuario;
  if (!u.logado) {
    u.isVip = false;
    u.planoVip = null;
    u.vipExpiraEm = null;
    return;
  }
  if (u.isAdmin) return;
  const expiracao = u.vipExpiraEm ? new Date(u.vipExpiraEm) : null;
  if (!u.isVip || (expiracao && Date.now() >= expiracao.getTime())) {
    u.isVip = false;
    u.planoVip = null;
    u.vipExpiraEm = null;
  }
}

function calcularDiasRestantes() {
  if (!AppState.usuario.isVip || !AppState.usuario.vipExpiraEm) return 0;
  const diff = new Date(AppState.usuario.vipExpiraEm).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 86400000) : 0;
}

function atualizarPerfilTela() {
  const u = AppState.usuario;
  const fora = document.getElementById('loggedOutView');
  const dentro = document.getElementById('loggedInView');
  if (fora) fora.style.display = u.logado ? 'none' : 'flex';
  if (dentro) dentro.style.display = u.logado ? 'flex' : 'none';
  if (!u.logado) return;

  const foto = sanitizarUrlImagem(u.foto, PLACEHOLDERS.AVATAR_SVG, false);
  const nomeEl = document.getElementById('userNameDisplay');
  const avatarEl = document.getElementById('userAvatarImg');
  const avatarGrande = document.getElementById('profileAvatarLarge');
  const nomeGrande = document.getElementById('profileNameLarge');
  if (nomeEl) nomeEl.textContent = u.nome;
  if (avatarEl) avatarEl.src = foto;
  if (avatarGrande) avatarGrande.src = foto;
  if (nomeGrande) nomeGrande.textContent = u.nome;

  atualizarDisplayVip();
  garantirZonaPerigoPerfil();

  const cabecalho = document.querySelector('.profile-header > div:last-child');
  if (cabecalho) {
    let box = document.getElementById('vipInfoBox');
    if (u.isVip && u.vipExpiraEm) {
      const dias = calcularDiasRestantes();
      if (!box) {
        box = document.createElement('div');
        box.id = 'vipInfoBox';
        cabecalho.appendChild(box);
      }
      box.className = 'vip-timer-display' + (dias <= 7 ? ' expirando' : '');
      box.innerHTML = '<i class="fa-solid fa-crown" aria-hidden="true"></i><span>Expira em: <strong>' +
        escaparHtml(new Date(u.vipExpiraEm).toLocaleDateString('pt-BR')) + '</strong> (' + dias + ' dias)</span>';
    } else if (box) {
      box.remove();
    }
  }
  renderizarAbasPerfil();
}

function atualizarDisplayVip() {
  const badges = [document.getElementById('userPlanBadge'), document.getElementById('profilePlanLarge')].filter(Boolean);
  const u = AppState.usuario;
  const dias = calcularDiasRestantes();
  const plano = u.planoVip || 'VIP';
  let texto, fundo;

  if (u.isAdmin) {
    texto = 'Administrador';
    fundo = 'var(--admin)';
  } else if (!u.isVip || dias <= 0) {
    texto = u.isVip ? 'VIP Expirado' : 'Plano Gratuito';
    fundo = u.isVip ? 'var(--erro)' : 'var(--texto-claro)';
  } else if (dias <= 7) {
    texto = plano + ' • ' + dias + ' dias restantes';
    fundo = 'linear-gradient(135deg, var(--alerta), #d97706)';
  } else {
    texto = plano + ' • ' + dias + ' dias restantes';
    fundo = 'linear-gradient(135deg, var(--primaria), var(--rosa-escuro))';
  }
  badges.forEach(b => {
    b.textContent = texto;
    b.style.background = fundo;
  });
}

async function salvarPerfil(e) {
  e.preventDefault();
  const u = AppState.usuario;
  const nome = document.getElementById('editNome').value.trim();
  if (nome.length < 2) {
    mostrarToast('Informe um nome de exibição válido.', 'alerta');
    return;
  }

  const arquivo = document.getElementById('editFotoArquivo').files[0];
  if (arquivo) {
    if (arquivo.size > 5 * 1024 * 1024) {
      mostrarToast('Imagem muito grande. Máximo 5MB.', 'alerta');
      return;
    }
    mostrarToast('Processando sua foto...', 'info', 2000);
    let urlFinal = null;
    if (AppState.supabase && u.logado) {
      try {
        const path = u.id + '/avatar_' + Date.now() + '.jpg';
        const { error } = await AppState.supabase.storage.from('avatars').upload(path, arquivo, { upsert: true });
        if (!error) urlFinal = AppState.supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      } catch (err) {}
    }
    if (!urlFinal) {
      try { urlFinal = await redimensionarImagem(arquivo); } catch (err) {}
    }
    if (urlFinal) u.foto = urlFinal;
  }

  u.nome = nome;
  u.telefone = document.getElementById('editTel').value.trim();
  localStorage.setItem('solitude_foto', u.foto);
  localStorage.setItem('solitude_nome', u.nome);
  localStorage.setItem('solitude_tel', u.telefone);

  if (AppState.supabase && u.logado) {
    const dados = { display_name: u.nome };
    if (/^https?:\/\//i.test(u.foto)) dados.avatar_url = u.foto;
    try {
      await AppState.supabase.from('profiles').update(dados).eq('id', u.id);
    } catch (err) {}
  }

  atualizarPerfilTela();
  toggleModal('configModal', false);
  mostrarToast('Perfil atualizado com sucesso!', 'sucesso');
}

async function abrirConfigPerfil() {
  if (!AppState.usuario.logado) {
    fazerLogin();
    return;
  }
  document.getElementById('editNome').value = AppState.usuario.nome;
  document.getElementById('editEmail').value = AppState.usuario.email;
  document.getElementById('editTel').value = AppState.usuario.telefone;
  document.getElementById('editFotoArquivo').value = '';
  const prev = document.getElementById('editFotoPreview');
  if (prev) prev.src = sanitizarUrlImagem(AppState.usuario.foto, PLACEHOLDERS.AVATAR_SVG, false);
  toggleModal('configModal', true);
}

function previewFotoPerfil(e) {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  if (!arquivo.type.startsWith('image/')) {
    mostrarToast('Escolha uma imagem válida da sua galeria.', 'alerta');
    return;
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    mostrarToast('Imagem muito grande. Máximo 5MB.', 'alerta');
    return;
  }
  const prev = document.getElementById('editFotoPreview');
  if (prev) prev.src = URL.createObjectURL(arquivo);
}

function redimensionarImagem(file, max = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagem inválida'));
    };
    img.src = url;
  });
}

function garantirZonaPerigoPerfil() {
  if (document.querySelector('.profile-danger-zone') || !AppState.usuario.logado) return;
  const secao = document.querySelector('.profile-section');
  if (!secao) return;
  const zona = document.createElement('div');
  zona.className = 'profile-danger-zone';
  zona.innerHTML = '<h3>Zona de Perigo</h3><button type="button" class="btn-danger" onclick="solicitarExclusaoConta()"><i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir Minha Conta</button>';
  secao.appendChild(zona);
}

function solicitarExclusaoConta() {
  abrirConfirmacao(
    'Excluir Conta',
    'Esta ação é irreversível. Todos os seus dados serão perdidos. Deseja continuar?',
    async () => {
      if (!AppState.supabase || !AppState.usuario.logado) return;
      try {
        const { error } = await AppState.supabase.from('account_deletion_requests').insert({
          user_id: AppState.usuario.id,
          requested_at: new Date().toISOString()
        });
        if (error) throw error;
        mostrarToast('Solicitação enviada. Sua conta será excluída em até 30 dias.', 'info', 8000);
        fazerLogout();
      } catch (err) {
        console.error('[SolitudeScan] Erro ao solicitar exclusão:', err);
        mostrarToast('Falha ao processar solicitação.', 'erro');
      }
    }
  );
}

async function carregarObras() {
  if (!AppState.supabase) {
    mostrarToast('Sistema offline. Algumas funcionalidades podem estar limitadas.', 'alerta', 5000);
    renderizarCatalogo();
    return;
  }
  try {
    const { data, error } = await AppState.supabase
      .from('works')
      .select('*, genres:work_genres(genres(name)), chapters(count)')
      .order('updated_at', { ascending: false });
    if (error) throw error;

    AppState.catalogo.obrasRemotas = (data || []).map(obra => ({
      id: obra.id,
      titulo: obra.title || 'Sem título',
      capa: obra.cover_url || PLACEHOLDERS.CAPA_PLACEHOLDER,
      autor: obra.author || 'Desconhecido',
      artista: obra.artist || obra.author || 'Desconhecido',
      status: obra.status || 'Em Lançamento',
      generos: (obra.genres || []).map(g => g.genres?.name || g.name).filter(Boolean),
      sinopse: obra.synopsis || 'Sinopse não disponível.',
      tipo: obra.type || 'Manhwa',
      visualizacoes: Number(obra.views) || 0,
      curtidas: Number(obra.likes_count) || 0,
      avaliacao: Number(obra.rating_avg ?? obra.rating) || 0,
      totalAvaliacoes: Number(obra.rating_count) || 0,
      totalCapitulos: obra.chapters?.[0]?.count || 0,
      atualizadoEm: obra.updated_at,
      criadoEm: obra.created_at,
      exclusivo: !!obra.is_vip,
      adulto: !!obra.is_adult,
      destaque: !!obra.is_featured
    }));

    aplicarOverridesLocais();
    popularFiltroGeneros();
    renderizarCatalogo();
    renderizarHeroBanner();
    renderizarTendencias();
    renderizarRanking();
    renderizarContinueLendo();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar obras:', err);
    mostrarToast('Falha ao carregar o catálogo. Tente recarregar a página.', 'erro', 6000);
  }
}

function aplicarOverridesLocais() {
  const removidas = lerLocal('solitude_obras_removidas', []);
  if (Array.isArray(removidas) && removidas.length) {
    AppState.catalogo.obrasRemotas = AppState.catalogo.obrasRemotas.filter(o => !removidas.includes(String(o.id)));
  }
}

function popularFiltroGeneros() {
  const select = document.getElementById('generoFiltro');
  if (!select) return;
  const generos = new Set();
  AppState.catalogo.obrasRemotas.forEach(o => (o.generos || []).forEach(g => generos.add(g)));
  select.innerHTML = '<option value="Todos">Todos os Gêneros</option>';
  [...generos].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    select.appendChild(opt);
  });
  select.value = generos.has(AppState.catalogo.generoAtual) ? AppState.catalogo.generoAtual : 'Todos';
}

function renderizarCatalogo() {
  const container = document.getElementById('mangaContainer');
  if (!container) return;
  const c = AppState.catalogo;
  let obras = [...c.obrasRemotas];

  if (c.generoAtual !== 'Todos') obras = obras.filter(o => (o.generos || []).includes(c.generoAtual));
  if (c.statusFiltro !== 'Todos') obras = obras.filter(o => o.status === c.statusFiltro);
  if (!AppState.usuario.isAdmin) obras = obras.filter(o => !o.adulto);
  if (c.termoBusca) {
    const termo = c.termoBusca.toLowerCase();
    obras = obras.filter(o =>
      o.titulo.toLowerCase().includes(termo) ||
      o.autor.toLowerCase().includes(termo) ||
      (o.artista || '').toLowerCase().includes(termo) ||
      (o.sinopse || '').toLowerCase().includes(termo)
    );
  }

  switch (c.ordemFiltro) {
    case 'populares': obras.sort((a, b) => b.visualizacoes - a.visualizacoes); break;
    case 'avaliados': obras.sort((a, b) => b.avaliacao - a.avaliacao); break;
    case 'titulo': obras.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')); break;
    case 'capitulos': obras.sort((a, b) => b.totalCapitulos - a.totalCapitulos); break;
    default: obras.sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0));
  }

  if (!obras.length) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book-open" aria-hidden="true"></i><p>Nenhuma obra encontrada com os filtros aplicados.</p><button type="button" class="btn-secondary" onclick="limparFiltros()">Limpar Filtros</button></div>';
    return;
  }
  container.innerHTML = obras.map(criarCardObra).join('');
}

function criarCardObra(obra) {
  const generos = (obra.generos || []).slice(0, 2).map(g => '<span class="genre-tag">' + escaparHtml(g) + '</span>').join('');
  const exclusivo = obra.exclusivo ? '<span class="exclusive-badge"><i class="fa-solid fa-star" aria-hidden="true"></i> Exclusivo</span>' : '';
  const adulto = obra.adulto ? '<span class="adult-badge">+18</span>' : '';
  const statusClass = 'status-' + String(obra.status || '').toLowerCase().replace(/\s+/g, '-');
  const id = escaparHtml(obra.id);
  return `
    <article class="manga-card" data-id="${id}" onclick="abrirDetalhesObra('${id}')" role="listitem" tabindex="0">
      <div class="manga-cover">
        <img src="${sanitizarUrlImagem(obra.capa, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="Capa de ${escaparHtml(obra.titulo)}" loading="lazy" decoding="async">
        ${exclusivo}${adulto}
        <div class="manga-overlay">
          <span class="chapter-count"><i class="fa-solid fa-book" aria-hidden="true"></i> ${obra.totalCapitulos || 0} cap.</span>
          <span class="view-count"><i class="fa-solid fa-eye" aria-hidden="true"></i> ${formatarNumero(obra.visualizacoes)}</span>
        </div>
      </div>
      <div class="manga-info">
        <h3 class="manga-title">${escaparHtml(obra.titulo)}</h3>
        <div class="manga-meta">
          <span class="manga-status ${statusClass}">${escaparHtml(obra.status)}</span>
          <span class="manga-rating"><i class="fa-solid fa-star" aria-hidden="true"></i> ${Number(obra.avaliacao || 0).toFixed(1)}</span>
        </div>
        <div class="manga-genres">${generos}</div>
      </div>
    </article>`;
}

function limparFiltros() {
  Object.assign(AppState.catalogo, { generoAtual: 'Todos', statusFiltro: 'Todos', termoBusca: '', ordemFiltro: 'recentes' });
  const valores = { generoFiltro: 'Todos', statusFiltro: 'Todos', ordemFiltro: 'recentes', searchInput: '' };
  Object.entries(valores).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  });
  renderizarCatalogo();
  mostrarToast('Filtros limpos.', 'info', 2000);
}

function inicializarBusca() {
  const input = document.getElementById('searchInput');
  if (input) {
    const buscar = debounce(valor => {
      AppState.catalogo.termoBusca = valor;
      renderizarCatalogo();
    }, 300);
    input.addEventListener('input', e => buscar(e.target.value.trim()));
    input.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      input.value = '';
      AppState.catalogo.termoBusca = '';
      renderizarCatalogo();
      input.blur();
    });
  }
  [['generoFiltro', 'generoAtual'], ['statusFiltro', 'statusFiltro'], ['ordemFiltro', 'ordemFiltro']].forEach(([id, chave]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => {
      AppState.catalogo[chave] = e.target.value;
      renderizarCatalogo();
    });
  });
}

function renderizarHeroBanner() {
  const track = document.getElementById('heroTrack');
  if (!track) return;

  let destaques = AppState.catalogo.obrasRemotas.filter(o => (o.destaque || o.exclusivo) && !o.adulto).slice(0, 5);
  if (destaques.length < 3) {
    const extras = AppState.catalogo.obrasRemotas
      .filter(o => !destaques.includes(o) && !o.adulto)
      .sort((a, b) => b.visualizacoes - a.visualizacoes)
      .slice(0, 5 - destaques.length);
    destaques = [...destaques, ...extras];
  }

  if (!destaques.length) {
    track.innerHTML = '';
    clearInterval(AppState.hero.interval);
    return;
  }

  AppState.hero.obras = destaques;
  AppState.hero.indice = 0;

  track.innerHTML = destaques.map((obra, i) => {
    const id = escaparHtml(obra.id);
    const sinopse = obra.sinopse || '';
    return `
      <div class="hero-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img src="${sanitizarUrlImagem(obra.capa, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="${escaparHtml(obra.titulo)}" class="hero-bg" loading="${i === 0 ? 'eager' : 'lazy'}">
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <div class="hero-badges">
            ${obra.exclusivo ? '<span class="hero-badge exclusive"><i class="fa-solid fa-star" aria-hidden="true"></i> Exclusivo</span>' : ''}
            ${obra.destaque ? '<span class="hero-badge featured"><i class="fa-solid fa-fire" aria-hidden="true"></i> Destaque</span>' : ''}
          </div>
          <h2 class="hero-title">${escaparHtml(obra.titulo)}</h2>
          <p class="hero-description">${escaparHtml(sinopse.substring(0, 180))}${sinopse.length > 180 ? '...' : ''}</p>
          <div class="hero-meta">
            <span><i class="fa-solid fa-star" aria-hidden="true"></i> ${Number(obra.avaliacao).toFixed(1)}</span>
            <span><i class="fa-solid fa-book" aria-hidden="true"></i> ${obra.totalCapitulos || 0} capítulos</span>
            <span><i class="fa-solid fa-eye" aria-hidden="true"></i> ${formatarNumero(obra.visualizacoes)}</span>
          </div>
          <div class="hero-actions">
            <button type="button" class="btn-primary" onclick="abrirDetalhesObra('${id}')"><i class="fa-solid fa-book-open" aria-hidden="true"></i> Ler Agora</button>
            <button type="button" class="btn-secondary" onclick="abrirDetalhesObra('${id}')"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Detalhes</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const slider = document.querySelector('.hero-slider');
  let indicadores = document.querySelector('.hero-indicators');
  if (!indicadores && slider) {
    indicadores = document.createElement('div');
    indicadores.className = 'hero-indicators';
    slider.appendChild(indicadores);
  }
  if (indicadores) {
    indicadores.innerHTML = destaques.map((_, i) =>
      `<button type="button" class="hero-indicator ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Ir para slide ${i + 1}"></button>`
    ).join('');
    indicadores.querySelectorAll('.hero-indicator').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState.hero.indice = parseInt(btn.dataset.index, 10);
        atualizarHeroSlide();
        iniciarAutoRotateHero();
      });
    });
  }
  iniciarAutoRotateHero();
}

function iniciarAutoRotateHero() {
  clearInterval(AppState.hero.interval);
  AppState.hero.interval = setInterval(() => {
    if (AppState.hero.obras.length <= 1 || document.hidden) return;
    AppState.hero.indice = (AppState.hero.indice + 1) % AppState.hero.obras.length;
    atualizarHeroSlide();
  }, 6000);
}

function atualizarHeroSlide() {
  document.querySelectorAll('.hero-slide').forEach((s, i) => s.classList.toggle('active', i === AppState.hero.indice));
  document.querySelectorAll('.hero-indicator').forEach((b, i) => b.classList.toggle('active', i === AppState.hero.indice));
}

function ativarSwipeHero() {
  const track = document.getElementById('heroTrack');
  if (!track) return;
  let startX = 0, startY = 0;

  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  track.addEventListener('touchend', e => {
    const toque = e.changedTouches[0];
    if (!toque) return;
    const diffX = startX - toque.clientX;
    const diffY = Math.abs(startY - toque.clientY);
    if (Math.abs(diffX) < 50 || Math.abs(diffX) <= diffY) return;
    const total = AppState.hero.obras.length;
    if (diffX > 0 && AppState.hero.indice < total - 1) AppState.hero.indice++;
    else if (diffX < 0 && AppState.hero.indice > 0) AppState.hero.indice--;
    atualizarHeroSlide();
    iniciarAutoRotateHero();
  }, { passive: true });
}

function renderizarTendencias() {
  const container = document.getElementById('tendenciasContainer');
  if (!container) return;
  const lista = [...AppState.catalogo.obrasRemotas]
    .filter(o => !o.adulto)
    .sort((a, b) => b.visualizacoes - a.visualizacoes)
    .slice(0, 6);
  container.innerHTML = lista.length
    ? lista.map(criarCardObra).join('')
    : '<div class="empty-state"><p>Nenhuma tendência disponível.</p></div>';
}

function renderizarRanking() {
  const container = document.getElementById('rankingContainer');
  if (!container) return;
  const lista = [...AppState.catalogo.obrasRemotas]
    .filter(o => !o.adulto)
    .sort((a, b) => b.avaliacao - a.avaliacao)
    .slice(0, 10);

  if (!lista.length) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma obra avaliada ainda.</p></div>';
    return;
  }
  container.innerHTML = lista.map((obra, i) => {
    const medalha = ['🥇', '🥈', '🥉'][i] || '#' + (i + 1);
    const id = escaparHtml(obra.id);
    return `
      <div class="ranking-item" onclick="abrirDetalhesObra('${id}')" tabindex="0" role="listitem">
        <span class="ranking-position">${medalha}</span>
        <img src="${sanitizarUrlImagem(obra.capa, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="${escaparHtml(obra.titulo)}" class="ranking-cover" loading="lazy">
        <div class="ranking-info">
          <h4 class="ranking-title">${escaparHtml(obra.titulo)}</h4>
          <div class="ranking-meta">
            <span><i class="fa-solid fa-star" aria-hidden="true"></i> ${Number(obra.avaliacao).toFixed(1)}</span>
            <span><i class="fa-solid fa-eye" aria-hidden="true"></i> ${formatarNumero(obra.visualizacoes)}</span>
            <span><i class="fa-solid fa-book" aria-hidden="true"></i> ${obra.totalCapitulos || 0} cap.</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderizarContinueLendo() {
  const secao = document.getElementById('continueLendoSection');
  const container = document.getElementById('continueLendoContainer');
  if (!secao || !container) return;

  const obras = AppState.usuario.historico.slice(0, 6).map(h => {
    const obra = encontrarObraPorId(h.obraId);
    return obra ? { ...obra, ultimoCapitulo: h.capitulo, dataLeitura: h.data } : null;
  }).filter(Boolean);

  if (!obras.length) {
    secao.style.display = 'none';
    return;
  }
  secao.style.display = 'block';
  container.innerHTML = obras.map(obra => {
    const id = escaparHtml(obra.id);
    return `
      <article class="manga-card continue-reading" data-id="${id}" onclick="continuarLeitura('${id}')" tabindex="0" role="listitem">
        <div class="manga-cover">
          <img src="${sanitizarUrlImagem(obra.capa, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="${escaparHtml(obra.titulo)}" loading="lazy">
          <div class="continue-badge"><i class="fa-solid fa-bookmark" aria-hidden="true"></i> Cap. ${escaparHtml(obra.ultimoCapitulo)}</div>
          <div class="continue-date">${dataRelativa(obra.dataLeitura)}</div>
        </div>
        <div class="manga-info">
          <h3 class="manga-title">${escaparHtml(obra.titulo)}</h3>
          <p class="continue-text"><i class="fa-solid fa-play" aria-hidden="true"></i> Continuar lendo</p>
        </div>
      </article>`;
  }).join('');
}

function continuarLeitura(obraId) {
  abrirDetalhesObra(obraId);
}

function abrirDetalhesObra(obraId) {
  const obra = encontrarObraPorId(obraId);
  if (!obra) {
    mostrarToast('Obra não encontrada.', 'erro');
    return;
  }

  const modal = document.getElementById('detalhesModal');
  const body = document.getElementById('detalhesModalBody');
  const titulo = document.getElementById('detalhesModalTitle');
  if (!modal || !body || !titulo) return;

  AppState.leitor.obraAtualId = String(obra.id);
  AppState.leitor.capitulosObraAtual = [];
  AppState.leitor.indiceCapituloAtual = 0;
  obra.visualizacoes = (obra.visualizacoes || 0) + 1;
  atualizarMetaTagsDinamicas(obra);

  titulo.textContent = obra.titulo;
  const id = escaparHtml(obra.id);
  const generos = (obra.generos || []).map(g => '<span class="genre-tag">' + escaparHtml(g) + '</span>').join('');
  const nota = Math.round(obra.avaliacao || 0);
  const estrelas = [1, 2, 3, 4, 5].map(n =>
    `<i class="fa-star ${n <= nota ? 'fa-solid' : 'fa-regular'}" role="button" tabindex="0" style="cursor:pointer;" aria-label="Avaliar com ${n} estrelas" onclick="avaliarObra('${id}', ${n})"></i>`
  ).join('');

  const formComentario = AppState.usuario.logado
    ? `<div class="comentario-form">
        <textarea id="comentarioInput" placeholder="Escreva seu comentário..." maxlength="${CONFIG.MAX_COMENTARIO_LENGTH}"></textarea>
        <div class="comentario-form-actions">
          <label class="checkbox-spoiler"><input type="checkbox" id="comentarioSpoiler"><span>Contém spoiler</span></label>
          <button type="button" class="btn-primary small" onclick="enviarComentario('${id}')">Publicar</button>
        </div>
      </div>`
    : '<p class="login-prompt"><a href="#" onclick="fazerLogin(); return false;">Faça login</a> para comentar.</p>';

  body.innerHTML = `
    <div class="obra-detalhes">
      <div class="obra-capa-grande"><img src="${sanitizarUrlImagem(obra.capa, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="${escaparHtml(obra.titulo)}"></div>
      <div class="obra-info">
        <h2>${escaparHtml(obra.titulo)}</h2>
        <div class="obra-meta">
          <p><strong>Autor:</strong> ${escaparHtml(obra.autor)}</p>
          <p><strong>Artista:</strong> ${escaparHtml(obra.artista)}</p>
          <p><strong>Status:</strong> <span class="status-badge status-${escaparHtml(String(obra.status).toLowerCase().replace(/\s+/g, '-'))}">${escaparHtml(obra.status)}</span></p>
          <p><strong>Tipo:</strong> ${escaparHtml(obra.tipo)}</p>
          <p><strong>Capítulos:</strong> ${obra.totalCapitulos || 0}</p>
          <p><strong>Visualizações:</strong> ${formatarNumero(obra.visualizacoes)}</p>
        </div>
        <div class="obra-avaliacao">
          <div class="stars-container">${estrelas}</div>
          <span>${Number(obra.avaliacao || 0).toFixed(1)} (${obra.totalAvaliacoes || 0} avaliações)</span>
        </div>
        <div class="obra-generos">${generos}</div>
        <div class="obra-sinopse"><h3>Sinopse</h3><p>${escaparHtml(obra.sinopse)}</p></div>
        <div class="obra-comentarios-section">
          <h3>Comentários</h3>
          <div id="comentariosContainer" class="comentarios-container"><p>Carregando comentários...</p></div>
          ${formComentario}
        </div>
      </div>
    </div>`;

  atualizarBotaoFavorito();
  garantirCheckboxSpoiler();
  carregarCapitulosObra(obra.id);
  carregarComentarios(obra.id).then(() => renderizarComentarios(obra.id));
  toggleModal('detalhesModal', true);
}

function atualizarBotaoFavorito() {
  const btn = document.getElementById('btnFavoritar');
  if (!btn) return;
  const favorito = AppState.usuario.favoritos.includes(String(AppState.leitor.obraAtualId));
  btn.setAttribute('aria-pressed', favorito ? 'true' : 'false');
  btn.innerHTML = favorito
    ? '<i class="fa-solid fa-heart" aria-hidden="true"></i> Remover dos Favoritos'
    : '<i class="fa-regular fa-heart" aria-hidden="true"></i> Favoritar';
}

async function carregarCapitulosObra(obraId) {
  if (!AppState.supabase) return;
  try {
    const { data, error } = await AppState.supabase
      .from('chapters')
      .select('id, chapter_number, title, created_at, is_vip')
      .eq('work_id', obraId)
      .eq('is_published', true)
      .order('chapter_number', { ascending: true });
    if (error) throw error;
    if (String(obraId) !== String(AppState.leitor.obraAtualId)) return;

    AppState.leitor.capitulosObraAtual = (data || []).map(cap => ({
      id: cap.id,
      numero: cap.chapter_number,
      titulo: cap.title || 'Capítulo ' + cap.chapter_number,
      criadoEm: cap.created_at,
      vipOnly: !!cap.is_vip
    }));
    renderizarListaCapitulos();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar capítulos:', err);
  }
}

function renderizarListaCapitulos() {
  const select = document.getElementById('listaCapitulosContainer');
  if (!select) return;
  let itens = AppState.leitor.capitulosObraAtual.map((cap, indice) => ({ cap, indice }));
  if (AppState.leitor.ordemInvertida) itens.reverse();

  select.innerHTML = '';
  itens.forEach(({ cap, indice }) => {
    const opt = document.createElement('option');
    opt.value = String(indice);
    opt.textContent = (cap.vipOnly ? '👑 ' : '') + cap.titulo;
    select.appendChild(opt);
  });
  select.value = String(AppState.leitor.indiceCapituloAtual);
  select.onchange = e => abrirLeitor(parseInt(e.target.value, 10));
}

function enviarComentario(obraId) {
  const input = document.getElementById('comentarioInput');
  const spoiler = document.getElementById('comentarioSpoiler');
  if (!input) return;
  adicionarComentario(obraId, input.value.trim(), AppState.comentarios.responderAComentarioId, spoiler ? spoiler.checked : false)
    .then(ok => {
      if (!ok) return;
      input.value = '';
      input.placeholder = 'Escreva seu comentário...';
      if (spoiler) spoiler.checked = false;
    });
}

function abrirModalVip() {
  fecharTodosModais();
  switchTab('tab-vip');
}

async function abrirLeitor(capituloIndex = 0) {
  if (!AppState.leitor.obraAtualId) {
    mostrarToast('Selecione uma obra primeiro.', 'alerta');
    return;
  }
  const indice = Number.isInteger(capituloIndex) ? capituloIndex : 0;
  const capitulo = AppState.leitor.capitulosObraAtual[indice];
  if (!capitulo) {
    mostrarToast('Capítulo não encontrado.', 'erro');
    return;
  }
  if (capitulo.vipOnly && !AppState.usuario.isVip && !AppState.usuario.isAdmin) {
    mostrarToast('Este capítulo é exclusivo para membros VIP. Assine para acessar.', 'alerta', 6000);
    abrirModalVip();
    return;
  }

  AppState.leitor.indiceCapituloAtual = indice;
  toggleModal('detalhesModal', false);

  const titulo = document.getElementById('readerTitle');
  if (titulo) {
    const obra = encontrarObraPorId(AppState.leitor.obraAtualId);
    titulo.textContent = (obra ? obra.titulo + ' — ' : '') + capitulo.titulo;
  }

  toggleModal('readerModal', true);
  atualizarBotoesNavegacao();
  await carregarPaginasCapitulo(capitulo.id);
  salvarNoHistorico(AppState.leitor.obraAtualId, capitulo.numero);
}

async function carregarPaginasCapitulo(capituloId) {
  const container = document.getElementById('readerCascataContainer');
  if (!container) return;
  const carga = (AppState.leitor.cargaId = (AppState.leitor.cargaId || 0) + 1);

  container.innerHTML = '<div class="reader-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Carregando páginas...</div>';
  if (!AppState.supabase) {
    container.innerHTML = '<div class="reader-error">Sistema offline. Não foi possível carregar as páginas.</div>';
    return;
  }

  try {
    const { data, error } = await AppState.supabase
      .from('pages')
      .select('id, image_url, page_number')
      .eq('chapter_id', capituloId)
      .order('page_number', { ascending: true });
    if (error) throw error;
    if (carga !== AppState.leitor.cargaId) return;

    if (!data || !data.length) {
      container.innerHTML = '<div class="reader-empty"><i class="fa-solid fa-image" aria-hidden="true"></i><p>Nenhuma página disponível neste capítulo.</p></div>';
      return;
    }

    const comUrl = await Promise.all(data.map(async p => ({ ...p, signed_url: await criarUrlAssinadaPagina(p.image_url) })));
    if (carga !== AppState.leitor.cargaId) return;

    let paginas = comUrl.filter(p => p.signed_url);
    if (AppState.leitor.ordemInvertida) paginas.reverse();

    if (!paginas.length) {
      container.innerHTML = '<div class="reader-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><p>Não foi possível autorizar as páginas deste capítulo.</p></div>';
      return;
    }

    container.innerHTML = paginas.map((p, i) =>
      `<img src="${p.signed_url}" alt="Página ${p.page_number}" class="reader-page" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async" data-page="${p.page_number}">`
    ).join('');
    container.scrollTop = 0;
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar páginas:', err);
    if (carga === AppState.leitor.cargaId) {
      container.innerHTML = '<div class="reader-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><p>Falha ao carregar as páginas. Tente novamente.</p></div>';
    }
  }
}

function resetarZoomLeitor() {
  AppState.leitor.nivelZoom = 100;
  const container = document.getElementById('readerCascataContainer');
  if (container) container.style.transform = '';
  const zoom = document.getElementById('zoomLevel');
  if (zoom) zoom.textContent = '100%';
}

function fecharLeitor() {
  toggleModal('readerModal', false);
  AppState.leitor.modoImersivo = false;
  AppState.leitor.cargaId = (AppState.leitor.cargaId || 0) + 1;
  const reader = document.getElementById('readerModal');
  if (reader) reader.classList.remove('immersive');
  resetarZoomLeitor();
}

function navegarCapitulo(direcao) {
  const novo = AppState.leitor.indiceCapituloAtual + direcao;
  if (novo < 0 || novo >= AppState.leitor.capitulosObraAtual.length) {
    mostrarToast(direcao > 0 ? 'Este é o último capítulo disponível.' : 'Este é o primeiro capítulo.', 'info');
    return;
  }
  abrirLeitor(novo);
}

function atualizarBotoesNavegacao() {
  const anterior = document.getElementById('btnCapituloAnterior');
  const proximo = document.getElementById('btnProximoCapitulo');
  const select = document.getElementById('listaCapitulosContainer');
  const ultimo = AppState.leitor.capitulosObraAtual.length - 1;
  if (anterior) anterior.disabled = AppState.leitor.indiceCapituloAtual <= 0;
  if (proximo) proximo.disabled = AppState.leitor.indiceCapituloAtual >= ultimo;
  if (select) select.value = String(AppState.leitor.indiceCapituloAtual);
}

function aplicarZoom(nivel) {
  AppState.leitor.nivelZoom = Math.max(50, Math.min(200, nivel));
  const container = document.getElementById('readerCascataContainer');
  if (container) {
    container.style.transform = `scale(${AppState.leitor.nivelZoom / 100})`;
    container.style.transformOrigin = 'top center';
  }
  const zoom = document.getElementById('zoomLevel');
  if (zoom) zoom.textContent = AppState.leitor.nivelZoom + '%';
}

function ajustarZoom(delta) {
  aplicarZoom(AppState.leitor.nivelZoom + delta);
}

function alternarModoImersivo() {
  AppState.leitor.modoImersivo = !AppState.leitor.modoImersivo;
  const reader = document.getElementById('readerModal');
  if (reader) reader.classList.toggle('immersive', AppState.leitor.modoImersivo);
  mostrarToast(AppState.leitor.modoImersivo ? 'Modo imersivo ativado.' : 'Modo imersivo desativado.', 'info', 2000);
}

function inverterOrdemCapitulos() {
  AppState.leitor.ordemInvertida = !AppState.leitor.ordemInvertida;
  AppState.ui.ordemCapitulosInvertida = AppState.leitor.ordemInvertida;
  renderizarListaCapitulos();
  const capitulo = AppState.leitor.capitulosObraAtual[AppState.leitor.indiceCapituloAtual];
  if (capitulo) carregarPaginasCapitulo(capitulo.id);
  mostrarToast(AppState.leitor.ordemInvertida ? 'Ordem invertida.' : 'Ordem normal.', 'info', 2000);
}

function iniciarGestosLeitor() {
  const reader = document.getElementById('readerModal');
  if (!reader) return;
  let startX = 0, startY = 0, distanciaInicial = 0, zoomInicial = 100, pinca = false, ultimoToque = 0;

  const distancia = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  reader.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      pinca = true;
      distanciaInicial = distancia(e.touches);
      zoomInicial = AppState.leitor.nivelZoom;
    }
  }, { passive: true });

  reader.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !distanciaInicial) return;
    e.preventDefault();
    aplicarZoom(Math.round(zoomInicial * (distancia(e.touches) / distanciaInicial)));
  }, { passive: false });

  reader.addEventListener('touchend', e => {
    if (e.touches.length > 0) return;
    if (pinca) {
      pinca = false;
      return;
    }
    const toque = e.changedTouches[0];
    const diffX = startX - toque.clientX;
    if (Math.abs(diffX) > 100 && Math.abs(diffX) > Math.abs(startY - toque.clientY)) {
      navegarCapitulo(diffX > 0 ? 1 : -1);
      return;
    }
    const agora = Date.now();
    const intervalo = agora - ultimoToque;
    if (intervalo > 0 && intervalo < 300) {
      aplicarZoom(AppState.leitor.nivelZoom === 100 ? 150 : 100);
    }
    ultimoToque = agora;
  });
}

function iniciarAtalhosTecladoLeitor() {
  document.addEventListener('keydown', e => {
    const reader = document.getElementById('readerModal');
    if (!reader || !reader.classList.contains('active')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); navegarCapitulo(1); break;
      case 'ArrowLeft': e.preventDefault(); navegarCapitulo(-1); break;
      case '+':
      case '=': e.preventDefault(); ajustarZoom(10); break;
      case '-': e.preventDefault(); ajustarZoom(-10); break;
      case '0': e.preventDefault(); resetarZoomLeitor(); break;
      case 'Escape': fecharLeitor(); break;
      case 'f':
      case 'F': e.preventDefault(); alternarModoImersivo(); break;
      case 'r':
      case 'R': e.preventDefault(); inverterOrdemCapitulos(); break;
    }
  });
}

function injetarEstiloAutoImersivo() {
  if (document.getElementById('estiloLeitorImersivo')) return;
  const style = document.createElement('style');
  style.id = 'estiloLeitorImersivo';
  style.textContent = `
    .reader-modal.immersive .reader-header,
    .reader-modal.immersive .reader-footer { opacity: 0; pointer-events: none; transition: opacity .3s ease; }
    .reader-modal.immersive:hover .reader-header,
    .reader-modal.immersive:hover .reader-footer { opacity: 1; pointer-events: auto; }
    .reader-modal.immersive .reader-content { padding: 0; }
  `;
  document.head.appendChild(style);
}

async function carregarFavoritosRemotos(userId) {
  if (!AppState.supabase) return;
  try {
    const { data, error } = await AppState.supabase.from('favorites').select('work_id').eq('user_id', userId);
    if (error) throw error;
    const remotos = (data || []).map(f => String(f.work_id));
    AppState.usuario.favoritos = [...new Set([...AppState.usuario.favoritos, ...remotos])];
    localStorage.setItem('solitude_favoritos', JSON.stringify(AppState.usuario.favoritos));
    const locais = AppState.usuario.favoritos.filter(id => !remotos.includes(id) && ehUuid(id));
    if (locais.length) {
      await AppState.supabase.from('favorites').insert(locais.map(work_id => ({ user_id: userId, work_id })));
    }
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar favoritos:', err);
  }
}

async function alternarFavorito() {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para favoritar obras.', 'alerta');
    fazerLogin();
    return;
  }
  if (!AppState.leitor.obraAtualId) return;

  const obraId = String(AppState.leitor.obraAtualId);
  const lista = AppState.usuario.favoritos;
  const indice = lista.indexOf(obraId);
  const removendo = indice > -1;

  if (removendo) {
    lista.splice(indice, 1);
    mostrarToast('Obra removida dos favoritos.', 'info');
  } else {
    lista.push(obraId);
    mostrarToast('Obra adicionada aos favoritos!', 'sucesso');
  }
  localStorage.setItem('solitude_favoritos', JSON.stringify(lista));
  atualizarBotaoFavorito();

  if (AppState.supabase && ehUuid(obraId)) {
    try {
      if (removendo) {
        await AppState.supabase.from('favorites').delete().eq('user_id', AppState.usuario.id).eq('work_id', obraId);
      } else {
        await AppState.supabase.from('favorites').insert({ user_id: AppState.usuario.id, work_id: obraId });
      }
    } catch (err) {
      console.error('[SolitudeScan] Erro ao sincronizar favorito:', err);
    }
  }
}

function carregarFavoritosUsuario() {
  const container = document.getElementById('favoritosContainer');
  if (!container) return;
  const obras = AppState.usuario.favoritos.map(encontrarObraPorId).filter(Boolean);
  container.innerHTML = obras.length
    ? obras.map(criarCardObra).join('')
    : '<div class="empty-state"><i class="fa-regular fa-heart" aria-hidden="true"></i><p>Você ainda não favoritou nenhuma obra.</p><p class="empty-hint">Explore o catálogo e clique no coração para salvar suas obras preferidas.</p></div>';
}

function salvarNoHistorico(obraId, capituloNumero) {
  const id = String(obraId);
  const entrada = { obraId: id, capitulo: capituloNumero, data: new Date().toISOString() };
  AppState.usuario.historico = [entrada, ...AppState.usuario.historico.filter(h => String(h.obraId) !== id)]
    .slice(0, CONFIG.MAX_HISTORICO_ITEMS);
  localStorage.setItem('solitude_historico', JSON.stringify(AppState.usuario.historico));
  renderizarContinueLendo();
}

function carregarHistoricoUsuario() {
  const container = document.getElementById('historicoContainer');
  if (!container) return;
  const obras = AppState.usuario.historico.map(h => {
    const obra = encontrarObraPorId(h.obraId);
    return obra ? { ...obra, ultimoCapitulo: h.capitulo, dataLeitura: h.data } : null;
  }).filter(Boolean);

  if (!obras.length) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><p>Seu histórico de leitura está vazio.</p><p class="empty-hint">Comece a ler e seu histórico aparecerá aqui.</p></div>';
    return;
  }
  container.innerHTML = obras.map(obra => {
    const id = escaparHtml(obra.id);
    return `
      <article class="manga-card" data-id="${id}" onclick="continuarLeitura('${id}')" tabindex="0" role="listitem">
        <div class="manga-cover">
          <img src="${sanitizarUrlImagem(obra.capa, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="${escaparHtml(obra.titulo)}" loading="lazy">
          <div class="continue-badge"><i class="fa-solid fa-bookmark" aria-hidden="true"></i> Cap. ${escaparHtml(obra.ultimoCapitulo)}</div>
        </div>
        <div class="manga-info">
          <h3 class="manga-title">${escaparHtml(obra.titulo)}</h3>
          <p class="continue-text"><i class="fa-solid fa-play" aria-hidden="true"></i> Continuar lendo</p>
          <p class="continue-date">${dataRelativa(obra.dataLeitura)}</p>
        </div>
      </article>`;
  }).join('');
}

function limparHistorico() {
  abrirConfirmacao(
    'Limpar Histórico',
    'Tem certeza que deseja limpar todo o seu histórico de leitura? Esta ação não pode ser desfeita.',
    () => {
      AppState.usuario.historico = [];
      localStorage.setItem('solitude_historico', '[]');
      renderizarContinueLendo();
      carregarHistoricoUsuario();
      mostrarToast('Histórico limpo com sucesso.', 'sucesso');
    }
  );
}

function atualizarIconeTema() {
  const icone = document.getElementById('iconeTemaBotao');
  if (icone) icone.className = document.documentElement.classList.contains('light') ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

function alternarTema() {
  const html = document.documentElement;
  const claro = html.classList.contains('light');
  html.classList.toggle('light', !claro);
  html.classList.toggle('dark', claro);
  try { localStorage.setItem('solitude_theme', claro ? 'dark' : 'light'); } catch (e) {}
  atualizarIconeTema();
  mostrarToast(claro ? 'Tema escuro ativado.' : 'Tema claro ativado.', 'info', 2000);
}

function aplicarTemaAutomatico() {
  const html = document.documentElement;
  let salvo = null;
  try { salvo = localStorage.getItem('solitude_theme'); } catch (e) {}
  let tema = salvo;
  if (!tema) {
    const h = new Date().getHours();
    tema = h >= 18 || h < 6 ? 'dark' : 'light';
  }
  html.classList.toggle('dark', tema === 'dark');
  html.classList.toggle('light', tema === 'light');
}

function inicializarBotaoTema() {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.addEventListener('click', alternarTema);
  atualizarIconeTema();
}

function aceitarCookies() {
  try { localStorage.setItem('solitude_cookies_ok', '1'); } catch (e) {}
  const banner = document.getElementById('cookieBanner');
  if (banner) banner.style.display = 'none';
}

function mostrarBannerCookies() {
  try {
    if (localStorage.getItem('solitude_cookies_ok')) return;
  } catch (e) {}
  setTimeout(() => {
    const banner = document.getElementById('cookieBanner');
    if (banner) banner.style.display = 'block';
  }, 2000);
}

function ativarSincronizacaoSessao() {
  if (!AppState.supabase) return;
  try {
    AppState.supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT') {
        if (!AppState.usuario.logado) return;
        Object.assign(AppState.usuario, { logado: false, id: null, isAdmin: false, isVip: false, planoVip: null, vipExpiraEm: null });
        atualizarPerfilTela();
        atualizarVisibilidadeAdmin();
      } else if ((evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED') && sessao && sessao.user && !AppState.usuario.logado) {
        setTimeout(verificarSessaoSupabase, 0);
      }
    });
  } catch (e) {}
}

async function carregarComentarios(obraId) {
  if (!AppState.supabase) return [];
  try {
    const { data, error } = await AppState.supabase
      .from('comments')
      .select('*, profiles:user_id (id, display_name, avatar_url, is_admin)')
      .eq('work_id', obraId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    AppState.comentarios.cache[obraId] = data || [];
    return data || [];
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar comentários:', err);
    AppState.comentarios.cache[obraId] = [];
    return [];
  }
}

async function adicionarComentario(obraId, texto, comentarioPaiId = null, isSpoiler = false) {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para comentar.', 'alerta');
    fazerLogin();
    return false;
  }
  if (!texto) {
    mostrarToast('Digite algo para comentar.', 'alerta');
    return false;
  }
  if (texto.length > CONFIG.MAX_COMENTARIO_LENGTH) {
    mostrarToast('Comentário muito longo. Máximo de ' + CONFIG.MAX_COMENTARIO_LENGTH + ' caracteres.', 'alerta');
    return false;
  }
  const agora = Date.now();
  if (agora - AppState.comentarios.ultimoComentarioEm < CONFIG.RATE_LIMIT_COMENTARIO) {
    mostrarToast('Aguarde alguns segundos antes de comentar novamente.', 'alerta');
    return false;
  }
  if (!AppState.supabase) {
    mostrarToast('Sistema offline.', 'erro');
    return false;
  }

  try {
    const { error } = await AppState.supabase.from('comments').insert({
      work_id: obraId,
      user_id: AppState.usuario.id,
      content: texto,
      parent_id: comentarioPaiId,
      spoiler: isSpoiler
    });
    if (error) throw error;
    AppState.comentarios.ultimoComentarioEm = agora;
    AppState.comentarios.responderAComentarioId = null;
    mostrarToast('Comentário publicado!', 'sucesso');
    await carregarComentarios(obraId);
    renderizarComentarios(obraId);
    return true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao publicar comentário:', err);
    mostrarToast('Falha ao publicar comentário.', 'erro');
    return false;
  }
}

async function curtirComentario(comentarioId, obraId) {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para curtir comentários.', 'alerta');
    return;
  }
  if (!AppState.supabase) return;
  try {
    const { data: existente } = await AppState.supabase
      .from('likes')
      .select('id')
      .eq('user_id', AppState.usuario.id)
      .eq('target_type', 'comment')
      .eq('target_id', comentarioId)
      .maybeSingle();

    if (existente) {
      await AppState.supabase.from('likes').delete().eq('id', existente.id);
      mostrarToast('Curtida removida.', 'info', 2000);
    } else {
      await AppState.supabase.from('likes').insert({ user_id: AppState.usuario.id, target_type: 'comment', target_id: comentarioId });
      mostrarToast('Comentário curtido!', 'sucesso', 2000);
    }
    await carregarComentarios(obraId);
    renderizarComentarios(obraId);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao curtir:', err);
  }
}

function denunciarComentario(comentarioId) {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para denunciar.', 'alerta');
    return;
  }
  abrirConfirmacao(
    'Denunciar Comentário',
    'Tem certeza que deseja denunciar este comentário por conteúdo inadequado? Nossa equipe irá analisar.',
    async () => {
      if (!AppState.supabase) return;
      try {
        const { error } = await AppState.supabase.from('reports').insert({
          reporter_id: AppState.usuario.id,
          user_id: AppState.usuario.id,
          target_type: 'comment',
          target_id: comentarioId,
          status: 'pending',
          created_at: new Date().toISOString()
        });
        if (error) throw error;
        mostrarToast('Denúncia enviada. Nossa equipe irá analisar.', 'sucesso');
      } catch (err) {
        console.error('[SolitudeScan] Erro ao denunciar:', err);
        mostrarToast('Falha ao enviar denúncia.', 'erro');
      }
    }
  );
}

async function excluirComentario(comentarioId, obraId) {
  if (!AppState.supabase || !AppState.usuario.logado) return;
  try {
    let consulta = AppState.supabase.from('comments').delete().eq('id', comentarioId);
    if (!AppState.usuario.isAdmin) consulta = consulta.eq('user_id', AppState.usuario.id);
    const { error } = await consulta;
    if (error) throw error;
    mostrarToast('Comentário excluído.', 'sucesso');
    await carregarComentarios(obraId);
    renderizarComentarios(obraId);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao excluir:', err);
    mostrarToast('Falha ao excluir comentário.', 'erro');
  }
}

function renderizarComentarios(obraId) {
  const container = document.getElementById('comentariosContainer');
  if (!container) return;
  const comentarios = AppState.comentarios.cache[obraId] || [];
  if (!comentarios.length) {
    container.innerHTML = '<div class="empty-state"><i class="fa-regular fa-comment" aria-hidden="true"></i><p>Seja o primeiro a comentar esta obra!</p></div>';
    return;
  }
  const raizes = comentarios.filter(c => !c.parent_id);
  container.innerHTML = raizes.map(c => renderizarComentarioThread(c, comentarios, obraId, 0)).join('');
}

function renderizarComentarioThread(comentario, todos, obraId, nivel) {
  const autor = comentario.profiles || {};
  const id = escaparHtml(comentario.id);
  const obra = escaparHtml(obraId);
  const avatar = sanitizarUrlImagem(autor.avatar_url, PLACEHOLDERS.AVATAR_SVG);
  const podeExcluir = AppState.usuario.logado && (AppState.usuario.id === comentario.user_id || AppState.usuario.isAdmin);
  const adminBadge = autor.is_admin ? '<span class="admin-badge"><i class="fa-solid fa-shield" aria-hidden="true"></i> Admin</span>' : '';
  const spoiler = comentario.spoiler ? '<span class="spoiler-warning"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Spoiler</span> ' : '';
  const respostas = todos.filter(c => c.parent_id === comentario.id)
    .map(r => renderizarComentarioThread(r, todos, obraId, nivel + 1)).join('');

  return `
    <div class="comment-item ${nivel > 0 ? 'comment-reply' : ''} ${comentario.spoiler ? 'spoiler-content' : ''}" data-id="${id}">
      <img src="${avatar}" alt="Avatar" class="comment-avatar" loading="lazy">
      <div class="comment-body">
        <div class="comment-header">
          <strong>${escaparHtml(autor.display_name || 'Usuário')}</strong>
          ${adminBadge}
          <span class="comment-time">${dataRelativa(comentario.created_at)}</span>
        </div>
        <p class="comment-text">${spoiler}${escaparHtml(comentario.content)}</p>
        <div class="comment-actions">
          <button type="button" class="btn-text" onclick="curtirComentario('${id}', '${obra}')"><i class="fa-regular fa-thumbs-up" aria-hidden="true"></i> Curtir</button>
          ${nivel < 3 ? `<button type="button" class="btn-text" onclick="responderComentario('${id}')"><i class="fa-solid fa-reply" aria-hidden="true"></i> Responder</button>` : ''}
          <button type="button" class="btn-text" onclick="denunciarComentario('${id}')"><i class="fa-solid fa-flag" aria-hidden="true"></i> Denunciar</button>
          ${podeExcluir ? `<button type="button" class="btn-text danger" onclick="confirmarExclusaoComentario('${id}', '${obra}')"><i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir</button>` : ''}
        </div>
      </div>
    </div>${respostas}`;
}

function confirmarExclusaoComentario(comentarioId, obraId) {
  abrirConfirmacao(
    'Excluir Comentário',
    'Tem certeza que deseja excluir este comentário? Esta ação não pode ser desfeita.',
    () => excluirComentario(comentarioId, obraId)
  );
}

function responderComentario(comentarioId) {
  AppState.comentarios.responderAComentarioId = comentarioId;
  const input = document.getElementById('comentarioInput');
  if (input) {
    input.placeholder = 'Respondendo ao comentário...';
    input.focus();
  }
}

function garantirCheckboxSpoiler() {
  const checkbox = document.getElementById('comentarioSpoiler');
  const input = document.getElementById('comentarioInput');
  if (!checkbox || !input) return;
  checkbox.addEventListener('change', e => {
    input.classList.toggle('spoiler-mode', e.target.checked);
    input.placeholder = e.target.checked ? 'Este comentário contém spoiler...' : 'Escreva seu comentário...';
  });
}

async function carregarNotificacoes() {
  if (!AppState.supabase || !AppState.usuario.logado) return;
  try {
    const { data, error } = await AppState.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', AppState.usuario.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    AppState.notificacoes.lista = data || [];
    atualizarBadgeNotificacoes();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar notificações:', err);
  }
}

function atualizarBadgeNotificacoes() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const naoLidas = AppState.notificacoes.lista.filter(n => !n.is_read).length;
  badge.textContent = naoLidas > 9 ? '9+' : naoLidas > 0 ? String(naoLidas) : '';
  badge.style.display = naoLidas > 0 ? 'flex' : 'none';
}

function toggleDropdownNotificacoes() {
  const dropdown = document.getElementById('notifDropdown');
  if (!dropdown) return;
  AppState.notificacoes.dropdownAberto = !AppState.notificacoes.dropdownAberto;
  dropdown.classList.toggle('active', AppState.notificacoes.dropdownAberto);
  if (AppState.notificacoes.dropdownAberto) renderizarListaNotificacoes();
}

function renderizarListaNotificacoes() {
  const container = document.getElementById('notifList');
  if (!container) return;
  if (!AppState.notificacoes.lista.length) {
    container.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell" aria-hidden="true"></i><p>Nenhuma notificação.</p></div>';
    return;
  }
  const icones = {
    novo_capitulo: 'fa-book', new_chapter: 'fa-book', resposta_comentario: 'fa-reply', reply: 'fa-reply',
    curtida: 'fa-heart', system: 'fa-circle-info', payment: 'fa-money-bill-wave', vip_expiring: 'fa-crown', mention: 'fa-at'
  };
  container.innerHTML = AppState.notificacoes.lista.map(n => `
    <div class="notif-item ${n.is_read ? 'read' : ''}" data-id="${escaparHtml(n.id)}" onclick="abrirNotificacao('${escaparHtml(n.id)}')">
      <div class="notif-icon"><i class="fa-solid ${icones[n.type] || 'fa-bell'}" aria-hidden="true"></i></div>
      <div class="notif-content">
        <p class="notif-text">${escaparHtml(n.message)}</p>
        <span class="notif-time">${dataRelativa(n.created_at)}</span>
      </div>
    </div>`).join('');
}

async function abrirNotificacao(notifId) {
  const notif = AppState.notificacoes.lista.find(n => String(n.id) === String(notifId));
  if (!notif) return;
  if (!notif.is_read) await marcarNotificacaoComoLida(notifId);
  toggleDropdownNotificacoes();

  if (notif.link) {
    try {
      const url = new URL(notif.link, window.location.origin);
      if (url.origin === window.location.origin) {
        window.location.href = url.href;
        return;
      }
    } catch (e) {}
  }
  if (notif.work_id) abrirDetalhesObra(notif.work_id);
}

async function marcarNotificacaoComoLida(notifId) {
  if (!AppState.supabase) return;
  try {
    await AppState.supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    const notif = AppState.notificacoes.lista.find(n => String(n.id) === String(notifId));
    if (notif) notif.is_read = true;
    atualizarBadgeNotificacoes();
    renderizarListaNotificacoes();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao marcar notificação:', err);
  }
}

async function marcarTodasNotificacoesComoLidas() {
  if (!AppState.supabase || !AppState.usuario.logado) return;
  try {
    await AppState.supabase.from('notifications').update({ is_read: true }).eq('user_id', AppState.usuario.id).eq('is_read', false);
    AppState.notificacoes.lista.forEach(n => { n.is_read = true; });
    atualizarBadgeNotificacoes();
    renderizarListaNotificacoes();
    mostrarToast('Todas as notificações marcadas como lidas.', 'sucesso');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao marcar todas:', err);
  }
}

async function avaliarObra(obraId, nota) {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para avaliar obras.', 'alerta');
    fazerLogin();
    return;
  }
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    mostrarToast('Nota inválida.', 'alerta');
    return;
  }
  if (!AppState.supabase) {
    mostrarToast('Sistema offline.', 'erro');
    return;
  }
  try {
    const { error } = await AppState.supabase.from('ratings').upsert(
      { user_id: AppState.usuario.id, work_id: obraId, stars: nota },
      { onConflict: 'user_id,work_id' }
    );
    if (error) throw error;
    mostrarToast('Avaliação registrada! Obrigado pelo feedback.', 'sucesso');
    await carregarObras();
    abrirDetalhesObra(obraId);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao avaliar:', err);
    mostrarToast('Falha ao registrar avaliação.', 'erro');
  }
}

function urlDaObra(obra) {
  return window.location.origin + '/?obra=' + encodeURIComponent(obra.id);
}

function compartilharObraAtual() {
  const obra = encontrarObraPorId(AppState.leitor.obraAtualId);
  if (!obra) {
    mostrarToast('Nenhuma obra selecionada.', 'alerta');
    return;
  }
  const url = urlDaObra(obra);
  if (navigator.share) {
    navigator.share({ title: obra.titulo, text: 'Confira "' + obra.titulo + '" no SolitudeScan!', url })
      .catch(err => { if (err && err.name !== 'AbortError') copiarLinkObra(obra, url); });
  } else {
    copiarLinkObra(obra, url);
  }
}

function copiarLinkObra(obra, url) {
  url = url || urlDaObra(obra);
  const fallback = () => {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    mostrarToast('Link copiado!', 'sucesso');
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => mostrarToast('Link copiado! Compartilhe com seus amigos.', 'sucesso')).catch(fallback);
  } else {
    fallback();
  }
}

function compartilharViaRedeSocial(rede) {
  const obra = encontrarObraPorId(AppState.leitor.obraAtualId);
  if (!obra) {
    mostrarToast('Nenhuma obra selecionada.', 'alerta');
    return;
  }
  const url = encodeURIComponent(urlDaObra(obra));
  const texto = encodeURIComponent('Confira "' + obra.titulo + '" no SolitudeScan!');
  const destinos = {
    twitter: 'https://twitter.com/intent/tweet?text=' + texto + '&url=' + url,
    facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + url,
    whatsapp: 'https://wa.me/?text=' + texto + '%20' + url,
    telegram: 'https://t.me/share/url?url=' + url + '&text=' + texto
  };
  if (destinos[rede]) window.open(destinos[rede], '_blank', 'noopener,noreferrer,width=600,height=400');
}

function exportarDadosUsuario() {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para exportar seus dados.', 'alerta');
    return;
  }
  const dados = {
    perfil: { nome: AppState.usuario.nome, email: AppState.usuario.email, telefone: AppState.usuario.telefone },
    favoritos: AppState.usuario.favoritos,
    historico: AppState.usuario.historico,
    listas: AppState.listas.personalizadas,
    exportadoEm: new Date().toISOString()
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'solitudescan_meus_dados_' + Date.now() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  mostrarToast('Seus dados foram exportados com sucesso.', 'sucesso');
}

async function carregarListasDoUsuario() {
  if (!AppState.supabase || !AppState.usuario.logado) {
    const locais = lerLocal('solitude_listas', []);
    AppState.listas.personalizadas = Array.isArray(locais) ? locais : [];
    return;
  }
  try {
    const { data, error } = await AppState.supabase
      .from('user_lists')
      .select('*, user_list_items(work_id, position, status, added_at)')
      .eq('user_id', AppState.usuario.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    AppState.listas.personalizadas = (data || []).map(lista => ({
      ...lista,
      work_ids: (lista.user_list_items || [])
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(item => String(item.work_id))
    }));
    localStorage.setItem('solitude_listas', JSON.stringify(AppState.listas.personalizadas));
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar listas:', err);
  }
}

function renderizarListas() {
  const container = document.getElementById('listasContainer');
  if (!container) return;
  if (!AppState.listas.personalizadas.length) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-list" aria-hidden="true"></i><p>Você não criou nenhuma lista personalizada.</p><button type="button" class="btn-primary" onclick="criarNovaLista()">Criar Lista</button></div>';
    return;
  }
  const cards = AppState.listas.personalizadas.map(lista => {
    const total = (lista.work_ids || []).length;
    const id = escaparHtml(lista.id);
    return `
      <div class="lista-card">
        <div class="lista-header">
          <h3>${escaparHtml(lista.name)}</h3>
          <span class="lista-count">${total} ${total === 1 ? 'obra' : 'obras'}</span>
        </div>
        <div class="lista-actions">
          <button type="button" class="btn-icon" onclick="verLista('${id}')" aria-label="Ver lista" title="Ver"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
          <button type="button" class="btn-icon" onclick="editarLista('${id}')" aria-label="Editar lista" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
          <button type="button" class="btn-icon" onclick="excluirLista('${id}')" aria-label="Excluir lista" title="Excluir"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
        </div>
      </div>`;
  }).join('');
  container.innerHTML = cards + '<button type="button" class="btn-secondary" onclick="criarNovaLista()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nova Lista</button>';
}

async function criarNovaLista() {
  const nome = (prompt('Nome da nova lista:') || '').trim();
  if (!nome) return;
  if (nome.length > 50) {
    mostrarToast('Nome muito longo. Máximo 50 caracteres.', 'alerta');
    return;
  }
  AppState.listas.personalizadas.push({
    id: 'local_' + Date.now(),
    name: nome,
    work_ids: [],
    created_at: new Date().toISOString(),
    user_id: AppState.usuario.id
  });
  await salvarListas();
  renderizarListas();
  mostrarToast('Lista criada com sucesso!', 'sucesso');
}

async function salvarListas() {
  localStorage.setItem('solitude_listas', JSON.stringify(AppState.listas.personalizadas));
  if (!AppState.supabase || !AppState.usuario.logado) return;

  try {
    for (const lista of AppState.listas.personalizadas) {
      const payload = {
        ...(ehUuid(lista.id) ? { id: lista.id } : {}),
        user_id: AppState.usuario.id,
        name: lista.name,
        description: lista.description || null,
        is_default: !!lista.is_default
      };
      const { data, error } = await AppState.supabase.from('user_lists').upsert(payload).select('id').single();
      if (error) throw error;
      if (data?.id && !ehUuid(lista.id)) lista.id = data.id;
    }
    for (const lista of AppState.listas.personalizadas) {
      if (!ehUuid(lista.id)) continue;
      await AppState.supabase.from('user_list_items').delete().eq('list_id', lista.id);
      const ids = [...new Set((lista.work_ids || []).filter(ehUuid))];
      if (ids.length) {
        await AppState.supabase.from('user_list_items').insert(ids.map((work_id, position) => ({ list_id: lista.id, work_id, position })));
      }
    }
    localStorage.setItem('solitude_listas', JSON.stringify(AppState.listas.personalizadas));
  } catch (err) {
    console.error('[SolitudeScan] Erro ao salvar listas:', err);
  }
}

async function editarLista(listaId) {
  const lista = AppState.listas.personalizadas.find(l => String(l.id) === String(listaId));
  if (!lista) return;
  const nome = (prompt('Novo nome da lista:', lista.name) || '').trim();
  if (!nome) return;
  if (nome.length > 50) {
    mostrarToast('Nome muito longo. Máximo 50 caracteres.', 'alerta');
    return;
  }
  lista.name = nome;
  await salvarListas();
  renderizarListas();
  mostrarToast('Lista atualizada.', 'sucesso');
}

function excluirLista(listaId) {
  abrirConfirmacao(
    'Excluir Lista',
    'Tem certeza que deseja excluir esta lista? As obras não serão excluídas do catálogo.',
    async () => {
      AppState.listas.personalizadas = AppState.listas.personalizadas.filter(l => String(l.id) !== String(listaId));
      localStorage.setItem('solitude_listas', JSON.stringify(AppState.listas.personalizadas));
      if (AppState.supabase && AppState.usuario.logado && ehUuid(listaId)) {
        await AppState.supabase.from('user_lists').delete().eq('id', listaId);
      }
      renderizarListas();
      mostrarToast('Lista excluída.', 'info');
    }
  );
}

function garantirModalListaObras() {
  let modal = document.getElementById('listaObrasModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'listaObrasModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Obras da lista');
  modal.innerHTML = '<div class="modal-content modal-large"><div class="modal-header"><h3>Lista</h3><button type="button" class="close-btn" onclick="toggleModal(\'listaObrasModal\')" aria-label="Fechar modal"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><div class="modal-body"></div></div>';
  document.body.appendChild(modal);
  return modal;
}

function verLista(listaId) {
  const lista = AppState.listas.personalizadas.find(l => String(l.id) === String(listaId));
  if (!lista) return;
  const obras = (lista.work_ids || []).map(encontrarObraPorId).filter(Boolean);
  if (!obras.length) {
    mostrarToast('Esta lista está vazia.', 'info');
    return;
  }
  const modal = garantirModalListaObras();
  modal.querySelector('.modal-header h3').textContent = lista.name;
  modal.querySelector('.modal-body').innerHTML = '<div class="manga-grid">' + obras.map(criarCardObra).join('') + '</div>';
  toggleModal('listaObrasModal', true);
}

async function adicionarObraALista(obraId, listaId) {
  const lista = AppState.listas.personalizadas.find(l => String(l.id) === String(listaId));
  if (!lista) return;
  lista.work_ids = lista.work_ids || [];
  if (lista.work_ids.includes(String(obraId))) {
    mostrarToast('Esta obra já está na lista.', 'info');
    return;
  }
  lista.work_ids.push(String(obraId));
  await salvarListas();
  mostrarToast('Obra adicionada à lista "' + lista.name + '".', 'sucesso');
}

async function removerObraDaLista(obraId, listaId) {
  const lista = AppState.listas.personalizadas.find(l => String(l.id) === String(listaId));
  if (!lista) return;
  lista.work_ids = (lista.work_ids || []).filter(id => id !== String(obraId));
  await salvarListas();
  mostrarToast('Obra removida da lista.', 'info');
}

function salvarLista() {
  return salvarListas();
}

const PRECOS_PLANOS = Object.freeze({ 'VIP Mensal': 14.9, 'VIP Trimestral': 39.9, 'VIP Anual': 149.9 });

function renderizarAbasPerfil() {
  document.querySelectorAll('.profile-tab-content').forEach(t => t.classList.remove('active'));
  const aba = AppState.perfil.abaAtiva;
  const alvo = document.getElementById('profile' + aba.charAt(0).toUpperCase() + aba.slice(1));
  if (alvo) alvo.classList.add('active');

  if (aba === 'historico') carregarHistoricoUsuario();
  else if (aba === 'favoritos') carregarFavoritosUsuario();
  else if (aba === 'listas') carregarListasDoUsuario().then(renderizarListas);
}

function switchTabProfile(aba, element) {
  AppState.perfil.abaAtiva = aba;
  document.querySelectorAll('.profile-tabs .tab-btn').forEach(btn => {
    const ativo = btn === element;
    btn.classList.toggle('active', ativo);
    btn.setAttribute('aria-selected', ativo ? 'true' : 'false');
  });
  renderizarAbasPerfil();
}

function abrirModalPix(plano) {
  if (!plano || !CONFIG.PLANOS_DURACAO[plano]) {
    mostrarToast('Plano inválido. Selecione um plano válido.', 'erro');
    return;
  }
  const valor = formatarMoeda(PRECOS_PLANOS[plano]);
  AppState.pix = { planoAtual: { plano, valor }, solicitacaoAtual: null, timerInterval: null, expirado: false };
  pararTimerPix();

  const detalhe = document.getElementById('pixDetalhePlano');
  if (detalhe) detalhe.textContent = plano + ' — ' + valor;
  document.getElementById('pixPassoDados').style.display = 'block';
  document.getElementById('pixPassoPagamento').style.display = 'none';
  document.getElementById('pixMsgExpirado').style.display = 'none';
  document.getElementById('btnConfirmarPix').disabled = false;

  const timer = document.getElementById('pixTimer');
  timer.textContent = '04:30';
  timer.classList.remove('timer-perigo', 'timer-expirado');

  const email = document.getElementById('pixEmail');
  const nome = document.getElementById('pixNome');
  email.value = AppState.usuario.email || '';
  nome.value = AppState.usuario.logado && !AppState.usuario.nome.includes('@') ? AppState.usuario.nome : '';

  toggleModal('pixModal', true);
}

function fecharPixModal() {
  pararTimerPix();
  toggleModal('pixModal', false);
}

async function gerarCobrancaPix(e) {
  e.preventDefault();
  const nome = document.getElementById('pixNome').value.trim();
  const email = document.getElementById('pixEmail').value.trim();
  const { plano, valor } = AppState.pix.planoAtual;

  if (nome.length < 2 || nome.length > 100) {
    mostrarToast('Informe seu nome completo (até 100 caracteres).', 'alerta');
    return;
  }
  if (!validarEmail(email)) {
    mostrarToast('Informe um e-mail válido: o VIP será ativado neste endereço.', 'alerta');
    return;
  }
  if (!AppState.supabase) {
    mostrarToast('Sistema offline. Tente novamente em instantes.', 'erro');
    return;
  }

  const expiraEm = new Date(Date.now() + CONFIG.TEMPO_PIX_SEGUNDOS * 1000).toISOString();
  const { data, error } = await AppState.supabase.from('payment_requests').insert([{
    nome, email, plano, valor, metodo: 'pix', status: 'pendente',
    expires_at: expiraEm, user_id: AppState.usuario.id || null
  }]).select().single();

  if (error || !data) {
    console.warn('[SolitudeScan] Erro ao registrar solicitação:', error);
    mostrarToast('Não foi possível gerar a cobrança. Tente novamente.', 'erro');
    return;
  }

  AppState.pix.solicitacaoAtual = { id: data.id, nome, email, expiraEm, plano, valor };
  document.getElementById('pixPassoDados').style.display = 'none';
  document.getElementById('pixPassoPagamento').style.display = 'block';
  iniciarTimerPix();
  mostrarToast('Cobrança gerada! Você tem 4 minutos e 30 segundos para concluir o Pix.', 'info', 5000);
}

function iniciarTimerPix() {
  const el = document.getElementById('pixTimer');
  pararTimerPix();
  AppState.pix.timerInterval = setInterval(() => {
    const sol = AppState.pix.solicitacaoAtual;
    if (!sol) return pararTimerPix();
    const restante = Math.floor((new Date(sol.expiraEm) - Date.now()) / 1000);

    if (restante <= 0) {
      pararTimerPix();
      AppState.pix.expirado = true;
      el.textContent = '00:00';
      el.classList.add('timer-expirado');
      document.getElementById('btnConfirmarPix').disabled = true;
      document.getElementById('pixMsgExpirado').style.display = 'block';
      mostrarToast('Tempo esgotado! A solicitação foi cancelada.', 'erro', 6000);
      if (AppState.supabase && sol.id) {
        AppState.supabase.from('payment_requests').update({ status: 'expirado' }).eq('id', sol.id).then(() => {});
      }
      return;
    }
    el.textContent = String(Math.floor(restante / 60)).padStart(2, '0') + ':' + String(restante % 60).padStart(2, '0');
    if (restante <= 60) el.classList.add('timer-perigo');
  }, 1000);
}

function pararTimerPix() {
  if (AppState.pix.timerInterval) {
    clearInterval(AppState.pix.timerInterval);
    AppState.pix.timerInterval = null;
  }
}

function copiarChavePix() {
  const fallback = () => {
    const input = document.createElement('input');
    input.value = CONFIG.CHAVE_PIX;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    mostrarToast('Chave Pix: ' + CONFIG.CHAVE_PIX, 'info', 6000);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(CONFIG.CHAVE_PIX)
      .then(() => mostrarToast('Chave Pix copiada! Cole no aplicativo do seu banco.', 'sucesso'))
      .catch(fallback);
  } else {
    fallback();
  }
}

async function concluirPagamentoPix() {
  const sol = AppState.pix.solicitacaoAtual;
  if (AppState.pix.expirado) {
    mostrarToast('Esta cobrança expirou. Feche e gere uma nova solicitação.', 'erro');
    return;
  }
  if (!sol || !AppState.supabase) {
    mostrarToast('Nenhuma cobrança ativa.', 'erro');
    return;
  }
  pararTimerPix();
  const { error } = await AppState.supabase.from('payment_requests')
    .update({ status: 'aguardando_confirmacao', confirmed_at: new Date().toISOString() })
    .eq('id', sol.id);
  if (error) {
    mostrarToast('Falha ao informar o pagamento. Tente novamente.', 'erro');
    return;
  }
  toggleModal('pixModal', false);
  mostrarToast('Pagamento informado! A administração vai conferir o Pix e ativar o VIP no seu e-mail.', 'sucesso', 8000);
}

function abrirPainelAdmin() {
  if (!AppState.usuario.isAdmin) {
    mostrarToast('Acesso negado. Apenas administradores.', 'erro');
    return;
  }
  toggleModal('adminModal', true);
  carregarDadosAdmin();
}

async function carregarDadosAdmin() {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;
  try {
    const contar = (tabela, filtro) => {
      let q = AppState.supabase.from(tabela).select('id', { count: 'exact', head: true });
      return filtro ? q.eq(filtro[0], filtro[1]) : q;
    };
    const [obras, usuarios, pagamentos, denuncias] = await Promise.all([
      contar('works'), contar('profiles'), contar('payment_requests', ['status', 'aguardando_confirmacao']), contar('reports', ['status', 'pending'])
    ]);
    const stats = { adminStatObras: obras.count, adminStatUsuarios: usuarios.count, adminStatPagamentos: pagamentos.count, adminStatDenuncias: denuncias.count };
    Object.entries(stats).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor || 0;
    });
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar dados admin:', err);
  }
}

function trocarAbaAdmin(aba) {
  document.querySelectorAll('.admin-tab-content, .admin-tab-btn').forEach(el => el.classList.remove('active'));
  const alvo = document.getElementById('adminTab' + aba.charAt(0).toUpperCase() + aba.slice(1));
  if (alvo) alvo.classList.add('active');
  const btn = document.querySelector('.admin-tab-btn[data-tab="' + aba + '"]');
  if (btn) btn.classList.add('active');
  const cargas = { obras: carregarObrasAdmin, usuarios: carregarUsuariosAdmin, pagamentos: carregarPagamentosAdmin, denuncias: carregarDenunciasAdmin };
  if (cargas[aba]) cargas[aba]();
}

function itemAdmin({ id, imagem, titulo, linha, meta, acoes }) {
  return `
    <div class="admin-item" data-id="${escaparHtml(id)}">
      ${imagem || ''}
      <div class="admin-item-info">
        <h4>${titulo}</h4>
        <p>${linha}</p>
        <span class="admin-item-meta">${meta}</span>
      </div>
      <div class="admin-item-actions">${acoes}</div>
    </div>`;
}

function botaoAdmin(classe, acao, icone, rotulo) {
  return `<button type="button" class="btn-icon ${classe}" onclick="${acao}" aria-label="${rotulo}" title="${rotulo}"><i class="fa-solid ${icone}" aria-hidden="true"></i></button>`;
}

function estadoAdmin(container, tipo, texto) {
  container.innerHTML = tipo === 'loading'
    ? '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ' + texto + '</div>'
    : '<div class="' + tipo + '-state"><p>' + texto + '</p></div>';
}

async function carregarObrasAdmin() {
  const container = document.getElementById('adminObrasLista');
  if (!container || !AppState.supabase || !AppState.usuario.isAdmin) return;
  estadoAdmin(container, 'loading', 'Carregando obras...');
  try {
    const { data, error } = await AppState.supabase.from('works').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    AppState.modais.listaObras = data || [];
    if (!data || !data.length) return estadoAdmin(container, 'empty', 'Nenhuma obra cadastrada.');

    container.innerHTML = data.map(obra => {
      const id = escaparHtml(obra.id);
      return itemAdmin({
        id: obra.id,
        imagem: `<img src="${sanitizarUrlImagem(obra.cover_url, PLACEHOLDERS.CAPA_PLACEHOLDER)}" alt="${escaparHtml(obra.title)}" class="admin-item-cover">`,
        titulo: escaparHtml(obra.title),
        linha: escaparHtml(obra.author || 'Autor desconhecido') + ' • ' + escaparHtml(obra.status || 'Em Lançamento'),
        meta: (obra.views || 0) + ' visualizações • ' + (obra.rating_avg || 0) + ' estrelas',
        acoes: botaoAdmin('', `carregarCapitulosAdmin('${id}')`, 'fa-list', 'Capítulos') +
               botaoAdmin('', `abrirFormularioObra('${id}')`, 'fa-pen', 'Editar') +
               botaoAdmin('danger', `confirmarExclusaoObra('${id}')`, 'fa-trash', 'Excluir')
      });
    }).join('');
    AppState.admin.obrasCarregadas = true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar obras admin:', err);
    estadoAdmin(container, 'error', 'Falha ao carregar obras.');
  }
}

function abrirFormularioObra(obraId = null) {
  if (!AppState.usuario.isAdmin) return;
  AppState.admin.editandoObraId = obraId;
  const form = document.getElementById('adminObraForm');
  if (form) form.reset();
  const titulo = document.getElementById('adminObraFormTitulo');
  if (titulo) titulo.textContent = obraId ? 'Editar Obra' : 'Nova Obra';

  const obra = obraId ? AppState.modais.listaObras.find(o => String(o.id) === String(obraId)) : null;
  if (obra) {
    const campos = {
      admObraTitulo: obra.title, admObraAutor: obra.author, admObraArtista: obra.artist,
      admObraSinopse: obra.synopsis, admObraStatus: obra.status || 'Em Lançamento', admObraTipo: obra.type || 'Manhwa'
    };
    Object.entries(campos).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.value = valor || '';
    });
    const marcas = { admObraExclusivo: obra.is_vip, admObraAdulto: obra.is_adult, admObraDestaque: obra.is_featured };
    Object.entries(marcas).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!valor;
    });
  }
  toggleModal('adminObraFormModal', true);
}

async function salvarObraAdmin(e) {
  e.preventDefault();
  if (!AppState.usuario.isAdmin || !AppState.supabase) return;
  const valor = id => (document.getElementById(id) || {}).value || '';
  const marcado = id => !!(document.getElementById(id) || {}).checked;

  const dados = {
    title: valor('admObraTitulo').trim(),
    author: valor('admObraAutor').trim(),
    artist: valor('admObraArtista').trim(),
    synopsis: valor('admObraSinopse').trim(),
    status: valor('admObraStatus'),
    type: valor('admObraTipo'),
    is_vip: marcado('admObraExclusivo'),
    is_adult: marcado('admObraAdulto'),
    is_featured: marcado('admObraDestaque')
  };

  if (dados.title.length < 2 || dados.title.length > 200) {
    mostrarToast('Título obrigatório (de 2 a 200 caracteres).', 'alerta');
    return;
  }

  const editando = AppState.admin.editandoObraId;
  if (!editando) {
    dados.slug = dados.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    dados.cover_url = PLACEHOLDERS.CAPA_PLACEHOLDER;
  }

  const capa = document.getElementById('admObraCapa');
  if (capa && capa.files.length) {
    const arquivo = capa.files[0];
    if (arquivo.size > 5 * 1024 * 1024) {
      mostrarToast('Capa muito grande. Máximo 5MB.', 'alerta');
      return;
    }
    const path = 'covers/' + Date.now() + '_' + arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const { error } = await AppState.supabase.storage.from('covers').upload(path, arquivo, { upsert: true });
    if (error) {
      mostrarToast('Falha ao enviar a capa.', 'erro');
      return;
    }
    dados.cover_url = AppState.supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
  }

  try {
    const consulta = editando
      ? AppState.supabase.from('works').update(dados).eq('id', editando)
      : AppState.supabase.from('works').insert([dados]);
    const { error } = await consulta;
    if (error) throw error;
    mostrarToast(editando ? 'Obra atualizada com sucesso!' : 'Obra criada com sucesso!', 'sucesso');
    toggleModal('adminObraFormModal', false);
    carregarObrasAdmin();
    carregarObras();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao salvar obra:', err);
    mostrarToast('Falha ao salvar obra: ' + (err.message || 'erro desconhecido'), 'erro');
  }
}

function confirmarExclusaoObra(obraId) {
  abrirConfirmacao(
    'Excluir Obra',
    'Tem certeza? Todos os capítulos e páginas desta obra também serão excluídos. Esta ação é irreversível.',
    () => excluirObraAdmin(obraId)
  );
}

async function excluirObraAdmin(obraId) {
  if (!AppState.usuario.isAdmin || !AppState.supabase) return;
  try {
    const { data: caps } = await AppState.supabase.from('chapters').select('id').eq('work_id', obraId);
    const ids = (caps || []).map(c => c.id);
    if (ids.length) await AppState.supabase.from('pages').delete().in('chapter_id', ids);
    await AppState.supabase.from('chapters').delete().eq('work_id', obraId);
    const { error } = await AppState.supabase.from('works').delete().eq('id', obraId);
    if (error) throw error;
    mostrarToast('Obra excluída com sucesso.', 'sucesso');
    carregarObrasAdmin();
    carregarObras();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao excluir obra:', err);
    mostrarToast('Falha ao excluir obra.', 'erro');
  }
}

async function carregarCapitulosAdmin(obraId) {
  const container = document.getElementById('adminCapitulosLista');
  if (!container || !AppState.supabase || !AppState.usuario.isAdmin) return;
  AppState.admin.obraAtualAdmin = obraId;
  estadoAdmin(container, 'loading', 'Carregando capítulos...');
  try {
    const { data, error } = await AppState.supabase.from('chapters').select('*').eq('work_id', obraId).order('chapter_number', { ascending: true });
    if (error) throw error;
    const obra = escaparHtml(obraId);
    const novo = `<button type="button" class="btn-primary" onclick="abrirFormularioCapitulo('${obra}')">Adicionar Capítulo</button>`;
    if (!data || !data.length) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum capítulo cadastrado.</p>' + novo + '</div>';
      return;
    }
    container.innerHTML = novo + data.map(cap => {
      const id = escaparHtml(cap.id);
      return itemAdmin({
        id: cap.id,
        titulo: escaparHtml(cap.title || 'Capítulo ' + cap.chapter_number),
        linha: 'Número: ' + escaparHtml(cap.chapter_number) + ' • ' + dataRelativa(cap.created_at),
        meta: (cap.is_vip ? 'VIP' : 'Gratuito') + ' • ' + (cap.is_published ? 'Publicado' : 'Rascunho'),
        acoes: botaoAdmin('', `gerenciarPaginasCapitulo('${id}', '${obra}')`, 'fa-images', 'Páginas') +
               botaoAdmin('', `abrirFormularioCapitulo('${obra}', '${id}')`, 'fa-pen', 'Editar') +
               botaoAdmin('danger', `confirmarExclusaoCapitulo('${id}', '${obra}')`, 'fa-trash', 'Excluir')
      });
    }).join('');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar capítulos admin:', err);
    estadoAdmin(container, 'error', 'Falha ao carregar capítulos.');
  }
}

async function abrirFormularioCapitulo(obraId, capituloId = null) {
  if (!AppState.usuario.isAdmin) return;
  AppState.admin.editandoCapituloId = capituloId;
  AppState.admin.obraAtualAdmin = obraId;
  const form = document.getElementById('adminCapituloForm');
  if (form) form.reset();
  const titulo = document.getElementById('adminCapituloFormTitulo');
  if (titulo) titulo.textContent = capituloId ? 'Editar Capítulo' : 'Novo Capítulo';

  if (capituloId) {
    const { data } = await AppState.supabase.from('chapters').select('*').eq('id', capituloId).single();
    if (data) {
      document.getElementById('admCapTitulo').value = data.title || '';
      document.getElementById('admCapNumero').value = data.chapter_number || '';
      const vip = document.getElementById('admCapVip');
      if (vip) vip.checked = !!data.is_vip;
    }
  }
  toggleModal('adminCapituloFormModal', true);
}

async function salvarCapituloAdmin(e) {
  e.preventDefault();
  if (!AppState.usuario.isAdmin || !AppState.supabase) return;
  const vip = document.getElementById('admCapVip');
  const dados = {
    work_id: AppState.admin.obraAtualAdmin,
    title: document.getElementById('admCapTitulo').value.trim(),
    chapter_number: parseFloat(document.getElementById('admCapNumero').value) || 1,
    is_vip: !!(vip && vip.checked),
    is_published: true
  };
  if (dados.title.length < 2) {
    mostrarToast('Título obrigatório.', 'alerta');
    return;
  }
  const editando = AppState.admin.editandoCapituloId;
  try {
    const consulta = editando
      ? AppState.supabase.from('chapters').update(dados).eq('id', editando)
      : AppState.supabase.from('chapters').insert([dados]);
    const { error } = await consulta;
    if (error) throw error;
    mostrarToast(editando ? 'Capítulo atualizado!' : 'Capítulo criado!', 'sucesso');
    toggleModal('adminCapituloFormModal', false);
    carregarCapitulosAdmin(AppState.admin.obraAtualAdmin);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao salvar capítulo:', err);
    mostrarToast('Falha ao salvar capítulo.', 'erro');
  }
}

function confirmarExclusaoCapitulo(capituloId, obraId) {
  abrirConfirmacao('Excluir Capítulo', 'Tem certeza? Todas as páginas deste capítulo serão excluídas.', async () => {
    if (!AppState.usuario.isAdmin) return;
    try {
      await AppState.supabase.from('pages').delete().eq('chapter_id', capituloId);
      const { error } = await AppState.supabase.from('chapters').delete().eq('id', capituloId);
      if (error) throw error;
      mostrarToast('Capítulo excluído.', 'sucesso');
      carregarCapitulosAdmin(obraId);
    } catch (err) {
      console.error('[SolitudeScan] Erro ao excluir capítulo:', err);
      mostrarToast('Falha ao excluir capítulo.', 'erro');
    }
  });
}

function gerenciarPaginasCapitulo(capituloId, obraId) {
  AppState.admin.capituloAtualAdmin = capituloId;
  AppState.admin.obraAtualAdmin = obraId;
  toggleModal('adminPaginasModal', true);
  carregarPaginasAdmin(capituloId);
}

async function carregarPaginasAdmin(capituloId) {
  const container = document.getElementById('adminPaginasLista');
  if (!container || !AppState.supabase) return;
  estadoAdmin(container, 'loading', 'Carregando páginas...');
  try {
    const { data, error } = await AppState.supabase.from('pages').select('*').eq('chapter_id', capituloId).order('page_number', { ascending: true });
    if (error) throw error;
    if (!data || !data.length) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma página neste capítulo.</p><p class="empty-hint">Use o upload para adicionar imagens ou PDFs.</p></div>';
      return;
    }
    const comUrl = await Promise.all(data.map(async p => ({ ...p, url: await criarUrlAssinadaPagina(p.image_url) })));
    container.innerHTML = comUrl.map(p => `
      <div class="admin-page-item" data-id="${escaparHtml(p.id)}">
        <img src="${p.url || PLACEHOLDERS.PAGINA_PLACEHOLDER}" alt="Página ${p.page_number}" class="admin-page-img" loading="lazy">
        <span class="page-number">#${p.page_number}</span>
        ${botaoAdmin('danger', `excluirPaginaAdmin('${escaparHtml(p.id)}', '${escaparHtml(capituloId)}')`, 'fa-trash', 'Excluir página')}
      </div>`).join('');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar páginas:', err);
    estadoAdmin(container, 'error', 'Falha ao carregar páginas.');
  }
}

function ehArquivoPDF(file) {
  return !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
}

async function processarUploadAdmin() {
  if (!AppState.usuario.isAdmin) return mostrarToast('Acesso negado.', 'erro');
  const input = document.getElementById('admPaginasArquivo');
  if (!input || !input.files.length) return mostrarToast('Selecione arquivos para upload.', 'alerta');
  if (!AppState.admin.capituloAtualAdmin) return mostrarToast('Selecione um capítulo primeiro.', 'alerta');

  const arquivos = Array.from(input.files);
  const grandes = arquivos.filter(f => f.size > CONFIG.MAX_UPLOAD_SIZE);
  if (grandes.length) return mostrarToast('Arquivos acima de 50MB: ' + grandes.map(f => f.name).join(', '), 'erro', 6000);

  const tipos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const invalidos = arquivos.filter(f => !tipos.includes(f.type) && !/\.(jpe?g|png|webp|gif|pdf)$/i.test(f.name));
  if (invalidos.length) return mostrarToast('Formatos inválidos: ' + invalidos.map(f => f.name).join(', '), 'erro', 6000);

  let todas = arquivos.filter(f => !ehArquivoPDF(f));
  for (const pdf of arquivos.filter(ehArquivoPDF)) {
    try {
      mostrarToast('Processando ' + pdf.name + '...', 'info', 2000);
      todas = todas.concat(await processarPDFParaImagens(pdf));
    } catch (err) {
      console.error('[SolitudeScan] Erro no PDF:', err);
      mostrarToast('Falha ao processar ' + pdf.name + ': ' + err.message, 'erro', 6000);
    }
  }
  if (!todas.length) return mostrarToast('Nenhum arquivo válido para upload.', 'alerta');

  await uploadPaginasSupabase(todas, AppState.admin.capituloAtualAdmin);
  input.value = '';
}

async function carregarPDFjs() {
  if (window.pdfjsLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('Falha ao carregar PDF.js'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    s.onerror = () => reject(new Error('Falha ao carregar PDF.js'));
    document.head.appendChild(s);
  });
}

async function processarPDFParaImagens(file, qualidade = 0.82, escala = 2) {
  await carregarPDFjs();
  if (file.size > 100 * 1024 * 1024) throw new Error('PDF muito grande (máx. 100MB)');
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 200) throw new Error('PDF com muitas páginas (máx. 200)');

  const imagens = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    mostrarToast('Convertendo página ' + i + ' de ' + pdf.numPages + '...', 'info', 1000);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    let blob = await new Promise(res => canvas.toBlob(res, 'image/webp', qualidade));
    if (!blob) blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const ext = blob.type.includes('webp') ? '.webp' : '.png';
    imagens.push(new File([blob], 'pagina_' + String(i).padStart(3, '0') + ext, { type: blob.type }));
  }
  return imagens;
}

async function uploadPaginasSupabase(arquivos, capituloId) {
  if (!AppState.supabase || !AppState.usuario.isAdmin) {
    mostrarToast('Acesso negado ou offline.', 'erro');
    return [];
  }
  let numero = 1;
  try {
    const { data } = await AppState.supabase.from('pages').select('page_number').eq('chapter_id', capituloId).order('page_number', { ascending: false }).limit(1);
    if (data && data.length) numero = data[0].page_number + 1;
  } catch (err) {}

  const enviados = [];
  for (const file of arquivos) {
    try {
      const nome = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      const path = capituloId + '/' + String(numero).padStart(3, '0') + '_' + Date.now() + '_' + nome;
      const { error } = await AppState.supabase.storage.from('chapters').upload(path, file, { upsert: true });
      if (error) throw error;
      const { error: erroPagina } = await AppState.supabase.from('pages').insert({ chapter_id: capituloId, image_url: path, page_number: numero });
      if (erroPagina) throw erroPagina;
      enviados.push(path);
      numero++;
    } catch (err) {
      console.error('[SolitudeScan] Erro no upload:', err);
    }
  }
  if (enviados.length) {
    mostrarToast(enviados.length + ' de ' + arquivos.length + ' páginas enviadas.', enviados.length === arquivos.length ? 'sucesso' : 'alerta');
    carregarPaginasAdmin(capituloId);
  } else {
    mostrarToast('Nenhuma página foi enviada.', 'erro');
  }
  return enviados;
}

function excluirPaginaAdmin(paginaId, capituloId) {
  if (!AppState.usuario.isAdmin) return;
  abrirConfirmacao('Excluir Página', 'Tem certeza que deseja excluir esta página?', async () => {
    try {
      const { error } = await AppState.supabase.from('pages').delete().eq('id', paginaId);
      if (error) throw error;
      mostrarToast('Página excluída.', 'sucesso');
      carregarPaginasAdmin(capituloId);
    } catch (err) {
      console.error('[SolitudeScan] Erro ao excluir página:', err);
      mostrarToast('Falha ao excluir página.', 'erro');
    }
  });
}

async function carregarUsuariosAdmin() {
  const container = document.getElementById('adminUsuariosLista');
  if (!container || !AppState.supabase || !AppState.usuario.isAdmin) return;
  estadoAdmin(container, 'loading', 'Carregando usuários...');
  try {
    const { data, error } = await AppState.supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    AppState.modais.listaUsuarios = data || [];
    if (!data || !data.length) return estadoAdmin(container, 'empty', 'Nenhum usuário cadastrado.');

    container.innerHTML = data.map(user => {
      const id = escaparHtml(user.id);
      const nome = escaparHtml(user.display_name || user.username || 'Sem nome');
      const selos = (user.is_admin ? '<span class="badge-admin">Admin</span>' : '') +
        (user.is_vip ? '<span class="badge-vip">VIP</span>' : '') +
        (!user.is_admin && !user.is_vip ? '<span class="badge-free">Gratuito</span>' : '');
      return itemAdmin({
        id: user.id,
        imagem: `<img src="${sanitizarUrlImagem(user.avatar_url, PLACEHOLDERS.AVATAR_SVG)}" alt="${nome}" class="admin-user-avatar">`,
        titulo: nome,
        linha: escaparHtml(user.email || ''),
        meta: selos,
        acoes: botaoAdmin('', `toggleAdminUsuario('${id}', ${!user.is_admin})`, 'fa-shield-halved', user.is_admin ? 'Remover admin' : 'Tornar admin') +
               botaoAdmin('', `toggleVipUsuario('${id}', ${!user.is_vip})`, 'fa-crown', user.is_vip ? 'Remover VIP' : 'Tornar VIP')
      });
    }).join('');
    AppState.admin.usuariosCarregados = true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar usuários:', err);
    estadoAdmin(container, 'error', 'Falha ao carregar usuários.');
  }
}

function toggleAdminUsuario(userId, novoEstado) {
  if (!AppState.usuario.isAdmin) return;
  if (userId === AppState.usuario.id && !novoEstado) {
    mostrarToast('Você não pode remover seus próprios privilégios de admin.', 'alerta');
    return;
  }
  abrirConfirmacao(
    novoEstado ? 'Conceder Admin' : 'Remover Admin',
    novoEstado ? 'Este usuário terá acesso total ao painel administrativo. Confirmar?' : 'Este usuário perderá o acesso ao painel administrativo. Confirmar?',
    async () => {
      try {
        const { error } = await AppState.supabase.from('profiles').update({ is_admin: novoEstado }).eq('id', userId);
        if (error) throw error;
        mostrarToast(novoEstado ? 'Usuário tornado admin.' : 'Privilégios de admin removidos.', 'sucesso');
        carregarUsuariosAdmin();
      } catch (err) {
        console.error('[SolitudeScan] Erro ao alterar admin:', err);
        mostrarToast('Falha ao atualizar usuário.', 'erro');
      }
    }
  );
}

async function toggleVipUsuario(userId, novoEstado) {
  if (!AppState.usuario.isAdmin) return;
  const dados = novoEstado
    ? { is_vip: true, vip_plan: 'VIP Admin Grant', vip_expires_at: new Date(Date.now() + 365 * 86400000).toISOString() }
    : { is_vip: false, vip_plan: null, vip_expires_at: null };
  try {
    const { error } = await AppState.supabase.from('profiles').update(dados).eq('id', userId);
    if (error) throw error;
    mostrarToast(novoEstado ? 'Usuário tornado VIP (1 ano).' : 'VIP removido.', 'sucesso');
    carregarUsuariosAdmin();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao alterar VIP:', err);
    mostrarToast('Falha ao atualizar usuário.', 'erro');
  }
}

async function carregarPagamentosAdmin() {
  const container = document.getElementById('adminPagamentosLista');
  if (!container || !AppState.supabase || !AppState.usuario.isAdmin) return;
  estadoAdmin(container, 'loading', 'Carregando pagamentos...');
  try {
    const { data, error } = await AppState.supabase.from('payment_requests').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    AppState.modais.listaPagamentos = data || [];
    if (!data || !data.length) return estadoAdmin(container, 'empty', 'Nenhum pagamento registrado.');

    const rotulos = { pendente: 'Pendente', aguardando_confirmacao: 'Aguardando Confirmação', aprovado: 'Aprovado', rejeitado: 'Rejeitado', expirado: 'Expirado' };
    container.innerHTML = data.map(pag => {
      const id = escaparHtml(pag.id);
      const aberto = pag.status === 'pendente' || pag.status === 'aguardando_confirmacao';
      return itemAdmin({
        id: pag.id,
        titulo: escaparHtml(pag.nome || 'Sem nome') + ' — ' + escaparHtml(pag.plano),
        linha: escaparHtml(pag.email) + ' • ' + formatarMoeda(pag.valor || 0),
        meta: `<span class="status-badge status-${escaparHtml(pag.status)}">${escaparHtml(rotulos[pag.status] || pag.status)}</span> • ${dataRelativa(pag.created_at)}`,
        acoes: aberto
          ? botaoAdmin('success', `aprovarPagamento('${id}')`, 'fa-check', 'Aprovar') + botaoAdmin('danger', `rejeitarPagamento('${id}')`, 'fa-xmark', 'Rejeitar')
          : ''
      });
    }).join('');
    AppState.admin.pagamentosCarregados = true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar pagamentos:', err);
    estadoAdmin(container, 'error', 'Falha ao carregar pagamentos.');
  }
}

function aprovarPagamento(pagamentoId) {
  if (!AppState.usuario.isAdmin) return;
  abrirConfirmacao(
    'Aprovar Pagamento',
    'Confirme que o Pix foi recebido no banco. O VIP será ativado para o e-mail informado.',
    async () => {
      const pag = AppState.modais.listaPagamentos.find(p => String(p.id) === String(pagamentoId));
      if (!pag) return mostrarToast('Pagamento não encontrado.', 'erro');
      try {
        const dias = CONFIG.PLANOS_DURACAO[pag.plano] || 30;
        const expiraEm = new Date(Date.now() + dias * 86400000).toISOString();
        let consulta = AppState.supabase.from('profiles').update({ is_vip: true, vip_plan: pag.plano, vip_expires_at: expiraEm });
        consulta = pag.user_id ? consulta.eq('id', pag.user_id) : consulta.eq('email', pag.email);
        const { error: erroPerfil } = await consulta;
        if (erroPerfil) throw erroPerfil;

        const { error } = await AppState.supabase.from('payment_requests')
          .update({ status: 'aprovado', approved_at: new Date().toISOString() }).eq('id', pagamentoId);
        if (error) throw error;

        if (pag.user_id) {
          await AppState.supabase.from('notifications').insert({
            user_id: pag.user_id, type: 'payment', title: 'Pagamento aprovado',
            message: 'Seu pagamento foi aprovado! ' + pag.plano + ' ativado até ' + new Date(expiraEm).toLocaleDateString('pt-BR') + '.',
            is_read: false
          });
        }
        mostrarToast('Pagamento aprovado! VIP ativado para ' + pag.email, 'sucesso');
        carregarPagamentosAdmin();
        carregarDadosAdmin();
      } catch (err) {
        console.error('[SolitudeScan] Erro ao aprovar pagamento:', err);
        mostrarToast('Falha ao aprovar pagamento.', 'erro');
      }
    }
  );
}

function rejeitarPagamento(pagamentoId) {
  if (!AppState.usuario.isAdmin) return;
  abrirConfirmacao('Rejeitar Pagamento', 'Tem certeza que deseja rejeitar este pagamento? O usuário será notificado.', async () => {
    const pag = AppState.modais.listaPagamentos.find(p => String(p.id) === String(pagamentoId));
    try {
      const { error } = await AppState.supabase.from('payment_requests')
        .update({ status: 'rejeitado', rejected_at: new Date().toISOString() }).eq('id', pagamentoId);
      if (error) throw error;
      if (pag && pag.user_id) {
        await AppState.supabase.from('notifications').insert({
          user_id: pag.user_id, type: 'payment', title: 'Pagamento rejeitado',
          message: 'Seu pagamento foi rejeitado. Entre em contato com o suporte para mais informações.', is_read: false
        });
      }
      mostrarToast('Pagamento rejeitado.', 'info');
      carregarPagamentosAdmin();
      carregarDadosAdmin();
    } catch (err) {
      console.error('[SolitudeScan] Erro ao rejeitar pagamento:', err);
      mostrarToast('Falha ao rejeitar pagamento.', 'erro');
    }
  });
}

async function carregarDenunciasAdmin() {
  const container = document.getElementById('adminDenunciasLista');
  if (!container || !AppState.supabase || !AppState.usuario.isAdmin) return;
  estadoAdmin(container, 'loading', 'Carregando denúncias...');
  try {
    const { data, error } = await AppState.supabase.from('reports').select('*, reporter:reporter_id (display_name, email)').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    if (!data || !data.length) return estadoAdmin(container, 'empty', 'Nenhuma denúncia registrada.');

    container.innerHTML = data.map(rep => {
      const id = escaparHtml(rep.id);
      const autor = rep.reporter || {};
      const pendente = rep.status === 'pending';
      return itemAdmin({
        id: rep.id,
        titulo: 'Denúncia: ' + escaparHtml(rep.target_type || 'desconhecido'),
        linha: 'Reportado por: ' + escaparHtml(autor.display_name || autor.email || 'Anônimo'),
        meta: `<span class="status-badge status-${escaparHtml(rep.status)}">${escaparHtml(rep.status)}</span> • ${dataRelativa(rep.created_at)}`,
        acoes: botaoAdmin('', `verDenuncia('${id}')`, 'fa-eye', 'Ver') +
          (pendente ? botaoAdmin('success', `resolverDenuncia('${id}', 'resolved')`, 'fa-check', 'Resolver') + botaoAdmin('danger', `resolverDenuncia('${id}', 'dismissed')`, 'fa-xmark', 'Descartar') : '')
      });
    }).join('');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar denúncias:', err);
    estadoAdmin(container, 'error', 'Falha ao carregar denúncias.');
  }
}

async function verDenuncia(denunciaId) {
  if (!AppState.usuario.isAdmin) return;
  try {
    const { data: rep, error } = await AppState.supabase.from('reports').select('*').eq('id', denunciaId).single();
    if (error) throw error;
    let conteudo = '';
    if (rep.target_type === 'comment') {
      const { data: com } = await AppState.supabase.from('comments').select('content').eq('id', rep.target_id).maybeSingle();
      conteudo = com ? com.content : 'Comentário não encontrado (pode ter sido removido).';
    }
    const texto = 'Tipo: ' + rep.target_type + ' | Status: ' + rep.status + ' | Data: ' + formatarDataCompleta(rep.created_at) +
      (conteudo ? ' | Conteúdo: ' + conteudo : '');
    const titulo = document.getElementById('infoModalTitle');
    const corpo = document.getElementById('infoModalTexto');
    if (titulo) titulo.textContent = 'Detalhes da Denúncia';
    if (corpo) corpo.textContent = texto;
    toggleModal('infoModal', true);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao ver denúncia:', err);
    mostrarToast('Falha ao carregar a denúncia.', 'erro');
  }
}

async function resolverDenuncia(denunciaId, status) {
  if (!AppState.usuario.isAdmin) return;
  try {
    const { error } = await AppState.supabase.from('reports')
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: AppState.usuario.id }).eq('id', denunciaId);
    if (error) throw error;
    mostrarToast('Denúncia ' + (status === 'resolved' ? 'resolvida' : 'descartada') + '.', 'sucesso');
    carregarDenunciasAdmin();
    carregarDadosAdmin();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao resolver denúncia:', err);
    mostrarToast('Falha ao atualizar denúncia.', 'erro');
  }
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || window.location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => setInterval(() => reg.update(), 3600000))
      .catch(e => console.warn('[SolitudeScan] SW não registrado:', e));
  });
}

function inicializarPWAInstall() {
  const btn = () => document.getElementById('btnInstalarApp');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    AppState.pwa.deferredInstallPrompt = e;
    if (btn()) btn().style.display = 'block';
  });
  window.addEventListener('appinstalled', () => {
    AppState.pwa.deferredInstallPrompt = null;
    if (btn()) btn().style.display = 'none';
    mostrarToast('App instalado com sucesso!', 'sucesso');
  });
}

async function instalarApp() {
  const prompt = AppState.pwa.deferredInstallPrompt;
  if (!prompt) {
    mostrarToast('Use o menu do navegador e escolha "Adicionar à tela inicial".', 'info', 6000);
    return;
  }
  prompt.prompt();
  const escolha = await prompt.userChoice;
  AppState.pwa.deferredInstallPrompt = null;
  const btn = document.getElementById('btnInstalarApp');
  if (btn) btn.style.display = 'none';
  if (escolha.outcome === 'accepted') mostrarToast('App instalado! Acesse pela tela inicial.', 'sucesso');
}

function aplicarAcessibilidade() {
  if (!document.getElementById('estiloMovimentoReduzido')) {
    const style = document.createElement('style');
    style.id = 'estiloMovimentoReduzido';
    style.textContent = '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important;}}';
    document.head.appendChild(style);
  }

  document.addEventListener('keydown', e => {
    const alvo = document.activeElement;
    if ((e.key === 'Enter' || e.key === ' ') && alvo && alvo.matches && alvo.matches('.manga-card, .ranking-item, [role="button"]')) {
      e.preventDefault();
      alvo.click();
      return;
    }
    if (e.key === 'Tab') {
      const modal = document.querySelector('.modal.active:not(#readerModal)');
      if (!modal) return;
      const itens = [...modal.querySelectorAll('button:not([disabled]), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null);
      if (!itens.length) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (!modal.contains(alvo)) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && alvo === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && alvo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
      return;
    }
    if (e.key === 'Escape' && AppState.ui.modalAtual && AppState.ui.modalAtual !== 'readerModal') {
      if (AppState.ui.modalAtual === 'pixModal') fecharPixModal();
      else toggleModal(AppState.ui.modalAtual, false);
    }
  });
}

function definirMeta(nome, conteudo, propriedade = false) {
  const seletor = propriedade ? `meta[property="${nome}"]` : `meta[name="${nome}"]`;
  let meta = document.querySelector(seletor);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(propriedade ? 'property' : 'name', nome);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', conteudo);
}

function atualizarMetaTagsDinamicas(obra) {
  if (!obra) return;
  const url = urlDaObra(obra);
  const descricao = (obra.sinopse || '').substring(0, 160);
  const capa = sanitizarUrlImagem(obra.capa, '', false);
  document.title = obra.titulo + ' | SolitudeScan';
  definirMeta('description', descricao);
  definirMeta('og:title', obra.titulo, true);
  definirMeta('og:description', descricao, true);
  definirMeta('og:url', url, true);
  definirMeta('og:type', 'book', true);
  definirMeta('twitter:title', obra.titulo);
  definirMeta('twitter:description', descricao);
  if (/^https?:/.test(capa)) {
    definirMeta('og:image', capa, true);
    definirMeta('twitter:image', capa);
  }
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', url);
}

function restaurarMetaTagsPadrao() {
  const titulo = 'SolitudeScan | Leia Manhwas, Mangás e Manhuás Online';
  const descricao = 'Leia manhwas, mangás e manhuás online com experiência de leitura profissional, rápida e segura. Atualizações diárias e catálogo exclusivo.';
  document.title = titulo;
  definirMeta('description', descricao);
  definirMeta('og:title', titulo, true);
  definirMeta('og:description', descricao, true);
  definirMeta('og:url', 'https://solitudescan.com/', true);
  definirMeta('og:image', 'https://solitudescan.com/icon.png', true);
  definirMeta('twitter:image', 'https://solitudescan.com/icon.png');
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', 'https://solitudescan.com/');
}

function observarFechamentoDetalhes() {
  const modal = document.getElementById('detalhesModal');
  if (!modal) return;
  new MutationObserver(() => {
    if (!modal.classList.contains('active') && !document.getElementById('readerModal').classList.contains('active')) {
      restaurarMetaTagsPadrao();
    }
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });
}

function processarLinksProfundos() {
  const obraId = new URLSearchParams(window.location.search).get('obra');
  if (obraId && encontrarObraPorId(obraId)) abrirDetalhesObra(obraId);
}

async function rodarTestesSolitude() {
  const resultados = [];
  const teste = (nome, ok, detalhe = '') => resultados.push({ nome, ok: !!ok, detalhe });

  ['mangaContainer', 'toastContainer', 'heroTrack', 'tendenciasContainer', 'rankingContainer', 'continueLendoContainer',
    'readerCascataContainer', 'detalhesModal', 'readerModal', 'loginModal', 'registerModal', 'pixModal', 'adminModal',
    'searchInput', 'listaCapitulosContainer', 'btnFavoritar', 'admPaginasArquivo', 'cookieBanner', 'skipLink',
    'generoFiltro', 'statusFiltro', 'ordemFiltro', 'themeToggleBtn', 'loggedOutView', 'loggedInView',
    'adminObraFormModal', 'adminCapituloFormModal', 'adminPaginasModal'
  ].forEach(id => teste('Elemento #' + id, document.getElementById(id)));

  ['carregarObras', 'abrirDetalhesObra', 'abrirLeitor', 'fecharLeitor', 'alternarFavorito', 'executarLoginCustom',
    'executarCadastro', 'abrirPainelAdmin', 'avaliarObra', 'adicionarComentario', 'abrirModalPix', 'gerarCobrancaPix',
    'processarUploadAdmin', 'aprovarPagamento', 'salvarObraAdmin', 'salvarCapituloAdmin', 'switchTab'
  ].forEach(fn => teste('Função ' + fn + '()', typeof window[fn] === 'function'));

  try {
    localStorage.setItem('solitude_teste', '1');
    teste('localStorage', localStorage.getItem('solitude_teste') === '1');
    localStorage.removeItem('solitude_teste');
  } catch (e) {
    teste('localStorage', false, e.message);
  }

  if (AppState.supabase) {
    for (const tabela of ['works', 'profiles']) {
      const { error } = await AppState.supabase.from(tabela).select('id', { head: true, count: 'exact' });
      teste('Tabela ' + tabela, !error, error ? error.message : '');
    }
  } else {
    teste('Conexão Supabase', false, 'Cliente não inicializado');
  }

  teste('CSP presente', document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  teste('Skip link presente', document.getElementById('skipLink'));

  const falhas = resultados.filter(r => !r.ok);
  console.group('SolitudeScan — Testes (' + (resultados.length - falhas.length) + '/' + resultados.length + ')');
  resultados.forEach(r => (r.ok ? console.log('[PASSA] ' + r.nome) : console.warn('[FALHA] ' + r.nome + (r.detalhe ? ' — ' + r.detalhe : ''))));
  console.groupEnd();

  mostrarToast(falhas.length ? falhas.length + ' teste(s) falharam. Veja o console.' : 'Todos os testes passaram.', falhas.length ? 'alerta' : 'sucesso', 6000);
  return resultados;
}

function fecharDropdowns(e) {
  if (e.target.closest('.dropdown') || e.target.closest('#notifBadge')) return;
  document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
  AppState.notificacoes.dropdownAberto = false;
}

document.addEventListener('DOMContentLoaded', () => {
  ativarFallbackImagens();
  ativarProtecaoClickjacking();
  ativarProtecoesLeitor();
  ativarSincronizacaoSessao();

  aplicarTemaAutomatico();
  inicializarBotaoTema();
  mostrarBannerCookies();

  AppState.usuario.foto = localStorage.getItem('solitude_foto') || AppState.usuario.foto;
  AppState.usuario.nome = localStorage.getItem('solitude_nome') || AppState.usuario.nome;
  AppState.usuario.telefone = localStorage.getItem('solitude_tel') || AppState.usuario.telefone;

  inicializarBusca();
  iniciarGestosLeitor();
  iniciarAtalhosTecladoLeitor();
  injetarEstiloAutoImersivo();
  inicializarPWAInstall();
  registrarServiceWorker();
  aplicarAcessibilidade();
  ativarSwipeHero();
  observarFechamentoDetalhes();

  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  renderizarContinueLendo();

  window.addEventListener('popstate', processarLinksProfundos);
  document.addEventListener('click', fecharDropdowns);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarVipAtivo(); });

  const btnAdmin = document.getElementById('btnAdminNav');
  if (btnAdmin) btnAdmin.addEventListener('click', abrirPainelAdmin);
  const notif = document.getElementById('notifBadge');
  if (notif) notif.addEventListener('click', toggleDropdownNotificacoes);

  setInterval(verificarVipAtivo, 3600000);
  setInterval(limparPlaceholdersMortos, 10000);

  const sessao = AppState.supabase ? verificarSessaoSupabase() : Promise.resolve();
  Promise.all([sessao, carregarObras()]).then(() => {
    carregarListasDoUsuario();
    renderizarContinueLendo();
    processarLinksProfundos();
    if (new URLSearchParams(window.location.search).get('testes') === '1' && AppState.usuario.isAdmin) rodarTestesSolitude();
  });
});
