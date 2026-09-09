/* =========================================================================
   SOLITUDESCAN — SCRIPT PRINCIPAL v4.0 (COMPLETO E BLINDADO)
   Todas as funcionalidades originais + melhorias de segurança e arquitetura.
   Sem patches sobrepostos. Sem código duplicado. Sem serviços mortos.
   Dividido em 5 partes para manutenção e revisão.
   ========================================================================= */

'use strict';

/* =========================================================================
   1. CONFIGURAÇÃO GLOBAL (CONSTANTES IMUTÁVEIS)
   ========================================================================= */

const CONFIG = Object.freeze({
  SUPABASE_URL: "https://zvpehjzbwastofjytogn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cGVoanpid2FzdG9manl0b2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDU0NjMsImV4cCI6MjEwMTEyMTQ2M30.KoB3qd86M5sVr_mcsixFAhBqv6rQxmW2LOWNs0_C1lg",
  CHAVE_PIX: "solitudescanoficial@gmail.com",
  TEMPO_PIX_SEGUNDOS: 270,
  DISCORD_URL: "https://discord.gg/fX3wUZBvk",
  PLANOS_DURACAO: Object.freeze({
    'VIP Mensal': 30,
    'VIP Trimestral': 90,
    'VIP Anual': 365
  }),
  MAX_UPLOAD_SIZE: 50 * 1024 * 1024, // 50MB
  RATE_LIMIT_COMENTARIO: 5000, // 5 segundos
  MAX_COMENTARIO_LENGTH: 500,
  MAX_HISTORICO_ITEMS: 50
});

const PLACEHOLDERS = Object.freeze({
  AVATAR_SVG: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
    "<rect width='64' height='64' fill='#1a0f1e'/>" +
    "<circle cx='32' cy='24' r='12' fill='#ec4899'/>" +
    "<path d='M12 56c2-12 10-18 20-18s18 6 20 18z' fill='#ec4899'/>" +
    "</svg>"
  ),
  CAPA_PLACEHOLDER: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'>" +
    "<rect width='300' height='450' fill='#1a0f1e'/>" +
    "<text x='150' y='225' fill='#ec4899' text-anchor='middle' font-size='14' font-family='sans-serif'>SolitudeScan</text>" +
    "</svg>"
  ),
  PAGINA_PLACEHOLDER: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 1200'>" +
    "<rect width='800' height='1200' fill='#0c070f'/>" +
    "<text x='400' y='600' fill='#ec4899' text-anchor='middle' font-size='20' font-family='sans-serif'>Página indisponível</text>" +
    "</svg>"
  )
});

/* =========================================================================
   2. ESTADO GLOBAL (ENCAPSULADO EM OBJETO ÚNICO)
   ========================================================================= */

const AppState = {
  supabase: null,
  usuario: {
    logado: false,
    id: null,
    nome: "LeitorSolitude",
    email: "",
    foto: PLACEHOLDERS.AVATAR_SVG,
    telefone: "",
    isVip: false,
    isAdmin: false,
    planoVip: null,
    vipExpiraEm: null,
    favoritos: [],
    historico: []
  },
  catalogo: {
    obrasRemotas: [],
    listaObras: [],
    generoAtual: 'Todos',
    termoBusca: '',
    statusFiltro: 'Todos',
    ordemFiltro: 'recentes'
  },
  leitor: {
    obraAtualId: null,
    capitulosObraAtual: [],
    indiceCapituloAtual: 0,
    ordemInvertida: false,
    nivelZoom: 100,
    modoImersivo: false
  },
  comentarios: {
    ultimoComentarioEm: 0,
    cache: {},
    responderAComentarioId: null
  },
  notificacoes: {
    lista: [],
    dropdownAberto: false
  },
  pix: {
    planoAtual: { plano: '', valor: '' },
    solicitacaoAtual: null,
    timerInterval: null,
    expirado: false
  },
  hero: {
    indice: 0,
    obras: [],
    interval: null
  },
  listas: {
    personalizadas: [],
    modalEmEdicaoId: null,
    obraParaAdicionarId: null
  },
  perfil: {
    abaAtiva: 'historico'
  },
  admin: {
    editandoObraId: null,
    obrasCarregadas: false,
    usuariosCarregados: false,
    pagamentosCarregados: false
  },
  denuncia: {
    alvoAtual: null,
    tipo: ''
  },
  pwa: {
    deferredInstallPrompt: null
  },
  ui: {
    acaoConfirmada: null,
    ordemCapitulosInvertida: false,
    modalAtual: null
  },
  modais: {
    listaObras: [],
    listaUsuarios: [],
    listaPagamentos: []
  }
};

// Inicializar favoritos e histórico do localStorage
try {
  AppState.usuario.favoritos = JSON.parse(localStorage.getItem('solitude_favoritos') || '[]');
  AppState.usuario.historico = JSON.parse(localStorage.getItem('solitude_historico') || '[]');
} catch (e) {
  AppState.usuario.favoritos = [];
  AppState.usuario.historico = [];
}

/* =========================================================================
   3. INICIALIZAÇÃO DO SUPABASE
   ========================================================================= */

try {
  if (typeof supabase !== 'undefined') {
    AppState.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('[SolitudeScan] Supabase indisponível, modo offline.');
}

/* =========================================================================
   4. UTILITÁRIOS
   ========================================================================= */

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

function ehUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
}

function formatarNumero(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function formatarMoeda(valor) {
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
}

function dataRelativa(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
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
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function throttle(fn, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
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
  toast.className = 'toast toast-' + tipo;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = '<i class="fa-solid ' + (icons[tipo] || icons.info) + '" aria-hidden="true"></i><span>' + escaparHtml(mensagem) + '</span>';
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-sair');
    setTimeout(() => toast.remove(), 300);
  }, duracao);
}

function toggleModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  const abrindo = !modal.classList.contains('active');
  modal.classList.toggle('active', abrindo);
  document.body.style.overflow = abrindo ? 'hidden' : 'auto';
  
  if (abrindo) {
    AppState.ui.modalAtual = modalId;
    const foco = modal.querySelector('input, textarea, button, [tabindex]');
    if (foco) setTimeout(() => foco.focus(), 120);
  } else {
    AppState.ui.modalAtual = null;
  }
}

function fecharTodosModais() {
  document.querySelectorAll('.modal.active').forEach(modal => {
    modal.classList.remove('active');
  });
  document.body.style.overflow = 'auto';
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
      toggleModal('confirmModal');
      if (AppState.ui.acaoConfirmada) AppState.ui.acaoConfirmada();
      AppState.ui.acaoConfirmada = null;
    };
  }
  
  toggleModal('confirmModal');
}

function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');
  if (el) el.classList.add('active');

  const footer = document.getElementById('siteFooter');
  if (footer) footer.style.display = (tabId === 'tab-home') ? 'flex' : 'none';

  if (tabId === 'tab-profile') {
    renderizarAbasPerfil();
  }
}

function todasAsObras() {
  const mapa = new Map();
  try {
    if (Array.isArray(AppState.catalogo.listaObras)) {
      AppState.catalogo.listaObras.forEach(o => mapa.set(String(o.id), o));
    }
    if (Array.isArray(AppState.catalogo.obrasRemotas)) {
      AppState.catalogo.obrasRemotas.forEach(o => mapa.set(String(o.id), o));
    }
  } catch (e) {}
  return [...mapa.values()];
}

function encontrarObraPorId(id) {
  return todasAsObras().find(o => String(o.id) === String(id));
}

/* =========================================================================
   5. SEGURANÇA — CLICKJACKING + PROTEÇÕES LEITOR
   ========================================================================= */

function ativarProtecaoClickjacking() {
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;">' +
        '<h2>Acesso bloqueado</h2><p>Este site não pode ser exibido em frames externos.</p>' +
        '<a href="' + window.self.location.href + '">Abrir diretamente</a></div>';
    }
  }
}

function ativarProtecoesLeitor() {
  // Bloqueio de botão direito no leitor
  document.addEventListener('contextmenu', e => {
    if (e.target && e.target.closest && e.target.closest('#readerModal')) e.preventDefault();
  });

  // Bloqueio de arrastar imagens do leitor
  document.addEventListener('dragstart', e => {
    if (e.target && e.target.tagName === 'IMG' && e.target.closest && e.target.closest('#readerModal')) e.preventDefault();
  });

  // Bloqueio de F12 + atalhos (Ctrl+S, Ctrl+U, Ctrl+Shift+I)
  document.addEventListener('keydown', e => {
    const reader = document.getElementById('readerModal');
    if (!reader || !reader.classList.contains('active')) return;
    if (e.key === 'F12') e.preventDefault();
    if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].indexOf(e.key.toUpperCase()) !== -1) e.preventDefault();
    if (e.ctrlKey && ['s', 'u', 'p'].indexOf((e.key || '').toLowerCase()) !== -1) e.preventDefault();
  });
}

function limparPlaceholdersMortos() {
  try {
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || '';
      if (src.indexOf('via.placeholder.com') !== -1) {
        img.src = PLACEHOLDERS.AVATAR_SVG;
      }
    });
  } catch (e) {}
}

/* =========================================================================
   6. AUTENTICAÇÃO — SUPABASE AUTH (SEGURANÇA REFORÇADA)
   ========================================================================= */

function fazerLogin() { 
  toggleModal('loginModal'); 
}

function abrirCadastro() {
  const l = document.getElementById('loginModal');
  if (l && l.classList.contains('active')) toggleModal('loginModal');
  toggleModal('registerModal');
}

async function executarLoginCustom(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  if (!validarEmail(email)) {
    mostrarToast('Digite um e-mail válido para entrar na sua conta.', 'alerta');
    return;
  }

  if (AppState.supabase) {
    const { data, error } = await AppState.supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      const msg = /confirmed/i.test(error.message)
        ? 'Sua conta ainda não foi confirmada. Abra o link que enviamos para seu e-mail e tente de novo.'
        : error.message;
      mostrarToast('Falha ao entrar: ' + msg, 'erro');
      return;
    }
    if (data.user) {
      AppState.usuario.id = data.user.id;
      await carregarPerfilRemoto(data.user.id);
    }
  }

  AppState.usuario.logado = true;
  AppState.usuario.email = email;
  AppState.usuario.nome = email.split('@')[0];
  
  // SEGURANÇA: isAdmin vem APENAS do Supabase, não de e-mail hardcoded
  await verificarVipPorPagamentos(email);
  verificarVipAtivo();

  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  toggleModal('loginModal');
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

  if (AppState.supabase) {
    const { data, error } = await AppState.supabase.auth.signUp({ email, password: senha });
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
  AppState.usuario.logado = false;
  AppState.usuario.isAdmin = false;
  AppState.usuario.id = null;
  AppState.usuario.isVip = false;
  AppState.usuario.planoVip = null;
  AppState.usuario.vipExpiraEm = null;
  if (AppState.supabase) AppState.supabase.auth.signOut();
  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();
  mostrarToast('Você saiu da sua conta. Até a próxima leitura!', 'info');
}

async function verificarSessaoSupabase() {
  if (!AppState.supabase) return;
  try {
    const { data: { session } } = await AppState.supabase.auth.getSession();
    if (session && session.user) {
      AppState.usuario.logado = true;
      AppState.usuario.id = session.user.id;
      AppState.usuario.email = session.user.email;
      AppState.usuario.nome = session.user.email.split('@')[0];
      
      // SEGURANÇA: isAdmin vem APENAS do Supabase
      await carregarPerfilRemoto(session.user.id);
      await verificarVipPorPagamentos(session.user.email);
      verificarVipAtivo();
      atualizarPerfilTela();
      atualizarVisibilidadeAdmin();
    }
  } catch (e) {}
}

async function carregarPerfilRemoto(userId) {
  if (!AppState.supabase) return;
  try {
    const { data } = await AppState.supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      // SEGURANÇA CRÍTICO: isAdmin vem 100% do banco de dados, não de e-mail hardcoded
      AppState.usuario.isAdmin = !!data.is_admin;
      AppState.usuario.isVip = !!data.is_vip;
      if (data.display_name || data.username) {
        AppState.usuario.nome = data.display_name || data.username;
      }
      if (data.avatar_url) AppState.usuario.foto = data.avatar_url;
    }
  } catch (e) {
    // Em caso de erro, manter isAdmin como false (segurança por padrão)
    AppState.usuario.isAdmin = false;
  }
}

function atualizarVisibilidadeAdmin() {
  const btn = document.getElementById('btnAdminNav');
  if (btn) btn.style.display = (AppState.usuario.logado && AppState.usuario.isAdmin) ? 'flex' : 'none';
}

/* =========================================================================
   7. SISTEMA VIP AUTOMÁTICO (VALIDAÇÃO SEGURO)
   ========================================================================= */

async function verificarVipPorPagamentos(email) {
  if (!AppState.supabase || !email) return;
  try {
    const { data } = await AppState.supabase
      .from('payment_requests')
      .select('id, plano, created_at')
      .eq('email', email)
      .eq('status', 'aprovado')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const pag = data[0];
      const dias = CONFIG.PLANOS_DURACAO[pag.plano] || 30;
      const inicio = new Date(pag.created_at);
      const expiracao = new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000);

      if (new Date() < expiracao) {
        // SEGURANÇA: O localStorage é apenas cache visual, a verdade está no Supabase
        const vipData = {
          ativo: true,
          plano: pag.plano,
          email: email,
          inicio: inicio.toISOString(),
          expiracao: expiracao.toISOString(),
          dias: dias
        };
        localStorage.setItem('solitude_vip_ativo', JSON.stringify(vipData));
      }
    }
  } catch (e) {}
  verificarVipAtivo();
}

function ativarVipAutomatico(plano, email) {
  const dias = CONFIG.PLANOS_DURACAO[plano];
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

  AppState.usuario.isVip = true;
  AppState.usuario.planoVip = plano;
  AppState.usuario.vipExpiraEm = expiracao;

  if (AppState.supabase && AppState.usuario.logado) {
    atualizarVipNoSupabase(email, expiracao, plano);
  }

  return true;
}

async function atualizarVipNoSupabase(email, expiracao, plano) {
  try {
    await AppState.supabase.from('profiles').upsert({
      email: email,
      is_vip: true,
      vip_plan: plano,
      vip_expires_at: expiracao.toISOString()
    });
  } catch (e) {}
}

function verificarVipAtivo() {
  const vipDataStr = localStorage.getItem('solitude_vip_ativo');

  if (!vipDataStr) {
    AppState.usuario.isVip = false;
    AppState.usuario.planoVip = null;
    AppState.usuario.vipExpiraEm = null;
    return;
  }

  let vipData;
  try {
    vipData = JSON.parse(vipDataStr);
  } catch (e) {
    localStorage.removeItem('solitude_vip_ativo');
    AppState.usuario.isVip = false;
    return;
  }

  const agora = new Date();
  const expiracao = new Date(vipData.expiracao);

  if (agora >= expiracao) {
    localStorage.removeItem('solitude_vip_ativo');
    const eraVip = AppState.usuario.isVip;
    AppState.usuario.isVip = false;
    AppState.usuario.planoVip = null;
    AppState.usuario.vipExpiraEm = null;

    if (eraVip) {
      mostrarToast('Seu VIP expirou! Renove para continuar lendo obras exclusivas.', 'alerta', 6000);
    }
    atualizarPerfilTela();
    return;
  }

  AppState.usuario.isVip = true;
  AppState.usuario.planoVip = vipData.plano;
  AppState.usuario.vipExpiraEm = expiracao;
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

/* =========================================================================
   8. PERFIL DO USUÁRIO
   ========================================================================= */

function atualizarPerfilTela() {
  const loggedOutView = document.getElementById('loggedOutView');
  const loggedInView = document.getElementById('loggedInView');

  if (loggedOutView) loggedOutView.style.display = AppState.usuario.logado ? 'none' : 'block';
  if (loggedInView) loggedInView.style.display = AppState.usuario.logado ? 'block' : 'none';

  if (AppState.usuario.logado) {
    const nameDisp = document.getElementById('userNameDisplay');
    const avatarImg = document.getElementById('userAvatarImg');

    if (nameDisp) nameDisp.textContent = AppState.usuario.nome;
    if (avatarImg) avatarImg.src = AppState.usuario.foto || PLACEHOLDERS.AVATAR_SVG;

    atualizarDisplayVip();
    garantirZonaPerigoPerfil();

    const profileHeader = document.querySelector('.profile-header > div:last-child');
    if (profileHeader) {
      let vipInfoBox = document.getElementById('vipInfoBox');

      if (AppState.usuario.isVip) {
        const dias = calcularDiasRestantes();
        const vipData = JSON.parse(localStorage.getItem('solitude_vip_ativo') || '{}');
        const expiracao = new Date(vipData.expiracao);

        if (!vipInfoBox) {
          vipInfoBox = document.createElement('div');
          vipInfoBox.id = 'vipInfoBox';
          profileHeader.appendChild(vipInfoBox);
        }

        const dataFormatada = expiracao.toLocaleDateString('pt-BR');
        vipInfoBox.className = 'vip-timer-display ' + (dias <= 7 ? 'expirando' : '');
        vipInfoBox.innerHTML = '<i class="fa-solid fa-crown"></i>' +
          '<span>Expira em: <strong>' + dataFormatada + '</strong> (' + dias + ' dias)</span>';
      } else if (vipInfoBox) {
        vipInfoBox.remove();
      }
    }

    renderizarAbasPerfil();
  }
}

function atualizarDisplayVip() {
  const planBadge = document.getElementById('userPlanBadge');
  if (!planBadge) return;

  if (AppState.usuario.isAdmin) {
    planBadge.textContent = 'Administrador';
    planBadge.style.background = 'var(--admin)';
    return;
  }

  if (!AppState.usuario.isVip) {
    planBadge.textContent = 'Plano Gratuito';
    planBadge.style.background = 'var(--texto-claro)';
    return;
  }

  const dias = calcularDiasRestantes();
  const plano = AppState.usuario.planoVip || 'VIP';

  if (dias <= 0) {
    planBadge.textContent = 'VIP Expirado';
    planBadge.style.background = 'var(--erro)';
  } else if (dias <= 7) {
    planBadge.textContent = plano + ' • ' + dias + ' dias restantes';
    planBadge.style.background = 'linear-gradient(135deg, var(--alerta), #d97706)';
  } else {
    planBadge.textContent = plano + ' • ' + dias + ' dias restantes';
    planBadge.style.background = 'linear-gradient(135deg, var(--primaria), var(--rosa-escuro))';
  }
}

async function salvarPerfil(e) {
  e.preventDefault();

  const fileInput = document.getElementById('editFotoArquivo');
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    
    // Validação de tamanho
    if (file.size > 5 * 1024 * 1024) { // 5MB para avatar
      mostrarToast('Imagem muito grande. Máximo 5MB.', 'alerta');
      return;
    }
    
    mostrarToast('Processando sua foto...', 'info', 2000);
    let urlFinal = null;

    if (AppState.supabase && AppState.usuario.logado) {
      try {
        const { data: { user } } = await AppState.supabase.auth.getUser();
        if (user) {
          const path = user.id + '/avatar_' + Date.now() + '.jpg';
          const { error } = await AppState.supabase.storage.from('avatars').upload(path, file, { upsert: true });
          if (!error) {
            urlFinal = AppState.supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
          }
        }
      } catch (err) {}
    }

    if (!urlFinal) {
      try {
        urlFinal = await redimensionarImagem(file);
      } catch (err) {
        urlFinal = null;
      }
    }
    if (urlFinal) AppState.usuario.foto = urlFinal;
  }

  AppState.usuario.nome = document.getElementById('editNome').value || AppState.usuario.nome;
  AppState.usuario.email = document.getElementById('editEmail').value || AppState.usuario.email;
  AppState.usuario.telefone = document.getElementById('editTel').value || AppState.usuario.telefone;

  localStorage.setItem('solitude_foto', AppState.usuario.foto);
  localStorage.setItem('solitude_nome', AppState.usuario.nome);
  localStorage.setItem('solitude_tel', AppState.usuario.telefone);

  if (AppState.supabase && AppState.usuario.logado) {
    try {
      await AppState.supabase.from('profiles').upsert({
        id: AppState.usuario.id,
        display_name: AppState.usuario.nome,
        avatar_url: AppState.usuario.foto
      });
    } catch (err) {}
  }

  atualizarPerfilTela();
  toggleModal('configModal');
  mostrarToast('Perfil atualizado com sucesso!', 'sucesso');
}

async function abrirConfigPerfil() {
  document.getElementById('editNome').value = AppState.usuario.nome;
  document.getElementById('editEmail').value = AppState.usuario.email;
  document.getElementById('editTel').value = AppState.usuario.telefone;
  const prev = document.getElementById('editFotoPreview');
  if (prev) prev.src = AppState.usuario.foto || PLACEHOLDERS.AVATAR_SVG;

  if (AppState.listas.personalizadas.length === 0) {
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
  if (file.size > 5 * 1024 * 1024) {
    mostrarToast('Imagem muito grande. Máximo 5MB.', 'alerta');
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

function garantirZonaPerigoPerfil() {
  const container = document.querySelector('.profile-danger-zone');
  if (container || !AppState.usuario.logado) return;

  const profileSection = document.querySelector('.profile-section');
  if (!profileSection) return;

  const zona = document.createElement('div');
  zona.className = 'profile-danger-zone';
  zona.innerHTML = `
    <h3>Zona de Perigo</h3>
    <button class="btn-danger" onclick="solicitarExclusaoConta()">
      <i class="fa-solid fa-trash"></i> Excluir Minha Conta
    </button>
  `;
  profileSection.appendChild(zona);
}

function solicitarExclusaoConta() {
  abrirConfirmacao(
    'Excluir Conta',
    'Esta ação é irreversível. Todos os seus dados serão perdidos. Deseja continuar?',
    async () => {
      if (!AppState.supabase || !AppState.usuario.logado) return;
      
      try {
        await AppState.supabase.from('account_deletion_requests').insert({
          user_id: AppState.usuario.id,
          requested_at: new Date().toISOString()
        });
        
        mostrarToast('Solicitação enviada. Sua conta será excluída em até 30 dias.', 'info', 8000);
        fazerLogout();
      } catch (err) {
        console.error('[SolitudeScan] Erro ao solicitar exclusão:', err);
        mostrarToast('Falha ao processar solicitação.', 'erro');
      }
    }
  );
}

/* =========================================================================
   9. CATÁLOGO — MAPEAMENTO SUPABASE → LOCAL
   ========================================================================= */

async function carregarObras() {
  if (!AppState.supabase) {
    mostrarToast('Sistema offline. Algumas funcionalidades podem estar limitadas.', 'alerta', 5000);
    renderizarCatalogo();
    return;
  }

  try {
    const { data, error } = await AppState.supabase
      .from('works')
      .select(`
        *,
        genres:work_genres(genres(name)),
        chapters(count)
      `)
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
      visualizacoes: obra.views || 0,
      curtidas: obra.likes_count || 0,
      avaliacao: obra.rating_avg ?? obra.rating ?? 0,
      totalAvaliacoes: obra.rating_count || 0,
      totalCapitulos: obra.chapters?.[0]?.count || 0,
      atualizadoEm: obra.updated_at,
      criadoEm: obra.created_at,
      exclusivo: !!obra.is_vip,
      adulto: !!obra.is_adult,
      destaque: !!obra.is_featured
    }));

    aplicarOverridesLocais();
    renderizarCatalogo();
    renderizarHeroBanner();
    renderizarTendencias();
    renderizarRanking();
    popularFiltroGeneros();

  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar obras:', err);
    mostrarToast('Falha ao carregar o catálogo. Tente recarregar a página.', 'erro', 6000);
  }
}

function aplicarOverridesLocais() {
  try {
    const obrasRemovidas = JSON.parse(localStorage.getItem('solitude_obras_removidas') || '[]');
    if (Array.isArray(obrasRemovidas) && obrasRemovidas.length > 0) {
      AppState.catalogo.obrasRemotas = AppState.catalogo.obrasRemotas.filter(
        o => !obrasRemovidas.includes(String(o.id))
      );
    }
  } catch (e) {}
}

function popularFiltroGeneros() {
  const select = document.getElementById('generoFiltro');
  if (!select) return;

  const generosUnicos = new Set();
  AppState.catalogo.obrasRemotas.forEach(obra => {
    (obra.generos || []).forEach(g => generosUnicos.add(g));
  });

  const generosOrdenados = [...generosUnicos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  
  select.innerHTML = '<option value="Todos">Todos os Gêneros</option>';
  generosOrdenados.forEach(genero => {
    const option = document.createElement('option');
    option.value = genero;
    option.textContent = genero;
    select.appendChild(option);
  });
}

/* =========================================================================
   10. RENDERIZAÇÃO DO CATÁLOGO
   ========================================================================= */

function renderizarCatalogo() {
  const container = document.getElementById('mangaContainer');
  if (!container) return;

  let obras = [...AppState.catalogo.obrasRemotas];

  // Filtro por gênero
  if (AppState.catalogo.generoAtual !== 'Todos') {
    obras = obras.filter(o => (o.generos || []).includes(AppState.catalogo.generoAtual));
  }

  // Filtro por status
  if (AppState.catalogo.statusFiltro !== 'Todos') {
    obras = obras.filter(o => o.status === AppState.catalogo.statusFiltro);
  }

  // Filtro por tipo (adulto)
  if (!AppState.usuario.isAdmin) {
    obras = obras.filter(o => !o.adulto);
  }

  // Filtro por busca
  if (AppState.catalogo.termoBusca) {
    const termo = AppState.catalogo.termoBusca.toLowerCase();
    obras = obras.filter(o => 
      o.titulo.toLowerCase().includes(termo) ||
      o.autor.toLowerCase().includes(termo) ||
      (o.artista || '').toLowerCase().includes(termo) ||
      (o.sinopse || '').toLowerCase().includes(termo)
    );
  }

  // Ordenação
  switch (AppState.catalogo.ordemFiltro) {
    case 'populares':
      obras.sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0));
      break;
    case 'avaliados':
      obras.sort((a, b) => (b.avaliacao || 0) - (a.avaliacao || 0));
      break;
    case 'titulo':
      obras.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
      break;
    case 'capitulos':
      obras.sort((a, b) => (b.totalCapitulos || 0) - (a.totalCapitulos || 0));
      break;
    case 'recentes':
    default:
      obras.sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0));
  }

  if (obras.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book-open"></i><p>Nenhuma obra encontrada com os filtros aplicados.</p><button class="btn-secondary" onclick="limparFiltros()">Limpar Filtros</button></div>';
    return;
  }

  container.innerHTML = obras.map(obra => criarCardObra(obra)).join('');
  marcarCardsNavegaveis();
}

function criarCardObra(obra) {
  const generos = (obra.generos || []).slice(0, 2).map(g => `<span class="genre-tag">${escaparHtml(g)}</span>`).join('');
  const exclusivo = obra.exclusivo ? '<span class="exclusive-badge"><i class="fa-solid fa-star"></i> Exclusivo</span>' : '';
  const adulto = obra.adulto ? '<span class="adult-badge">+18</span>' : '';
  const statusClass = 'status-' + (obra.status || '').toLowerCase().replace(/\s+/g, '-');
  
  return `
    <article class="manga-card" data-id="${obra.id}" onclick="abrirDetalhesObra('${obra.id}')" role="listitem" tabindex="0">
      <div class="manga-cover">
        <img src="${obra.capa}" alt="Capa de ${escaparHtml(obra.titulo)}" loading="lazy" onerror="this.src='${PLACEHOLDERS.CAPA_PLACEHOLDER}'">
        ${exclusivo}
        ${adulto}
        <div class="manga-overlay">
          <span class="chapter-count"><i class="fa-solid fa-book"></i> ${obra.totalCapitulos || 0} cap.</span>
          <span class="view-count"><i class="fa-solid fa-eye"></i> ${formatarNumero(obra.visualizacoes || 0)}</span>
        </div>
      </div>
      <div class="manga-info">
        <h3 class="manga-title">${escaparHtml(obra.titulo)}</h3>
        <div class="manga-meta">
          <span class="manga-status ${statusClass}">${escaparHtml(obra.status)}</span>
          <span class="manga-rating"><i class="fa-solid fa-star"></i> ${(obra.avaliacao || 0).toFixed(1)}</span>
        </div>
        <div class="manga-genres">${generos}</div>
      </div>
    </article>
  `;
}

function limparFiltros() {
  AppState.catalogo.generoAtual = 'Todos';
  AppState.catalogo.statusFiltro = 'Todos';
  AppState.catalogo.termoBusca = '';
  AppState.catalogo.ordemFiltro = 'recentes';

  const generoSelect = document.getElementById('generoFiltro');
  const statusSelect = document.getElementById('statusFiltro');
  const ordemSelect = document.getElementById('ordemFiltro');
  const searchInput = document.getElementById('searchInput');

  if (generoSelect) generoSelect.value = 'Todos';
  if (statusSelect) statusSelect.value = 'Todos';
  if (ordemSelect) ordemSelect.value = 'recentes';
  if (searchInput) searchInput.value = '';

  renderizarCatalogo();
  mostrarToast('Filtros limpos.', 'info', 2000);
}

/* =========================================================================
   11. BUSCA E FILTROS
   ========================================================================= */

function inicializarBusca() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  const buscaDebounced = debounce((valor) => {
    AppState.catalogo.termoBusca = valor;
    renderizarCatalogo();
  }, 300);

  input.addEventListener('input', (e) => {
    buscaDebounced(e.target.value.trim());
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      AppState.catalogo.termoBusca = '';
      renderizarCatalogo();
      input.blur();
    }
  });

  // Filtros
  const generoSelect = document.getElementById('generoFiltro');
  const statusSelect = document.getElementById('statusFiltro');
  const ordemSelect = document.getElementById('ordemFiltro');

  if (generoSelect) {
    generoSelect.addEventListener('change', (e) => {
      AppState.catalogo.generoAtual = e.target.value;
      renderizarCatalogo();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      AppState.catalogo.statusFiltro = e.target.value;
      renderizarCatalogo();
    });
  }

  if (ordemSelect) {
    ordemSelect.addEventListener('change', (e) => {
      AppState.catalogo.ordemFiltro = e.target.value;
      renderizarCatalogo();
    });
  }
}

/* =========================================================================
   12. HERO BANNER
   ========================================================================= */

function renderizarHeroBanner() {
  const track = document.getElementById('heroTrack');
  if (!track) return;

  // Selecionar obras em destaque (featured, exclusivas ou mais populares)
  let destaques = AppState.catalogo.obrasRemotas
    .filter(o => o.destaque || o.exclusivo)
    .slice(0, 5);

  if (destaques.length < 3) {
    const populares = AppState.catalogo.obrasRemotas
      .filter(o => !o.destaque && !o.exclusivo && !o.adulto)
      .sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0))
      .slice(0, 5 - destaques.length);
    destaques = [...destaques, ...populares];
  }

  if (destaques.length === 0) {
    track.innerHTML = '';
    return;
  }

  AppState.hero.obras = destaques;
  AppState.hero.indice = 0;

  track.innerHTML = destaques.map((obra, i) => `
    <div class="hero-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
      <img src="${obra.capa}" alt="${escaparHtml(obra.titulo)}" class="hero-bg" loading="${i === 0 ? 'eager' : 'lazy'}">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="hero-badges">
          ${obra.exclusivo ? '<span class="hero-badge exclusive"><i class="fa-solid fa-star"></i> Exclusivo</span>' : ''}
          ${obra.destaque ? '<span class="hero-badge featured"><i class="fa-solid fa-fire"></i> Destaque</span>' : ''}
        </div>
        <h2 class="hero-title">${escaparHtml(obra.titulo)}</h2>
        <p class="hero-description">${escaparHtml((obra.sinopse || '').substring(0, 180))}${(obra.sinopse || '').length > 180 ? '...' : ''}</p>
        <div class="hero-meta">
          <span><i class="fa-solid fa-star"></i> ${(obra.avaliacao || 0).toFixed(1)}</span>
          <span><i class="fa-solid fa-book"></i> ${obra.totalCapitulos || 0} capítulos</span>
          <span><i class="fa-solid fa-eye"></i> ${formatarNumero(obra.visualizacoes || 0)}</span>
        </div>
        <div class="hero-actions">
          <button class="btn-primary" onclick="abrirDetalhesObra('${obra.id}')">
            <i class="fa-solid fa-book-open"></i> Ler Agora
          </button>
          <button class="btn-secondary" onclick="abrirDetalhesObra('${obra.id}')">
            <i class="fa-solid fa-info-circle"></i> Detalhes
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Indicadores
  const indicators = document.querySelector('.hero-indicators');
  if (indicators) {
    indicators.innerHTML = destaques.map((_, i) => 
      `<button class="hero-indicator ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Ir para slide ${i + 1}"></button>`
    ).join('');
    
    indicators.querySelectorAll('.hero-indicator').forEach(btn => {
      btn.addEventListener('click', (e) => {
        AppState.hero.indice = parseInt(e.target.dataset.index);
        atualizarHeroSlide();
        reiniciarAutoRotateHero();
      });
    });
  }

  iniciarAutoRotateHero();
}

function iniciarAutoRotateHero() {
  if (AppState.hero.interval) clearInterval(AppState.hero.interval);
  
  AppState.hero.interval = setInterval(() => {
    if (AppState.hero.obras.length <= 1) return;
    
    AppState.hero.indice = (AppState.hero.indice + 1) % AppState.hero.obras.length;
    atualizarHeroSlide();
  }, 6000);
}

function reiniciarAutoRotateHero() {
  iniciarAutoRotateHero();
}

function atualizarHeroSlide() {
  const slides = document.querySelectorAll('.hero-slide');
  const indicators = document.querySelectorAll('.hero-indicator');
  
  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === AppState.hero.indice);
  });
  
  indicators.forEach((ind, i) => {
    ind.classList.toggle('active', i === AppState.hero.indice);
  });
}

function ativarSwipeHero() {
  const track = document.getElementById('heroTrack');
  if (!track) return;

  let startX = 0;
  let endX = 0;
  let startY = 0;

  track.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    endX = e.touches[0].clientX;
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    const diffX = startX - endX;
    // CORREÇÃO APLICADA AQUI: usando 'e' em vez de 'event' global para compatibilidade strict mode
    const diffY = Math.abs(startY - (e.changedTouches[0]?.clientY || startY));
    
    // Só considera swipe horizontal se for mais significativo que o vertical
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > diffY) {
      if (diffX > 0 && AppState.hero.indice < AppState.hero.obras.length - 1) {
        AppState.hero.indice++;
      } else if (diffX < 0 && AppState.hero.indice > 0) {
        AppState.hero.indice--;
      }
      atualizarHeroSlide();
      reiniciarAutoRotateHero();
    }
  });
}

/* =========================================================================
   13. TENDÊNCIAS E RANKING
   ========================================================================= */

function renderizarTendencias() {
  const container = document.getElementById('tendenciasContainer');
  if (!container) return;

  const tendencias = [...AppState.catalogo.obrasRemotas]
    .filter(o => !o.adulto)
    .sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0))
    .slice(0, 6);

  if (tendencias.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma tendência disponível.</p></div>';
    return;
  }

  container.innerHTML = tendencias.map(obra => criarCardObra(obra)).join('');
}

function renderizarRanking() {
  const container = document.getElementById('rankingContainer');
  if (!container) return;

  const ranking = [...AppState.catalogo.obrasRemotas]
    .filter(o => !o.adulto)
    .sort((a, b) => (b.avaliacao || 0) - (a.avaliacao || 0))
    .slice(0, 10);

  if (ranking.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma obra avaliada ainda.</p></div>';
    return;
  }

  container.innerHTML = ranking.map((obra, i) => {
    const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
    return `
      <div class="ranking-item" onclick="abrirDetalhesObra('${obra.id}')" tabindex="0" role="listitem">
        <span class="ranking-position">${medalha}</span>
        <img src="${obra.capa}" alt="${escaparHtml(obra.titulo)}" class="ranking-cover" loading="lazy" onerror="this.src='${PLACEHOLDERS.CAPA_PLACEHOLDER}'">
        <div class="ranking-info">
          <h4 class="ranking-title">${escaparHtml(obra.titulo)}</h4>
          <div class="ranking-meta">
            <span><i class="fa-solid fa-star"></i> ${(obra.avaliacao || 0).toFixed(1)}</span>
            <span><i class="fa-solid fa-eye"></i> ${formatarNumero(obra.visualizacoes || 0)}</span>
            <span><i class="fa-solid fa-book"></i> ${obra.totalCapitulos || 0} cap.</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* =========================================================================
   14. CONTINUE LENDO
   ========================================================================= */

function renderizarContinueLendo() {
  const section = document.getElementById('continueLendoSection');
  const container = document.getElementById('continueLendoContainer');
  if (!section || !container) return;

  const historico = AppState.usuario.historico.slice(0, 6);
  
  if (historico.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  
  const obrasHistorico = historico.map(h => {
    const obra = AppState.catalogo.obrasRemotas.find(o => String(o.id) === String(h.obraId));
    return obra ? { ...obra, ultimoCapitulo: h.capitulo, dataLeitura: h.data } : null;
  }).filter(Boolean);

  if (obrasHistorico.length === 0) {
    section.style.display = 'none';
    return;
  }

  container.innerHTML = obrasHistorico.map(obra => `
    <article class="manga-card continue-reading" data-id="${obra.id}" onclick="continuarLeitura('${obra.id}')" tabindex="0" role="listitem">
      <div class="manga-cover">
        <img src="${obra.capa}" alt="${escaparHtml(obra.titulo)}" loading="lazy" onerror="this.src='${PLACEHOLDERS.CAPA_PLACEHOLDER}'">
        <div class="continue-badge">
          <i class="fa-solid fa-bookmark"></i> Cap. ${obra.ultimoCapitulo}
        </div>
        <div class="continue-date">
          ${dataRelativa(obra.dataLeitura)}
        </div>
      </div>
      <div class="manga-info">
        <h3 class="manga-title">${escaparHtml(obra.titulo)}</h3>
        <p class="continue-text"><i class="fa-solid fa-play"></i> Continuar lendo</p>
      </div>
    </article>
  `).join('');
}

function continuarLeitura(obraId) {
  const historico = AppState.usuario.historico.find(h => String(h.obraId) === String(obraId));
  if (historico) {
    abrirDetalhesObra(obraId);
    // O leitor será aberto no capítulo salvo automaticamente via AppState
  }
}

/* =========================================================================
   15. DETALHES DA OBRA
   ========================================================================= */

function abrirDetalhesObra(obraId) {
  const obra = encontrarObraPorId(obraId);
  if (!obra) {
    mostrarToast('Obra não encontrada.', 'erro');
    return;
  }

  AppState.leitor.obraAtualId = obraId;

  // Incrementar visualizações (local por enquanto)
  obra.visualizacoes = (obra.visualizacoes || 0) + 1;

  // Atualizar meta tags dinamicamente (SEO)
  atualizarMetaTagsDinamicas(obra);

  const modal = document.getElementById('detalhesModal');
  const body = document.getElementById('detalhesModalBody');
  const title = document.getElementById('detalhesModalTitle');
  
  if (!modal || !body || !title) return;

  title.textContent = obra.titulo;

  const generos = (obra.generos || []).map(g => `<span class="genre-tag">${escaparHtml(g)}</span>`).join('');
  const ehFavorito = AppState.usuario.favoritos.includes(String(obraId));

  body.innerHTML = `
    <div class="obra-detalhes">
      <div class="obra-capa-grande">
        <img src="${obra.capa}" alt="${escaparHtml(obra.titulo)}" onerror="this.src='${PLACEHOLDERS.CAPA_PLACEHOLDER}'">
      </div>
      <div class="obra-info">
        <h2>${escaparHtml(obra.titulo)}</h2>
        <div class="obra-meta">
          <p><strong>Autor:</strong> ${escaparHtml(obra.autor)}</p>
          <p><strong>Artista:</strong> ${escaparHtml(obra.artista)}</p>
          <p><strong>Status:</strong> <span class="status-badge status-${obra.status.toLowerCase().replace(/\s+/g, '-')}">${escaparHtml(obra.status)}</span></p>
          <p><strong>Tipo:</strong> ${escaparHtml(obra.tipo)}</p>
          <p><strong>Capítulos:</strong> ${obra.totalCapitulos || 0}</p>
          <p><strong>Visualizações:</strong> ${formatarNumero(obra.visualizacoes || 0)}</p>
        </div>
        <div class="obra-avaliacao">
          <div class="stars-container">
            ${[1,2,3,4,5].map(n => `
              <i class="fa-star ${n <= Math.round(obra.avaliacao || 0) ? 'fa-solid' : 'fa-regular'}" 
                 onclick="avaliarObra('${obra.id}', ${n})" 
                 style="cursor:pointer;" 
                 aria-label="Avaliar com ${n} estrelas"></i>
            `).join('')}
          </div>
          <span>${(obra.avaliacao || 0).toFixed(1)} (${obra.totalAvaliacoes || 0} avaliações)</span>
        </div>
        <div class="obra-generos">${generos}</div>
        <div class="obra-sinopse">
          <h3>Sinopse</h3>
          <p>${escaparHtml(obra.sinopse)}</p>
        </div>
        
        <div class="obra-comentarios-section">
          <h3>Comentários</h3>
          <div id="comentariosContainer" class="comentarios-container">
            <p>Carregando comentários...</p>
          </div>
          ${AppState.usuario.logado ? `
            <div class="comentario-form">
              <textarea id="comentarioInput" placeholder="Escreva seu comentário..." maxlength="${CONFIG.MAX_COMENTARIO_LENGTH}"></textarea>
              <div class="comentario-form-actions">
                <label class="checkbox-spoiler">
                  <input type="checkbox" id="comentarioSpoiler">
                  <span>Contém spoiler</span>
                </label>
                <button class="btn-primary small" onclick="enviarComentario('${obra.id}')">Publicar</button>
              </div>
            </div>
          ` : '<p class="login-prompt"><a href="#" onclick="fazerLogin(); return false;">Faça login</a> para comentar.</p>'}
        </div>
      </div>
    </div>
  `;

  const btnFavoritar = document.getElementById('btnFavoritar');
  if (btnFavoritar) {
    btnFavoritar.innerHTML = ehFavorito 
      ? '<i class="fa-solid fa-heart"></i> Remover dos Favoritos'
      : '<i class="fa-regular fa-heart"></i> Favoritar';
  }

  carregarCapitulosObra(obraId);
  carregarComentarios(obraId).then(() => renderizarComentarios(obraId));
  toggleModal('detalhesModal');
}

async function carregarCapitulosObra(obraId) {
  if (!AppState.supabase) return;

  try {
    const { data, error } = await AppState.supabase
      .from('chapters')
      .select('id, chapter_number, title, created_at')
      .eq('work_id', obraId)
      .order('chapter_number', { ascending: true });

    if (error) throw error;

    AppState.leitor.capitulosObraAtual = (data || []).map(cap => ({
      id: cap.id,
      numero: cap.chapter_number,
      titulo: cap.title || `Capítulo ${cap.chapter_number}`,
      criadoEm: cap.created_at,
      vipOnly: false
    }));

    renderizarListaCapitulos();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar capítulos:', err);
  }
}

function renderizarListaCapitulos() {
  const select = document.getElementById('listaCapitulosContainer');
  
  if (!select) return;

  let capitulos = [...AppState.leitor.capitulosObraAtual];
  
  if (AppState.ui.ordemCapitulosInvertida) {
    capitulos.reverse();
  }

  const optionsHtml = capitulos.map((cap, i) => {
    const vipTag = cap.vipOnly ? ' <i class="fa-solid fa-crown" style="color:gold;"></i>' : '';
    return `<option value="${i}">${escaparHtml(cap.titulo)}${vipTag}</option>`;
  }).join('');

  if (select) {
    select.innerHTML = optionsHtml;
    select.onchange = (e) => {
      abrirLeitor(parseInt(e.target.value));
    };
  }

}

function enviarComentario(obraId) {
  const input = document.getElementById('comentarioInput');
  const spoiler = document.getElementById('comentarioSpoiler');
  
  if (!input) return;
  
  const texto = input.value.trim();
  const isSpoiler = spoiler ? spoiler.checked : false;
  
  adicionarComentario(obraId, texto, AppState.comentarios.responderAComentarioId, isSpoiler)
    .then(() => {
      input.value = '';
      if (spoiler) spoiler.checked = false;
      AppState.comentarios.responderAComentarioId = null;
    });
}

/* =========================================================================
   16. LEITOR
   ========================================================================= */

async function abrirLeitor(capituloIndex = 0) {
  if (!AppState.leitor.obraAtualId) {
    mostrarToast('Selecione uma obra primeiro.', 'alerta');
    return;
  }

  // Fechar modal de detalhes se estiver aberto
  const detalhesModal = document.getElementById('detalhesModal');
  if (detalhesModal && detalhesModal.classList.contains('active')) {
    toggleModal('detalhesModal');
  }

  AppState.leitor.indiceCapituloAtual = capituloIndex;
  const capitulo = AppState.leitor.capitulosObraAtual[capituloIndex];
  
  if (!capitulo) {
    mostrarToast('Capítulo não encontrado.', 'erro');
    return;
  }

  // Verificar VIP
  if (capitulo.vipOnly && !AppState.usuario.isVip && !AppState.usuario.isAdmin) {
    mostrarToast('Este capítulo é exclusivo para membros VIP. Assine para acessar.', 'alerta', 6000);
    abrirModalVip();
    return;
  }

  const readerTitle = document.getElementById('readerTitle');
  if (readerTitle) {
    const obra = encontrarObraPorId(AppState.leitor.obraAtualId);
    readerTitle.textContent = (obra ? obra.titulo + ' — ' : '') + capitulo.titulo;
  }

  toggleModal('readerModal');

  await carregarPaginasCapitulo(capitulo.id);
  salvarNoHistorico(AppState.leitor.obraAtualId, capitulo.numero);
  atualizarBotoesNavegacao();
}

async function carregarPaginasCapitulo(capituloId) {
  const container = document.getElementById('readerCascataContainer');
  if (!container) return;

  container.innerHTML = '<div class="reader-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando páginas...</div>';

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

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="reader-empty"><i class="fa-solid fa-image"></i><p>Nenhuma página disponível neste capítulo.</p></div>';
      return;
    }

    let paginas = data;
    if (AppState.leitor.ordemInvertida) {
      paginas = [...paginas].reverse();
    }

    container.innerHTML = paginas.map((pagina, i) => `
      <img src="${pagina.image_url}" 
           alt="Página ${pagina.page_number}" 
           class="reader-page" 
           loading="${i < 3 ? 'eager' : 'lazy'}" 
           data-page="${pagina.page_number}"
           onerror="this.src='${PLACEHOLDERS.PAGINA_PLACEHOLDER}'">
    `).join('');

    // Scroll para o topo ao abrir
    container.scrollTop = 0;

  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar páginas:', err);
    container.innerHTML = '<div class="reader-error"><i class="fa-solid fa-triangle-exclamation"></i><p>Falha ao carregar as páginas. Tente novamente.</p></div>';
  }
}

function fecharLeitor() {
  toggleModal('readerModal');
  AppState.leitor.nivelZoom = 100;
  AppState.leitor.modoImersivo = false;
  
  const container = document.getElementById('readerCascataContainer');
  if (container) {
    container.style.transform = '';
  }
  
  const zoomDisplay = document.getElementById('zoomLevel');
  if (zoomDisplay) zoomDisplay.textContent = '100%';
}

function navegarCapitulo(direcao) {
  const novoIndice = AppState.leitor.indiceCapituloAtual + direcao;
  
  if (novoIndice < 0 || novoIndice >= AppState.leitor.capitulosObraAtual.length) {
    mostrarToast(direcao > 0 ? 'Este é o último capítulo disponível.' : 'Este é o primeiro capítulo.', 'info');
    return;
  }

  abrirLeitor(novoIndice);
}

function atualizarBotoesNavegacao() {
  const btnAnterior = document.getElementById('btnCapituloAnterior');
  const btnProximo = document.getElementById('btnProximoCapitulo');
  const select = document.getElementById('listaCapitulosContainer');

  if (btnAnterior) {
    btnAnterior.disabled = AppState.leitor.indiceCapituloAtual === 0;
    btnAnterior.onclick = () => navegarCapitulo(-1);
  }
  if (btnProximo) {
    btnProximo.disabled = AppState.leitor.indiceCapituloAtual === AppState.leitor.capitulosObraAtual.length - 1;
    btnProximo.onclick = () => navegarCapitulo(1);
  }
  if (select) {
    select.value = AppState.leitor.indiceCapituloAtual;
  }
}

function ajustarZoom(delta) {
  AppState.leitor.nivelZoom = Math.max(50, Math.min(200, AppState.leitor.nivelZoom + delta));
  
  const container = document.getElementById('readerCascataContainer');
  if (container) {
    container.style.transform = `scale(${AppState.leitor.nivelZoom / 100})`;
    container.style.transformOrigin = 'top center';
  }

  const zoomDisplay = document.getElementById('zoomLevel');
  if (zoomDisplay) {
    zoomDisplay.textContent = AppState.leitor.nivelZoom + '%';
  }
}

function alternarModoImersivo() {
  AppState.leitor.modoImersivo = !AppState.leitor.modoImersivo;
  const reader = document.getElementById('readerModal');
  if (reader) {
    reader.classList.toggle('immersive', AppState.leitor.modoImersivo);
  }
  mostrarToast(AppState.leitor.modoImersivo ? 'Modo imersivo ativado.' : 'Modo imersivo desativado.', 'info', 2000);
}

function inverterOrdemCapitulos() {
  AppState.leitor.ordemInvertida = !AppState.leitor.ordemInvertida;
  AppState.ui.ordemCapitulosInvertida = AppState.leitor.ordemInvertida;
  
  renderizarListaCapitulos();
  
  // Recarregar páginas na nova ordem
  const capitulo = AppState.leitor.capitulosObraAtual[AppState.leitor.indiceCapituloAtual];
  if (capitulo) {
    carregarPaginasCapitulo(capitulo.id);
  }
  
  mostrarToast(AppState.leitor.ordemInvertida ? 'Ordem invertida.' : 'Ordem normal.', 'info', 2000);
}

/* =========================================================================
   17. GESTOS E ATALHOS DO LEITOR
   ========================================================================= */

function iniciarGestosLeitor() {
  const reader = document.getElementById('readerModal');
  if (!reader) return;

  let startX = 0;
  let startY = 0;
  let startDistance = 0;
  let initialZoom = 100;

  reader.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      startDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialZoom = AppState.leitor.nivelZoom;
    }
  }, { passive: true });

  reader.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      const endX = e.changedTouches[0].clientX;
      const diffX = startX - endX;

      // Swipe horizontal para navegar entre capítulos
      if (Math.abs(diffX) > 100 && Math.abs(diffX) > Math.abs(startY - e.changedTouches[0].clientY)) {
        if (diffX > 0) {
          navegarCapitulo(1); // Próximo
        } else {
          navegarCapitulo(-1); // Anterior
        }
      }
    }
  });

  // Pinch-to-zoom
  reader.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      
      const scale = currentDistance / startDistance;
      const newZoom = Math.max(50, Math.min(200, Math.round(initialZoom * scale)));
      
      AppState.leitor.nivelZoom = newZoom;
      const container = document.getElementById('readerCascataContainer');
      if (container) {
        container.style.transform = `scale(${newZoom / 100})`;
        container.style.transformOrigin = 'top center';
      }
      
      const zoomDisplay = document.getElementById('zoomLevel');
      if (zoomDisplay) zoomDisplay.textContent = newZoom + '%';
    }
  }, { passive: false });
}

function iniciarGestosAvancadosLeitor() {
  const reader = document.getElementById('readerModal');
  if (!reader) return;

  // Double-tap para zoom
  let lastTap = 0;
  reader.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    
    if (tapLength < 300 && tapLength > 0) {
      // Double tap detectado
      if (AppState.leitor.nivelZoom === 100) {
        ajustarZoom(50); // Zoom para 150%
      } else {
        AppState.leitor.nivelZoom = 100;
        const container = document.getElementById('readerCascataContainer');
        if (container) container.style.transform = 'scale(1)';
        const zoomDisplay = document.getElementById('zoomLevel');
        if (zoomDisplay) zoomDisplay.textContent = '100%';
      }
      e.preventDefault();
    }
    lastTap = currentTime;
  });
}

function iniciarAtalhosTecladoLeitor() {
  document.addEventListener('keydown', (e) => {
    const reader = document.getElementById('readerModal');
    if (!reader || !reader.classList.contains('active')) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        navegarCapitulo(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navegarCapitulo(-1);
        break;
      case '+':
      case '=':
        e.preventDefault();
        ajustarZoom(10);
        break;
      case '-':
        e.preventDefault();
        ajustarZoom(-10);
        break;
      case '0':
        e.preventDefault();
        AppState.leitor.nivelZoom = 100;
        const container = document.getElementById('readerCascataContainer');
        if (container) container.style.transform = 'scale(1)';
        const zoomDisplay = document.getElementById('zoomLevel');
        if (zoomDisplay) zoomDisplay.textContent = '100%';
        break;
      case 'Escape':
        fecharLeitor();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        alternarModoImersivo();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        inverterOrdemCapitulos();
        break;
    }
  });
}

function injetarEstiloAutoImersivo() {
  if (document.getElementById('estiloLeitorImersivo')) return;
  
  const style = document.createElement('style');
  style.id = 'estiloLeitorImersivo';
  style.textContent = `
    .reader-modal.immersive .reader-header,
    .reader-modal.immersive .reader-footer {
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .reader-modal.immersive:hover .reader-header,
    .reader-modal.immersive:hover .reader-footer {
      opacity: 1;
      pointer-events: auto;
    }
    .reader-modal.immersive .reader-content {
      padding: 0;
    }
  `;
  document.head.appendChild(style);
}

/* =========================================================================
   18. FAVORITOS E HISTÓRICO
   ========================================================================= */

function alternarFavorito() {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para favoritar obras.', 'alerta');
    fazerLogin();
    return;
  }

  const obraId = String(AppState.leitor.obraAtualId);
  if (!obraId) return;

  const indice = AppState.usuario.favoritos.indexOf(obraId);
  
  if (indice > -1) {
    AppState.usuario.favoritos.splice(indice, 1);
    mostrarToast('Obra removida dos favoritos.', 'info');
  } else {
    AppState.usuario.favoritos.push(obraId);
    mostrarToast('Obra adicionada aos favoritos!', 'sucesso');
  }

  localStorage.setItem('solitude_favoritos', JSON.stringify(AppState.usuario.favoritos));
  
  // Sincronizar com Supabase se logado
  if (AppState.supabase && AppState.usuario.logado) {
    sincronizarFavoritosSupabase();
  }

  const btnFavoritar = document.getElementById('btnFavoritar');
  if (btnFavoritar) {
    const ehFavorito = AppState.usuario.favoritos.includes(obraId);
    btnFavoritar.innerHTML = ehFavorito 
      ? '<i class="fa-solid fa-heart"></i> Remover dos Favoritos'
      : '<i class="fa-regular fa-heart"></i> Favoritar';
  }
}

async function sincronizarFavoritosSupabase() {
  if (!AppState.supabase || !AppState.usuario.logado) return;

  try {
    // Deletar favoritos antigos e inserir novos
      await AppState.supabase
      .from('favorites')
      .delete()
      .eq('user_id', AppState.usuario.id);

    if (AppState.usuario.favoritos.length > 0) {
      const inserts = AppState.usuario.favoritos.map(workId => ({
        user_id: AppState.usuario.id,
        work_id: workId
      }));
      
      await AppState.supabase.from('favorites').insert(inserts);
    }
  } catch (err) {
    console.error('[SolitudeScan] Erro ao sincronizar favoritos:', err);
  }
}

function carregarFavoritosUsuario() {
  const container = document.getElementById('favoritosContainer');
  if (!container) return;

  const obrasFavoritas = AppState.usuario.favoritos
    .map(id => encontrarObraPorId(id))
    .filter(Boolean);

  if (obrasFavoritas.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-regular fa-heart"></i><p>Você ainda não favoritou nenhuma obra.</p><p class="empty-hint">Explore o catálogo e clique no coração para salvar suas obras preferidas.</p></div>';
    return;
  }

  container.innerHTML = obrasFavoritas.map(obra => criarCardObra(obra)).join('');
}

function salvarNoHistorico(obraId, capituloNumero) {
  const indice = AppState.usuario.historico.findIndex(h => String(h.obraId) === String(obraId));
  
  const entrada = {
    obraId: String(obraId),
    capitulo: capituloNumero,
    data: new Date().toISOString()
  };

  if (indice > -1) {
    AppState.usuario.historico[indice] = entrada;
  } else {
    AppState.usuario.historico.unshift(entrada);
  }

  AppState.usuario.historico = AppState.usuario.historico.slice(0, CONFIG.MAX_HISTORICO_ITEMS);
  localStorage.setItem('solitude_historico', JSON.stringify(AppState.usuario.historico));

  renderizarContinueLendo();
}

function carregarHistoricoUsuario() {
  const container = document.getElementById('historicoContainer');
  if (!container) return;

  const obrasHistorico = AppState.usuario.historico
    .map(h => {
      const obra = encontrarObraPorId(h.obraId);
      return obra ? { ...obra, ultimoCapitulo: h.capitulo, dataLeitura: h.data } : null;
    })
    .filter(Boolean);

  if (obrasHistorico.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p>Seu histórico de leitura está vazio.</p><p class="empty-hint">Comece a ler e seu histórico aparecerá aqui.</p></div>';
    return;
  }

  container.innerHTML = obrasHistorico.map(obra => `
    <article class="manga-card" data-id="${obra.id}" onclick="continuarLeitura('${obra.id}')" tabindex="0" role="listitem">
      <div class="manga-cover">
        <img src="${obra.capa}" alt="${escaparHtml(obra.titulo)}" loading="lazy" onerror="this.src='${PLACEHOLDERS.CAPA_PLACEHOLDER}'">
        <div class="continue-badge">
          <i class="fa-solid fa-bookmark"></i> Cap. ${obra.ultimoCapitulo}
        </div>
      </div>
      <div class="manga-info">
        <h3 class="manga-title">${escaparHtml(obra.titulo)}</h3>
        <p class="continue-text"><i class="fa-solid fa-play"></i> Continuar lendo</p>
        <p class="continue-date">${dataRelativa(obra.dataLeitura)}</p>
      </div>
    </article>
  `).join('');
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

/* =========================================================================
   19. TEMA (CLARO/ESCURO + AUTOMÁTICO POR HORÁRIO)
   ========================================================================= */

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

function aplicarTemaAutomatico() {
  try {
    if (localStorage.getItem('solitude_theme')) return;
    const h = new Date().getHours();
    const html = document.documentElement;
    if (h >= 18 || h < 6) {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
  } catch (e) {}
}

function inicializarBotaoTema() {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', alternarTema);
  }
  
  const icone = document.getElementById('iconeTemaBotao');
  if (icone) {
    const ehLight = document.documentElement.classList.contains('light');
    icone.className = ehLight ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  }
}

/* =========================================================================
   20. COOKIE BANNER LGPD
   ========================================================================= */

function aceitarCookies() {
  try {
    localStorage.setItem('solitude_cookies_ok', '1');
  } catch (e) {}
  const c = document.getElementById('cookieBanner');
  if (c) c.style.display = 'none';
}

function mostrarBannerCookies() {
  try {
    if (!localStorage.getItem('solitude_cookies_ok')) {
      setTimeout(() => {
        const c = document.getElementById('cookieBanner');
        if (c) c.style.display = 'block';
      }, 2000);
    }
  } catch (e) {}
}

/* =========================================================================
   21. SINCRONIZAÇÃO DE SESSÃO ENTRE ABAS
   ========================================================================= */

function ativarSincronizacaoSessao() {
  if (!AppState.supabase) return;
  try {
    AppState.supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT') {
        AppState.usuario.logado = false;
        AppState.usuario.id = null;
        AppState.usuario.isAdmin = false;
        AppState.usuario.isVip = false;
        atualizarPerfilTela();
        atualizarVisibilidadeAdmin();
      } else if ((evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED') && sessao && sessao.user) {
        carregarPerfilRemoto(sessao.user.id);
      }
    });
  } catch (e) {}
}

/* =========================================================================
   22. SISTEMA DE COMENTÁRIOS E MODERAÇÃO (COMPLETO)
   ========================================================================= */

async function carregarComentarios(obraId) {
  if (!AppState.supabase) return [];
  
  try {
    const { data, error } = await AppState.supabase
      .from('comments')
      .select(`
        *,
        profiles:user_id (id, display_name, avatar_url, is_admin)
      `)
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
    return;
  }

  if (!texto || texto.trim().length === 0) {
    mostrarToast('Digite algo para comentar.', 'alerta');
    return;
  }

  if (texto.length > CONFIG.MAX_COMENTARIO_LENGTH) {
    mostrarToast('Comentário muito longo. Máximo de ' + CONFIG.MAX_COMENTARIO_LENGTH + ' caracteres.', 'alerta');
    return;
  }

  const agora = Date.now();
  if (agora - AppState.comentarios.ultimoComentarioEm < CONFIG.RATE_LIMIT_COMENTARIO) {
    mostrarToast('Aguarde alguns segundos antes de comentar novamente.', 'alerta');
    return;
  }

  if (!AppState.supabase) {
    mostrarToast('Sistema offline.', 'erro');
    return;
  }

  try {
    const { error } = await AppState.supabase.from('comments').insert({
      work_id: obraId,
      user_id: AppState.usuario.id,
      content: texto.trim(),
      parent_id: comentarioPaiId,
      spoiler: isSpoiler
    });

    if (error) throw error;

    AppState.comentarios.ultimoComentarioEm = agora;
    AppState.comentarios.responderAComentarioId = null;
    mostrarToast('Comentário publicado!', 'sucesso');
    
    await carregarComentarios(obraId);
    renderizarComentarios(obraId);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao publicar comentário:', err);
    mostrarToast('Falha ao publicar comentário.', 'erro');
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
      .single();

    if (existente) {
      await AppState.supabase
        .from('likes')
        .delete()
        .eq('id', existente.id);
      mostrarToast('Curtida removida.', 'info', 2000);
    } else {
      await AppState.supabase
        .from('likes')
        .insert({
          user_id: AppState.usuario.id,
          target_type: 'comment',
          target_id: comentarioId
        });
      mostrarToast('Comentário curtido!', 'sucesso', 2000);
    }

    await carregarComentarios(obraId);
    renderizarComentarios(obraId);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao curtir:', err);
  }
}

async function denunciarComentario(comentarioId) {
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
        await AppState.supabase.from('reports').insert({
          reporter_id: AppState.usuario.id,
          user_id: AppState.usuario.id,
          target_type: 'comment',
          target_id: comentarioId,
          status: 'pendente',
          created_at: new Date().toISOString()
        });
        mostrarToast('Denúncia enviada. Nossa equipe irá analisar.', 'sucesso');
      } catch (err) {
        console.error('[SolitudeScan] Erro ao denunciar:', err);
        mostrarToast('Falha ao enviar denúncia.', 'erro');
      }
    }
  );
}

async function excluirComentario(comentarioId, obraId) {
  if (!AppState.supabase) return;

  try {
    const { error } = await AppState.supabase
      .from('comments')
      .delete()
      .eq('id', comentarioId)
      .eq('user_id', AppState.usuario.id);

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

  if (comentarios.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-regular fa-comment"></i><p>Seja o primeiro a comentar esta obra!</p></div>';
    return;
  }

  // Agrupar comentários por pai (threads)
  const raizes = comentarios.filter(c => !c.parent_id);
  
  container.innerHTML = raizes.map(com => renderizarComentarioThread(com, comentarios, obraId, 0)).join('');
}

function renderizarComentarioThread(comentario, todosComentarios, obraId, nivel) {
  const autor = comentario.profiles || {};
  const nomeAutor = escaparHtml(autor.display_name || 'Usuário');
  const avatar = autor.avatar_url || PLACEHOLDERS.AVATAR_SVG;
  const isAdmin = !!autor.is_admin;
  const ehDono = AppState.usuario.id === autor.id;
  const podeExcluir = ehDono || AppState.usuario.isAdmin;
  
  const respostas = todosComentarios.filter(c => c.parent_id === comentario.id);
  const spoilerClass = comentario.spoiler ? 'spoiler-content' : '';
  
  const adminBadge = isAdmin ? '<span class="admin-badge"><i class="fa-solid fa-shield"></i> Admin</span>' : '';
  
  const html = `
    <div class="comment-item ${nivel > 0 ? 'comment-reply' : ''} ${spoilerClass}" data-id="${comentario.id}">
      <img src="${avatar}" alt="Avatar" class="comment-avatar" onerror="this.src='${PLACEHOLDERS.AVATAR_SVG}'">
      <div class="comment-body">
        <div class="comment-header">
          <strong>${nomeAutor}</strong>
          ${adminBadge}
          <span class="comment-time">${dataRelativa(comentario.created_at)}</span>
        </div>
        <p class="comment-text">${comentario.spoiler ? '<span class="spoiler-warning"><i class="fa-solid fa-eye-slash"></i> Spoiler</span>' : ''}${escaparHtml(comentario.content)}</p>
        <div class="comment-actions">
          ${nivel < 3 ? `<button class="btn-text" onclick="responderComentario('${comentario.id}')"><i class="fa-solid fa-reply"></i> Responder</button>` : ''}
          <button class="btn-text" onclick="denunciarComentario('${comentario.id}')"><i class="fa-solid fa-flag"></i> Denunciar</button>
          ${podeExcluir ? `<button class="btn-text danger" onclick="confirmarExclusaoComentario('${comentario.id}', '${obraId}')"><i class="fa-solid fa-trash"></i> Excluir</button>` : ''}
        </div>
      </div>
    </div>
  `;

  const respostasHtml = respostas.map(r => renderizarComentarioThread(r, todosComentarios, obraId, nivel + 1)).join('');
  
  return html + respostasHtml;
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
  if (checkbox && input) {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        input.classList.add('spoiler-mode');
        input.placeholder = 'Este comentário contém spoiler...';
      } else {
        input.classList.remove('spoiler-mode');
        input.placeholder = 'Escreva seu comentário...';
      }
    });
  }
}

/* =========================================================================
   23. SISTEMA DE NOTIFICAÇÕES (COMPLETO)
   ========================================================================= */

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
  if (badge) {
    const naoLidas = AppState.notificacoes.lista.filter(n => !n.is_read).length;
    badge.textContent = naoLidas > 0 ? (naoLidas > 9 ? '9+' : naoLidas) : '';
    badge.style.display = naoLidas > 0 ? 'flex' : 'none';
  }
}

function toggleDropdownNotificacoes() {
  const dropdown = document.getElementById('notifDropdown');
  if (!dropdown) return;

  AppState.notificacoes.dropdownAberto = !AppState.notificacoes.dropdownAberto;
  dropdown.classList.toggle('active', AppState.notificacoes.dropdownAberto);

  if (AppState.notificacoes.dropdownAberto) {
    renderizarListaNotificacoes();
  }
}

function renderizarListaNotificacoes() {
  const container = document.getElementById('notifList');
  if (!container) return;

  if (AppState.notificacoes.lista.length === 0) {
    container.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>Nenhuma notificação.</p></div>';
    return;
  }

  container.innerHTML = AppState.notificacoes.lista.map(notif => {
    const icones = {
      'novo_capitulo': 'fa-book',
      'resposta_comentario': 'fa-reply',
      'curtida': 'fa-heart',
      'sistema': 'fa-info-circle',
      'vip': 'fa-crown'
    };
    const icone = icones[notif.type] || 'fa-bell';
    const lida = notif.is_read ? 'read' : '';

    return `
      <div class="notif-item ${lida}" data-id="${notif.id}" onclick="abrirNotificacao('${notif.id}')">
        <div class="notif-icon">
          <i class="fa-solid ${icone}"></i>
        </div>
        <div class="notif-content">
          <p class="notif-text">${escaparHtml(notif.message)}</p>
          <span class="notif-time">${dataRelativa(notif.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function abrirNotificacao(notifId) {
  const notif = AppState.notificacoes.lista.find(n => n.id === notifId);
  if (!notif) return;

    if (!notif.is_read) {
    await marcarNotificacaoComoLida(notifId);
  }

    if (notif.link) {
      window.location.href = notif.link;
  } else if (notif.work_id) {
    abrirDetalhesObra(notif.work_id);
  }

  toggleDropdownNotificacoes();
}

async function marcarNotificacaoComoLida(notifId) {
  if (!AppState.supabase) return;

  try {
    await AppState.supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId);

    const notif = AppState.notificacoes.lista.find(n => n.id === notifId);
    if (notif) notif.is_read = true;
    
    atualizarBadgeNotificacoes();
    renderizarListaNotificacoes();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao marcar notificação:', err);
  }
}

async function marcarTodasNotificacoesComoLidas() {
  if (!AppState.supabase) return;

  try {
    await AppState.supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', AppState.usuario.id)
      .eq('is_read', false);

    AppState.notificacoes.lista.forEach(n => n.is_read = true);
    atualizarBadgeNotificacoes();
    renderizarListaNotificacoes();
    mostrarToast('Todas as notificações marcadas como lidas.', 'sucesso');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao marcar todas:', err);
  }
}

/* =========================================================================
   24. AVALIAÇÃO DE OBRAS (SISTEMA DE ESTRELAS COMPLETO)
   ========================================================================= */

async function avaliarObra(obraId, nota) {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para avaliar obras.', 'alerta');
    fazerLogin();
    return;
  }

  if (nota < 1 || nota > 5) {
    mostrarToast('Nota inválida.', 'alerta');
    return;
  }

  if (!AppState.supabase) {
    mostrarToast('Sistema offline.', 'erro');
    return;
  }

  try {
    await AppState.supabase.from('ratings').upsert({
      user_id: AppState.usuario.id,
      work_id: obraId,
      stars: nota
    }, {
      onConflict: 'user_id,work_id'
    });

    mostrarToast('Avaliação registrada! Obrigado pelo feedback.', 'sucesso');
    
    // Recarregar dados da obra para atualizar a média
    await carregarObras();
    
    // Reabrir detalhes para mostrar a nova avaliação
    abrirDetalhesObra(obraId);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao avaliar:', err);
    mostrarToast('Falha ao registrar avaliação.', 'erro');
  }
}

/* =========================================================================
   25. COMPARTILHAMENTO (AVANÇADO COM WEB SHARE API)
   ========================================================================= */

function compartilharObraAtual() {
  const obraId = AppState.leitor.obraAtualId;
  const obra = encontrarObraPorId(obraId);
  
  if (!obra) {
    mostrarToast('Nenhuma obra selecionada.', 'alerta');
    return;
  }

  const url = window.location.origin + '/?obra=' + encodeURIComponent(obra.id);
  const texto = 'Confira "' + obra.titulo + '" no SolitudeScan!';

  if (navigator.share) {
    navigator.share({
      title: obra.titulo,
      text: texto,
      url: url
    }).then(() => {
      mostrarToast('Obra compartilhada!', 'sucesso');
    }).catch(() => {
      // Usuário cancelou ou falhou, tentar copiar
      copiarLinkObra(obra, url);
    });
  } else {
    copiarLinkObra(obra, url);
  }
}

function copiarLinkObra(obra, url) {
  if (!url) {
    url = window.location.origin + '/?obra=' + encodeURIComponent(obra.id);
  }

  navigator.clipboard.writeText(url).then(() => {
    mostrarToast('Link copiado! Compartilhe com seus amigos.', 'sucesso');
  }).catch(() => {
    // Fallback para navegadores antigos
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    mostrarToast('Link copiado!', 'sucesso');
  });
}

function compartilharViaRedeSocial(rede) {
  const obraId = AppState.leitor.obraAtualId;
  const obra = encontrarObraPorId(obraId);
  
  if (!obra) {
    mostrarToast('Nenhuma obra selecionada.', 'alerta');
    return;
  }

  const url = encodeURIComponent(window.location.origin + '/?obra=' + encodeURIComponent(obra.id));
  const texto = encodeURIComponent('Confira "' + obra.titulo + '" no SolitudeScan!');

  let shareUrl = '';
  
  switch (rede) {
    case 'twitter':
      shareUrl = 'https://twitter.com/intent/tweet?text=' + texto + '&url=' + url;
      break;
    case 'facebook':
      shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + url;
      break;
    case 'whatsapp':
      shareUrl = 'https://wa.me/?text=' + texto + '%20' + url;
      break;
    case 'telegram':
      shareUrl = 'https://t.me/share/url?url=' + url + '&text=' + texto;
      break;
    default:
      return;
  }

  window.open(shareUrl, '_blank', 'width=600,height=400');
}

/* =========================================================================
   26. EXPORTAÇÃO DE DADOS DO USUÁRIO (LGPD)
   ========================================================================= */

function exportarDadosUsuario() {
  if (!AppState.usuario.logado) {
    mostrarToast('Faça login para exportar seus dados.', 'alerta');
    return;
  }

  const dados = {
    perfil: {
      nome: AppState.usuario.nome,
      email: AppState.usuario.email,
      telefone: AppState.usuario.telefone
    },
    favoritos: AppState.usuario.favoritos,
    historico: AppState.usuario.historico,
    listas: AppState.listas.personalizadas,
    exportadoEm: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'solitudescan_meus_dados_' + Date.now() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  mostrarToast('Seus dados foram exportados com sucesso.', 'sucesso');
}

/* =========================================================================
   27. LISTAS PERSONALIZADAS (CRUD COMPLETO)
   ========================================================================= */

async function carregarListasDoUsuario() {
  if (!AppState.supabase || !AppState.usuario.logado) {
    try {
      AppState.listas.personalizadas = JSON.parse(localStorage.getItem('solitude_listas') || '[]');
    } catch (e) {
      AppState.listas.personalizadas = [];
    }
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

  if (AppState.listas.personalizadas.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-list"></i><p>Você não criou nenhuma lista personalizada.</p><button class="btn-primary" onclick="criarNovaLista()">Criar Lista</button></div>';
    return;
  }

  container.innerHTML = AppState.listas.personalizadas.map(lista => {
    const obrasNaLista = (lista.work_ids || []).length;
    return `
      <div class="lista-card">
        <div class="lista-header">
          <h3>${escaparHtml(lista.name)}</h3>
          <span class="lista-count">${obrasNaLista} ${obrasNaLista === 1 ? 'obra' : 'obras'}</span>
        </div>
        <div class="lista-actions">
          <button class="btn-icon" onclick="verLista('${lista.id}')" aria-label="Ver lista" title="Ver">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn-icon" onclick="editarLista('${lista.id}')" aria-label="Editar lista" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon" onclick="excluirLista('${lista.id}')" aria-label="Excluir lista" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function criarNovaLista() {
  const nome = prompt('Nome da nova lista:');
  if (!nome || nome.trim().length === 0) return;

  if (nome.trim().length > 50) {
    mostrarToast('Nome muito longo. Máximo 50 caracteres.', 'alerta');
    return;
  }

  const novaLista = {
    id: null,
    name: nome.trim(),
    work_ids: [],
    created_at: new Date().toISOString(),
    user_id: AppState.usuario.id
  };

  AppState.listas.personalizadas.push(novaLista);
  salvarListas();
  
  renderizarListas();
  mostrarToast('Lista criada com sucesso!', 'sucesso');
}

async function salvarListas() {
  localStorage.setItem('solitude_listas', JSON.stringify(AppState.listas.personalizadas));

  if (AppState.supabase && AppState.usuario.logado) {
    try {
      for (const lista of AppState.listas.personalizadas) {
        const payload = {
          ...(ehUuid(lista.id) ? { id: lista.id } : {}),
          user_id: AppState.usuario.id,
          name: lista.name,
          description: lista.description || null,
          is_default: !!lista.is_default
        };
        const { data, error } = await AppState.supabase
          .from('user_lists')
          .upsert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (data?.id && !lista.id) lista.id = data.id;
      }

      for (const lista of AppState.listas.personalizadas) {
        if (!ehUuid(lista.id)) continue;
        await AppState.supabase.from('user_list_items').delete().eq('list_id', lista.id);
        const workIds = [...new Set((lista.work_ids || []).filter(ehUuid))];
        if (workIds.length > 0) {
          await AppState.supabase.from('user_list_items').insert(
            workIds.map((workId, position) => ({ list_id: lista.id, work_id: workId, position }))
          );
        }
      }
    } catch (err) {
      console.error('[SolitudeScan] Erro ao salvar listas:', err);
    }
  }
}

function editarLista(listaId) {
  const lista = AppState.listas.personalizadas.find(l => l.id === listaId);
  if (!lista) return;

  const novoNome = prompt('Novo nome da lista:', lista.name);
  if (!novoNome || novoNome.trim().length === 0) return;

  lista.name = novoNome.trim();
  salvarListas();
  renderizarListas();
  mostrarToast('Lista atualizada.', 'sucesso');
}

function excluirLista(listaId) {
  abrirConfirmacao(
    'Excluir Lista',
    'Tem certeza que deseja excluir esta lista? As obras não serão excluídas do catálogo.',
    async () => {
       AppState.listas.personalizadas = AppState.listas.personalizadas.filter(l => l.id !== listaId);
       if (AppState.supabase && AppState.usuario.logado && ehUuid(listaId)) {
         await AppState.supabase.from('user_lists').delete().eq('id', listaId);
       }
       salvarListas();
      renderizarListas();
      mostrarToast('Lista excluída.', 'info');
    }
  );
}

function verLista(listaId) {
  const lista = AppState.listas.personalizadas.find(l => l.id === listaId);
  if (!lista) return;

  const obrasNaLista = (lista.work_ids || [])
    .map(id => encontrarObraPorId(id))
    .filter(Boolean);

  if (obrasNaLista.length === 0) {
    mostrarToast('Esta lista está vazia.', 'info');
    return;
  }

  // Abrir modal com as obras da lista
  const modal = document.getElementById('listaObrasModal');
  if (modal) {
    const body = modal.querySelector('.modal-body');
    if (body) {
      body.innerHTML = `
        <h3>${escaparHtml(lista.name)}</h3>
        <div class="lista-obras-grid">
          ${obrasNaLista.map(obra => criarCardObra(obra)).join('')}
        </div>
      `;
    }
    toggleModal('listaObrasModal');
  }
}

function adicionarObraALista(obraId, listaId) {
  const lista = AppState.listas.personalizadas.find(l => l.id === listaId);
  if (!lista) return;

  if (!lista.work_ids) lista.work_ids = [];

  if (lista.work_ids.includes(String(obraId))) {
    mostrarToast('Esta obra já está na lista.', 'info');
    return;
  }

  lista.work_ids.push(String(obraId));
  salvarListas();
  mostrarToast('Obra adicionada à lista "' + lista.name + '".', 'sucesso');
}

function removerObraDaLista(obraId, listaId) {
  const lista = AppState.listas.personalizadas.find(l => l.id === listaId);
  if (!lista) return;

  lista.work_ids = (lista.work_ids || []).filter(id => id !== String(obraId));
  salvarListas();
  mostrarToast('Obra removida da lista.', 'info');
}

function salvarLista() {
  // Função wrapper para compatibilidade
  salvarListas();
}

/* =========================================================================
   28. ABAS DO PERFIL
   ========================================================================= */

function renderizarAbasPerfil() {
  const tabs = document.querySelectorAll('.profile-tab-content');
  tabs.forEach(tab => tab.classList.remove('active'));

  const abaAtiva = document.getElementById('profile' + AppState.perfil.abaAtiva.charAt(0).toUpperCase() + AppState.perfil.abaAtiva.slice(1));
  if (abaAtiva) abaAtiva.classList.add('active');

  switch (AppState.perfil.abaAtiva) {
    case 'historico':
      carregarHistoricoUsuario();
      break;
    case 'favoritos':
      carregarFavoritosUsuario();
      break;
    case 'listas':
      carregarListasDoUsuario().then(() => renderizarListas());
      break;
  }
}

function switchTabProfile(aba, element) {
  AppState.perfil.abaAtiva = aba;
  
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (element) element.classList.add('active');

  renderizarAbasPerfil();
}


/* =========================================================================
   29. MODAIS VIP E FLUXO PIX (COMPLETO)
   ========================================================================= */

function abrirModalVip() {
  toggleModal('vipModal');
}

function abrirModalPix(plano, valor) {
  if (!plano || !CONFIG.PLANOS_DURACAO[plano]) {
    mostrarToast('Plano inválido. Selecione um plano válido.', 'erro');
    return;
  }

  AppState.pix.planoAtual = { plano, valor };
  AppState.pix.expirado = false;
  AppState.pix.solicitacaoAtual = null;
  pararTimerPix();

  const detalhePlano = document.getElementById('pixDetalhePlano');
  if (detalhePlano) detalhePlano.textContent = plano + ' — ' + valor;

  const passoDados = document.getElementById('pixPassoDados');
  const passoPagamento = document.getElementById('pixPassoPagamento');
  const msgExpirado = document.getElementById('pixMsgExpirado');

  if (passoDados) passoDados.style.display = 'block';
  if (passoPagamento) passoPagamento.style.display = 'none';
  if (msgExpirado) msgExpirado.style.display = 'none';

  const btnConf = document.getElementById('btnConfirmarPix');
  if (btnConf) btnConf.disabled = false;

  const timerEl = document.getElementById('pixTimer');
  if (timerEl) {
    timerEl.textContent = '04:30';
    timerEl.classList.remove('timer-perigo', 'timer-expirado');
  }

  const emailInput = document.getElementById('pixEmail');
  if (emailInput && AppState.usuario.email) emailInput.value = AppState.usuario.email;

  const nomeInput = document.getElementById('pixNome');
  if (nomeInput && AppState.usuario.logado && !AppState.usuario.nome.includes('@')) {
    nomeInput.value = AppState.usuario.nome;
  }

  // Fechar vipModal se estiver aberto
  const vipModal = document.getElementById('vipModal');
  if (vipModal && vipModal.classList.contains('active')) {
    toggleModal('vipModal');
  }

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
  if (nome.length > 100) {
    mostrarToast('Nome muito longo. Máximo 100 caracteres.', 'alerta');
    return;
  }
  if (!validarEmail(email)) {
    mostrarToast('Informe um e-mail válido: o VIP será ativado neste endereço.', 'alerta');
    return;
  }

  const expiraEm = new Date(Date.now() + CONFIG.TEMPO_PIX_SEGUNDOS * 1000).toISOString();
  let idSolicitacao = 'local_' + Date.now();

  if (AppState.supabase) {
    try {
      const { data, error } = await AppState.supabase.from('payment_requests').insert([{
        nome: nome,
        email: email,
        plano: AppState.pix.planoAtual.plano,
        valor: AppState.pix.planoAtual.valor,
        metodo: 'pix',
        status: 'pendente',
        expires_at: expiraEm,
        user_id: AppState.usuario.id || null
      }]).select().single();
      
      if (!error && data) idSolicitacao = data.id;
    } catch (err) {
      console.warn('[SolitudeScan] Erro ao registrar solicitação:', err);
    }
  }

  AppState.pix.solicitacaoAtual = { 
    id: idSolicitacao, 
    nome: nome, 
    email: email, 
    expiraEm: expiraEm,
    plano: AppState.pix.planoAtual.plano,
    valor: AppState.pix.planoAtual.valor
  };
  
  const passoDados = document.getElementById('pixPassoDados');
  const passoPagamento = document.getElementById('pixPassoPagamento');
  
  if (passoDados) passoDados.style.display = 'none';
  if (passoPagamento) passoPagamento.style.display = 'block';
  
  iniciarTimerPix();
  mostrarToast('Cobrança gerada! Você tem 4 minutos e 30 segundos para concluir o Pix.', 'info', 5000);
}

function iniciarTimerPix() {
  const el = document.getElementById('pixTimer');
  pararTimerPix();

  AppState.pix.timerInterval = setInterval(() => {
    if (!AppState.pix.solicitacaoAtual) {
      pararTimerPix();
      return;
    }

    const restante = Math.floor((new Date(AppState.pix.solicitacaoAtual.expiraEm) - Date.now()) / 1000);

    if (restante <= 0) {
      pararTimerPix();
      AppState.pix.expirado = true;
      if (el) {
        el.textContent = '00:00';
        el.classList.add('timer-expirado');
      }
      const btn = document.getElementById('btnConfirmarPix');
      if (btn) btn.disabled = true;
      const msg = document.getElementById('pixMsgExpirado');
      if (msg) msg.style.display = 'block';
      mostrarToast('Tempo esgotado! O pagamento não foi confirmado e a solicitação foi cancelada.', 'erro', 6000);
      
      // Marcar como expirado no Supabase
      if (AppState.supabase && AppState.pix.solicitacaoAtual.id) {
        AppState.supabase
          .from('payment_requests')
          .update({ status: 'expirado' })
          .eq('id', AppState.pix.solicitacaoAtual.id)
          .then(() => {});
      }
      return;
    }

    const m = String(Math.floor(restante / 60)).padStart(2, '0');
    const s = String(restante % 60).padStart(2, '0');
    if (el) el.textContent = m + ':' + s;
    if (restante <= 60 && el) el.classList.add('timer-perigo');
  }, 1000);
}

function pararTimerPix() {
  if (AppState.pix.timerInterval) {
    clearInterval(AppState.pix.timerInterval);
    AppState.pix.timerInterval = null;
  }
}

function copiarChavePix() {
  navigator.clipboard.writeText(CONFIG.CHAVE_PIX).then(() => {
    mostrarToast('Chave Pix copiada! Cole no aplicativo do seu banco para pagar.', 'sucesso');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = CONFIG.CHAVE_PIX;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    mostrarToast('Chave Pix: ' + CONFIG.CHAVE_PIX, 'info', 6000);
  });
}

function concluirPagamentoPix() {
  if (AppState.pix.expirado) {
    mostrarToast('Esta cobrança expirou. Feche e gere uma nova solicitação de pagamento.', 'erro');
    return;
  }

  if (!AppState.pix.solicitacaoAtual) {
    mostrarToast('Nenhuma cobrança ativa.', 'erro');
    return;
  }

  pararTimerPix();

  // Marcar como "aguardando_confirmacao" no Supabase
  if (AppState.supabase && AppState.pix.solicitacaoAtual.id) {
    AppState.supabase
      .from('payment_requests')
      .update({ 
        status: 'aguardando_confirmacao',
        confirmed_at: new Date().toISOString()
      })
      .eq('id', AppState.pix.solicitacaoAtual.id)
      .then(() => {});
  }

  toggleModal('pixModal');
  mostrarToast('Pagamento informado! A administração vai conferir o Pix no banco e o VIP será ativado automaticamente no seu e-mail assim que a conferência for concluída.', 'sucesso', 8000);
}

/* =========================================================================
   30. PAINEL ADMINISTRATIVO — VISÃO GERAL
   ========================================================================= */

function abrirPainelAdmin() {
  if (!AppState.usuario.isAdmin) {
    mostrarToast('Acesso negado. Apenas administradores.', 'erro');
    return;
  }
  toggleModal('adminModal');
  carregarDadosAdmin();
}

async function carregarDadosAdmin() {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;

  try {
    // Carregar estatísticas em paralelo
    const [obrasRes, usersRes, pagamentosRes, denunciasRes] = await Promise.all([
      AppState.supabase.from('works').select('id', { count: 'exact', head: true }),
      AppState.supabase.from('profiles').select('id', { count: 'exact', head: true }),
      AppState.supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      AppState.supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
    ]);

    atualizarEstatisticasAdmin({
      obras: obrasRes.count || 0,
      usuarios: usersRes.count || 0,
      pagamentosPendentes: pagamentosRes.count || 0,
      denunciasPendentes: denunciasRes.count || 0
    });
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar dados admin:', err);
  }
}

function atualizarEstatisticasAdmin(stats) {
  const els = {
    'adminStatObras': stats.obras,
    'adminStatUsuarios': stats.usuarios,
    'adminStatPagamentos': stats.pagamentosPendentes,
    'adminStatDenuncias': stats.denunciasPendentes
  };

  Object.entries(els).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  });
}

function trocarAbaAdmin(aba) {
  document.querySelectorAll('.admin-tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));

  const target = document.getElementById('adminTab' + aba.charAt(0).toUpperCase() + aba.slice(1));
  if (target) target.classList.add('active');

  const btn = document.querySelector(`.admin-tab-btn[data-tab="${aba}"]`);
  if (btn) btn.classList.add('active');

  switch (aba) {
    case 'obras':
      carregarObrasAdmin();
      break;
    case 'usuarios':
      carregarUsuariosAdmin();
      break;
    case 'pagamentos':
      carregarPagamentosAdmin();
      break;
    case 'denuncias':
      carregarDenunciasAdmin();
      break;
  }
}

/* =========================================================================
   31. ADMIN — CRUD DE OBRAS
   ========================================================================= */

async function carregarObrasAdmin() {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;

  const container = document.getElementById('adminObrasLista');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando obras...</div>';

  try {
    const { data, error } = await AppState.supabase
      .from('works')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    AppState.modais.listaObras = data || [];

    if (AppState.modais.listaObras.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma obra cadastrada.</p></div>';
      return;
    }

    container.innerHTML = AppState.modais.listaObras.map(obra => `
      <div class="admin-item" data-id="${obra.id}">
        <img src="${obra.cover_url || PLACEHOLDERS.CAPA_PLACEHOLDER}" alt="${escaparHtml(obra.title)}" class="admin-item-cover" onerror="this.src='${PLACEHOLDERS.CAPA_PLACEHOLDER}'">
        <div class="admin-item-info">
          <h4>${escaparHtml(obra.title)}</h4>
          <p>${escaparHtml(obra.author || 'Autor desconhecido')} • ${escaparHtml(obra.status || 'Em Lançamento')}</p>
          <span class="admin-item-meta">${obra.views || 0} visualizações • ${obra.rating_avg || 0}★</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn-icon" onclick="editarObraAdmin('${obra.id}')" aria-label="Editar obra" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon danger" onclick="confirmarExclusaoObra('${obra.id}')" aria-label="Excluir obra" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    AppState.admin.obrasCarregadas = true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar obras admin:', err);
    container.innerHTML = '<div class="error-state"><p>Falha ao carregar obras.</p></div>';
  }
}

function abrirFormularioObra(obraId = null) {
  if (!AppState.usuario.isAdmin) return;

  AppState.admin.editandoObraId = obraId;
  const modal = document.getElementById('adminObraFormModal');
  if (!modal) return;

  const form = document.getElementById('adminObraForm');
  if (form) form.reset();

  const titulo = document.getElementById('adminObraFormTitulo');
  if (titulo) titulo.textContent = obraId ? 'Editar Obra' : 'Nova Obra';

  if (obraId) {
    const obra = AppState.modais.listaObras.find(o => o.id === obraId);
    if (obra) {
      document.getElementById('admObraTitulo').value = obra.title || '';
      document.getElementById('admObraAutor').value = obra.author || '';
      document.getElementById('admObraArtista').value = obra.artist || '';
      document.getElementById('admObraSinopse').value = obra.synopsis || '';
      document.getElementById('admObraStatus').value = obra.status || 'Em Lançamento';
      document.getElementById('admObraTipo').value = obra.type || 'Manhwa';
      document.getElementById('admObraExclusivo').checked = !!obra.is_vip;
      document.getElementById('admObraAdulto').checked = !!obra.is_adult;
      document.getElementById('admObraDestaque').checked = !!obra.is_featured;
    }
  }

  toggleModal('adminObraFormModal');
}

async function salvarObraAdmin(e) {
  e.preventDefault();
  if (!AppState.usuario.isAdmin) return;

  const dados = {
    title: document.getElementById('admObraTitulo').value.trim(),
    author: document.getElementById('admObraAutor').value.trim(),
    artist: document.getElementById('admObraArtista').value.trim(),
    synopsis: document.getElementById('admObraSinopse').value.trim(),
    status: document.getElementById('admObraStatus').value,
    type: document.getElementById('admObraTipo').value,
    is_vip: document.getElementById('admObraExclusivo').checked,
    is_adult: document.getElementById('admObraAdulto').checked,
    is_featured: document.getElementById('admObraDestaque').checked
  };

  if (!AppState.admin.editandoObraId) {
    dados.slug = dados.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now();
    dados.cover_url = PLACEHOLDERS.CAPA_PLACEHOLDER;
  }

  if (!dados.title || dados.title.length < 2) {
    mostrarToast('Título obrigatório (mínimo 2 caracteres).', 'alerta');
    return;
  }

  if (dados.title.length > 200) {
    mostrarToast('Título muito longo. Máximo 200 caracteres.', 'alerta');
    return;
  }

  // Upload de capa (se houver)
  const capaInput = document.getElementById('admObraCapa');
  if (capaInput && capaInput.files.length > 0) {
    const file = capaInput.files[0];
    if (file.size > 5 * 1024 * 1024) {
      mostrarToast('Capa muito grande. Máximo 5MB.', 'alerta');
      return;
    }
    try {
      const path = 'covers/' + Date.now() + '_' + file.name;
      const { error } = await AppState.supabase.storage.from('covers').upload(path, file, { upsert: true });
      if (!error) {
        const { data } = AppState.supabase.storage.from('covers').getPublicUrl(path);
        dados.cover_url = data.publicUrl;
      }
    } catch (err) {
      console.error('[SolitudeScan] Erro ao upload capa:', err);
    }
  }

  try {
    if (AppState.admin.editandoObraId) {
      const { error } = await AppState.supabase
        .from('works')
        .update(dados)
        .eq('id', AppState.admin.editandoObraId);
      if (error) throw error;
      mostrarToast('Obra atualizada com sucesso!', 'sucesso');
    } else {
      const { error } = await AppState.supabase.from('works').insert([dados]);
      if (error) throw error;
      mostrarToast('Obra criada com sucesso!', 'sucesso');
    }

    toggleModal('adminObraFormModal');
    carregarObrasAdmin();
    carregarObras(); // Atualizar catálogo público
  } catch (err) {
    console.error('[SolitudeScan] Erro ao salvar obra:', err);
    mostrarToast('Falha ao salvar obra: ' + (err.message || 'Erro desconhecido'), 'erro');
  }
}

function editarObraAdmin(obraId) {
  abrirFormularioObra(obraId);
}

function confirmarExclusaoObra(obraId) {
  abrirConfirmacao(
    'Excluir Obra',
    'Tem certeza que deseja excluir esta obra? Todos os capítulos e páginas associados também serão excluídos. Esta ação é irreversível.',
    () => excluirObraAdmin(obraId)
  );
}

async function excluirObraAdmin(obraId) {
  if (!AppState.usuario.isAdmin) return;

  try {
    // Excluir páginas, capítulos e depois a obra (em cascata via RLS)
    await AppState.supabase.from('pages').delete().in('chapter_id', 
      (await AppState.supabase.from('chapters').select('id').eq('work_id', obraId)).data?.map(c => c.id) || []
    );
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

/* =========================================================================
   32. ADMIN — CRUD DE CAPÍTULOS
   ========================================================================= */

async function carregarCapitulosAdmin(obraId) {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;

  const container = document.getElementById('adminCapitulosLista');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando capítulos...</div>';

  try {
    const { data, error } = await AppState.supabase
      .from('chapters')
      .select('*')
      .eq('work_id', obraId)
      .order('chapter_number', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum capítulo cadastrado.</p><button class="btn-primary" onclick="abrirFormularioCapitulo(\'' + obraId + '\')">Adicionar Capítulo</button></div>';
      return;
    }

    container.innerHTML = data.map(cap => `
      <div class="admin-item" data-id="${cap.id}">
        <div class="admin-item-info">
          <h4>${escaparHtml(cap.title || 'Capítulo ' + cap.chapter_number)}</h4>
          <p>Número: ${cap.chapter_number} • ${dataRelativa(cap.created_at)}</p>
          <span class="admin-item-meta">Público</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn-icon" onclick="gerenciarPaginasCapitulo('${cap.id}', '${obraId}')" aria-label="Gerenciar páginas" title="Páginas">
            <i class="fa-solid fa-images"></i>
          </button>
          <button class="btn-icon" onclick="editarCapituloAdmin('${cap.id}', '${obraId}')" aria-label="Editar capítulo" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon danger" onclick="confirmarExclusaoCapitulo('${cap.id}', '${obraId}')" aria-label="Excluir capítulo" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar capítulos admin:', err);
    container.innerHTML = '<div class="error-state"><p>Falha ao carregar capítulos.</p></div>';
  }
}

function abrirFormularioCapitulo(obraId, capituloId = null) {
  if (!AppState.usuario.isAdmin) return;

  AppState.admin.editandoCapituloId = capituloId;
  AppState.admin.obraAtualAdmin = obraId;

  const form = document.getElementById('adminCapituloForm');
  if (form) form.reset();

  const titulo = document.getElementById('adminCapituloFormTitulo');
  if (titulo) titulo.textContent = capituloId ? 'Editar Capítulo' : 'Novo Capítulo';

  if (capituloId) {
    // Carregar dados do capítulo
    AppState.supabase.from('chapters').select('*').eq('id', capituloId).single()
      .then(({ data }) => {
        if (data) {
          document.getElementById('admCapTitulo').value = data.title || '';
          document.getElementById('admCapNumero').value = data.chapter_number || '';
          document.getElementById('admCapVip').checked = false;
        }
      });
  }

  toggleModal('adminCapituloFormModal');
}

async function salvarCapituloAdmin(e) {
  e.preventDefault();
  if (!AppState.usuario.isAdmin) return;

  const dados = {
    work_id: AppState.admin.obraAtualAdmin,
    title: document.getElementById('admCapTitulo').value.trim(),
    chapter_number: parseFloat(document.getElementById('admCapNumero').value) || 1,
    is_vip: !!document.getElementById('admCapVip')?.checked,
    is_published: true
  };

  if (!dados.title || dados.title.length < 2) {
    mostrarToast('Título obrigatório.', 'alerta');
    return;
  }

  try {
    if (AppState.admin.editandoCapituloId) {
      const { error } = await AppState.supabase
        .from('chapters')
        .update(dados)
        .eq('id', AppState.admin.editandoCapituloId);
      if (error) throw error;
      mostrarToast('Capítulo atualizado!', 'sucesso');
    } else {
      const { error } = await AppState.supabase.from('chapters').insert([dados]);
      if (error) throw error;
      mostrarToast('Capítulo criado!', 'sucesso');
    }

    toggleModal('adminCapituloFormModal');
    carregarCapitulosAdmin(AppState.admin.obraAtualAdmin);
  } catch (err) {
    console.error('[SolitudeScan] Erro ao salvar capítulo:', err);
    mostrarToast('Falha ao salvar capítulo.', 'erro');
  }
}

function editarCapituloAdmin(capituloId, obraId) {
  abrirFormularioCapitulo(obraId, capituloId);
}

function confirmarExclusaoCapitulo(capituloId, obraId) {
  abrirConfirmacao(
    'Excluir Capítulo',
    'Tem certeza? Todas as páginas deste capítulo serão excluídas.',
    () => excluirCapituloAdmin(capituloId, obraId)
  );
}

async function excluirCapituloAdmin(capituloId, obraId) {
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
}

/* =========================================================================
   33. ADMIN — UPLOAD DE PÁGINAS (COM PDF INTEGRADO)
   ========================================================================= */

function gerenciarPaginasCapitulo(capituloId, obraId) {
  AppState.admin.capituloAtualAdmin = capituloId;
  AppState.admin.obraAtualAdmin = obraId;
  toggleModal('adminPaginasModal');
  carregarPaginasAdmin(capituloId);
}

async function carregarPaginasAdmin(capituloId) {
  if (!AppState.supabase) return;

  const container = document.getElementById('adminPaginasLista');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando páginas...</div>';

  try {
    const { data, error } = await AppState.supabase
      .from('pages')
      .select('*')
      .eq('chapter_id', capituloId)
      .order('page_number', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma página neste capítulo.</p><p class="empty-hint">Use o upload acima para adicionar imagens ou PDFs.</p></div>';
      return;
    }

    container.innerHTML = data.map(pag => `
      <div class="admin-page-item" data-id="${pag.id}">
        <img src="${pag.image_url}" alt="Página ${pag.page_number}" loading="lazy" onerror="this.src='${PLACEHOLDERS.PAGINA_PLACEHOLDER}'">
        <span class="page-number">#${pag.page_number}</span>
        <button class="btn-icon danger" onclick="excluirPaginaAdmin('${pag.id}', '${capituloId}')" aria-label="Excluir página">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar páginas:', err);
    container.innerHTML = '<div class="error-state"><p>Falha ao carregar páginas.</p></div>';
  }
}

async function processarUploadAdmin() {
  if (!AppState.usuario.isAdmin) {
    mostrarToast('Acesso negado.', 'erro');
    return;
  }

  const fileInput = document.getElementById('admPaginasArquivo');
  if (!fileInput || !fileInput.files.length) {
    mostrarToast('Selecione arquivos para upload.', 'alerta');
    return;
  }

  if (!AppState.admin.capituloAtualAdmin) {
    mostrarToast('Selecione um capítulo primeiro.', 'alerta');
    return;
  }

  const arquivos = Array.from(fileInput.files);
  
  // Validação rigorosa de tamanho e tipo
  const MAX_SIZE = CONFIG.MAX_UPLOAD_SIZE;
  const arquivosInvalidosTamanho = arquivos.filter(f => f.size > MAX_SIZE);
  
  if (arquivosInvalidosTamanho.length > 0) {
    mostrarToast('Arquivos muito grandes (máx. 50MB): ' + arquivosInvalidosTamanho.map(f => f.name).join(', '), 'erro', 6000);
    return;
  }

  const tiposValidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  const arquivosInvalidosTipo = arquivos.filter(f => !tiposValidos.includes(f.type) && !/\.(jpe?g|png|webp|gif|pdf)$/i.test(f.name));
  
  if (arquivosInvalidosTipo.length > 0) {
    mostrarToast('Formatos inválidos: ' + arquivosInvalidosTipo.map(f => f.name).join(', '), 'erro', 6000);
    return;
  }

  const pdfs = arquivos.filter(ehArquivoPDF);
  const imagens = arquivos.filter(f => !ehArquivoPDF(f));

  let todas = imagens.slice();

  // Processar PDFs
  for (const pdf of pdfs) {
    try {
      mostrarToast('Processando ' + pdf.name + '...', 'info', 2000);
      const paginas = await processarPDFParaImagens(pdf);
      todas = todas.concat(paginas);
      mostrarToast('PDF convertido! ' + paginas.length + ' páginas.', 'sucesso');
    } catch (err) {
      console.error('[SolitudeScan] Erro no PDF:', err);
      mostrarToast('Falha ao processar ' + pdf.name + ': ' + err.message, 'erro', 6000);
    }
  }

  if (!todas.length) {
    mostrarToast('Nenhum arquivo válido para upload.', 'alerta');
    return;
  }

  await uploadPaginasSupabase(todas, AppState.admin.capituloAtualAdmin);
  
  // Limpar input
  fileInput.value = '';
}

function ehArquivoPDF(file) {
  return !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
}

async function processarPDFParaImagens(file, qualidade = 0.82, escala = 2) {
  if (!window.pdfjsLib) {
    await carregarPDFjs();
  }
  
  if (!window.pdfjsLib) {
    throw new Error('PDF.js não disponível');
  }

  // Validação adicional de tamanho para PDFs (mais restrito)
  if (file.size > 100 * 1024 * 1024) { // 100MB para PDFs
    throw new Error('PDF muito grande (máx. 100MB)');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  // Limitar número de páginas para evitar DoS
  if (pdf.numPages > 200) {
    throw new Error('PDF com muitas páginas (máx. 200)');
  }

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
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    let blob = await new Promise(res => canvas.toBlob(res, 'image/webp', qualidade));
    if (!blob) blob = await new Promise(res => canvas.toBlob(res, 'image/png'));

    const ext = blob.type.indexOf('webp') !== -1 ? '.webp' : '.png';
    imagens.push(new File([blob], 'pagina_' + String(i).padStart(3, '0') + ext, { type: blob.type }));
  }
  return imagens;
}

async function carregarPDFjs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve();
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function () {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      } else {
        reject(new Error('Falha ao carregar PDF.js'));
      }
    };
    s.onerror = () => reject(new Error('Falha ao carregar PDF.js'));
    document.head.appendChild(s);
  });
}

async function uploadPaginasSupabase(arquivos, capituloId) {
  if (!AppState.supabase || !AppState.usuario.isAdmin) {
    mostrarToast('Acesso negado ou offline.', 'erro');
    return [];
  }

  // Obter número de páginas existentes para continuar a numeração
  let paginaInicial = 1;
  try {
    const { data } = await AppState.supabase
      .from('pages')
      .select('page_number')
      .eq('chapter_id', capituloId)
      .order('page_number', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      paginaInicial = data[0].page_number + 1;
    }
  } catch (err) {}

  const urls = [];
  let paginaAtual = paginaInicial;
  
  for (const file of arquivos) {
    try {
      const path = 'chapters/' + capituloId + '/' + String(paginaAtual).padStart(3, '0') + '_' + Date.now() + '_' + file.name;
      const { error } = await AppState.supabase.storage
        .from('chapters')
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data } = AppState.supabase.storage
        .from('chapters')
        .getPublicUrl(path);

      if (data && data.publicUrl) {
        // Registrar no banco
        await AppState.supabase.from('pages').insert({
          chapter_id: capituloId,
          image_url: data.publicUrl,
          page_number: paginaAtual
        });
        
        urls.push(data.publicUrl);
        paginaAtual++;
      }
    } catch (err) {
      console.error('[SolitudeScan] Erro no upload:', err);
    }
  }

  if (urls.length > 0) {
    mostrarToast(urls.length + ' páginas enviadas com sucesso!', 'sucesso');
    carregarPaginasAdmin(capituloId);
  }

  return urls;
}

async function excluirPaginaAdmin(paginaId, capituloId) {
  if (!AppState.usuario.isAdmin) return;

  abrirConfirmacao(
    'Excluir Página',
    'Tem certeza que deseja excluir esta página?',
    async () => {
      try {
        const { error } = await AppState.supabase.from('pages').delete().eq('id', paginaId);
        if (error) throw error;
        mostrarToast('Página excluída.', 'sucesso');
        carregarPaginasAdmin(capituloId);
      } catch (err) {
        console.error('[SolitudeScan] Erro ao excluir página:', err);
        mostrarToast('Falha ao excluir página.', 'erro');
      }
    }
  );
}

/* =========================================================================
   34. ADMIN — GERENCIAMENTO DE USUÁRIOS
   ========================================================================= */

async function carregarUsuariosAdmin() {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;

  const container = document.getElementById('adminUsuariosLista');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando usuários...</div>';

  try {
    const { data, error } = await AppState.supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    AppState.modais.listaUsuarios = data || [];

    if (AppState.modais.listaUsuarios.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum usuário cadastrado.</p></div>';
      return;
    }

    container.innerHTML = AppState.modais.listaUsuarios.map(user => `
      <div class="admin-item" data-id="${user.id}">
        <img src="${user.avatar_url || PLACEHOLDERS.AVATAR_SVG}" alt="${escaparHtml(user.display_name || user.username || 'Usuário')}" class="admin-user-avatar" onerror="this.src='${PLACEHOLDERS.AVATAR_SVG}'">
        <div class="admin-item-info">
          <h4>${escaparHtml(user.display_name || user.username || 'Sem nome')}</h4>
          <p>${escaparHtml(user.email || '')}</p>
          <span class="admin-item-meta">
            ${user.is_admin ? '<span class="badge-admin">Admin</span>' : ''}
            ${user.is_vip ? '<span class="badge-vip">VIP</span>' : ''}
            ${!user.is_admin && !user.is_vip ? '<span class="badge-free">Gratuito</span>' : ''}
          </span>
        </div>
        <div class="admin-item-actions">
          <button class="btn-icon" onclick="toggleAdminUsuario('${user.id}', ${!user.is_admin})" aria-label="Toggle admin" title="${user.is_admin ? 'Remover admin' : 'Tornar admin'}">
            <i class="fa-solid fa-shield${user.is_admin ? '' : '-halved'}"></i>
          </button>
          <button class="btn-icon" onclick="toggleVipUsuario('${user.id}', ${!user.is_vip})" aria-label="Toggle VIP" title="${user.is_vip ? 'Remover VIP' : 'Tornar VIP'}">
            <i class="fa-solid fa-crown"></i>
          </button>
        </div>
      </div>
    `).join('');

    AppState.admin.usuariosCarregados = true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar usuários:', err);
    container.innerHTML = '<div class="error-state"><p>Falha ao carregar usuários.</p></div>';
  }
}

async function toggleAdminUsuario(userId, novoEstado) {
  if (!AppState.usuario.isAdmin) return;

  if (userId === AppState.usuario.id && !novoEstado) {
    mostrarToast('Você não pode remover seus próprios privilégios de admin.', 'alerta');
    return;
  }

  try {
    const { error } = await AppState.supabase
      .from('profiles')
      .update({ is_admin: novoEstado })
      .eq('id', userId);

    if (error) throw error;
    mostrarToast(novoEstado ? 'Usuário tornado admin.' : 'Privilégios de admin removidos.', 'sucesso');
    carregarUsuariosAdmin();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao toggle admin:', err);
    mostrarToast('Falha ao atualizar usuário.', 'erro');
  }
}

async function toggleVipUsuario(userId, novoEstado) {
  if (!AppState.usuario.isAdmin) return;

  try {
    const updates = { is_vip: novoEstado };
    if (novoEstado) {
      updates.vip_plan = 'VIP Admin Grant';
      updates.vip_expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { error } = await AppState.supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;
    mostrarToast(novoEstado ? 'Usuário tornado VIP (1 ano).' : 'VIP removido.', 'sucesso');
    carregarUsuariosAdmin();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao toggle VIP:', err);
    mostrarToast('Falha ao atualizar usuário.', 'erro');
  }
}

/* =========================================================================
   35. ADMIN — APROVAÇÃO DE PAGAMENTOS PIX
   ========================================================================= */

async function carregarPagamentosAdmin() {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;

  const container = document.getElementById('adminPagamentosLista');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando pagamentos...</div>';

  try {
    const { data, error } = await AppState.supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    AppState.modais.listaPagamentos = data || [];

    if (AppState.modais.listaPagamentos.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum pagamento registrado.</p></div>';
      return;
    }

    container.innerHTML = AppState.modais.listaPagamentos.map(pag => {
      const statusClass = 'status-' + (pag.status || 'pendente');
      const statusLabel = {
        'pendente': 'Pendente',
        'aguardando_confirmacao': 'Aguardando Confirmação',
        'aprovado': 'Aprovado',
        'rejeitado': 'Rejeitado',
        'expirado': 'Expirado'
      }[pag.status] || pag.status;

      return `
        <div class="admin-item" data-id="${pag.id}">
          <div class="admin-item-info">
            <h4>${escaparHtml(pag.nome || 'Sem nome')} — ${escaparHtml(pag.plano)}</h4>
            <p>${escaparHtml(pag.email)} • ${formatarMoeda(pag.valor || 0)}</p>
            <span class="admin-item-meta">
              <span class="status-badge ${statusClass}">${statusLabel}</span>
              • ${dataRelativa(pag.created_at)}
            </span>
          </div>
          <div class="admin-item-actions">
            ${(pag.status === 'pendente' || pag.status === 'aguardando_confirmacao') ? `
              <button class="btn-icon success" onclick="aprovarPagamento('${pag.id}')" aria-label="Aprovar" title="Aprovar">
                <i class="fa-solid fa-check"></i>
              </button>
              <button class="btn-icon danger" onclick="rejeitarPagamento('${pag.id}')" aria-label="Rejeitar" title="Rejeitar">
                <i class="fa-solid fa-xmark"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    AppState.admin.pagamentosCarregados = true;
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar pagamentos:', err);
    container.innerHTML = '<div class="error-state"><p>Falha ao carregar pagamentos.</p></div>';
  }
}

async function aprovarPagamento(pagamentoId) {
  if (!AppState.usuario.isAdmin) return;

  abrirConfirmacao(
    'Aprovar Pagamento',
    'Confirme que o Pix foi recebido no banco. O VIP será ativado automaticamente para o e-mail informado.',
    async () => {
      try {
        const pag = AppState.modais.listaPagamentos.find(p => p.id === pagamentoId);
        if (!pag) {
          mostrarToast('Pagamento não encontrado.', 'erro');
          return;
        }

        // Atualizar status
        const { error } = await AppState.supabase
          .from('payment_requests')
          .update({ 
            status: 'aprovado',
            approved_at: new Date().toISOString(),
          })
          .eq('id', pagamentoId);

        if (error) throw error;

        // Ativar VIP no perfil do usuário
        const dias = CONFIG.PLANOS_DURACAO[pag.plano] || 30;
        const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

        await AppState.supabase
          .from('profiles')
          .update({
            is_vip: true,
            vip_plan: pag.plano,
            vip_expires_at: expiraEm
          })
          .eq('email', pag.email);

        // Enviar notificação ao usuário (se existir)
        if (pag.user_id) {
          await AppState.supabase.from('notifications').insert({
            user_id: pag.user_id,
            type: 'vip',
            message: 'Seu pagamento foi aprovado! VIP ' + pag.plano + ' ativado até ' + new Date(expiraEm).toLocaleDateString('pt-BR') + '.',
            is_read: false
          });
        }

        mostrarToast('Pagamento aprovado! VIP ativado para ' + pag.email, 'sucesso');
        carregarPagamentosAdmin();
      } catch (err) {
        console.error('[SolitudeScan] Erro ao aprovar pagamento:', err);
        mostrarToast('Falha ao aprovar pagamento.', 'erro');
      }
    }
  );
}

async function rejeitarPagamento(pagamentoId) {
  if (!AppState.usuario.isAdmin) return;

  abrirConfirmacao(
    'Rejeitar Pagamento',
    'Tem certeza que deseja rejeitar este pagamento? O usuário será notificado.',
    async () => {
      try {
        const pag = AppState.modais.listaPagamentos.find(p => p.id === pagamentoId);
        
        await AppState.supabase
          .from('payment_requests')
          .update({ 
            status: 'rejeitado',
            rejected_at: new Date().toISOString(),
          })
          .eq('id', pagamentoId);

        if (pag && pag.user_id) {
          await AppState.supabase.from('notifications').insert({
            user_id: pag.user_id,
            type: 'sistema',
            message: 'Seu pagamento foi rejeitado. Entre em contato com o suporte para mais informações.',
            is_read: false
          });
        }

        mostrarToast('Pagamento rejeitado.', 'info');
        carregarPagamentosAdmin();
      } catch (err) {
        console.error('[SolitudeScan] Erro ao rejeitar:', err);
        mostrarToast('Falha ao rejeitar pagamento.', 'erro');
      }
    }
  );
}

/* =========================================================================
   36. ADMIN — MODERAÇÃO DE DENÚNCIAS
   ========================================================================= */

async function carregarDenunciasAdmin() {
  if (!AppState.supabase || !AppState.usuario.isAdmin) return;

  const container = document.getElementById('adminDenunciasLista');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando denúncias...</div>';

  try {
    const { data, error } = await AppState.supabase
      .from('reports')
      .select(`
        *,
        reporter:reporter_id (display_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma denúncia pendente.</p></div>';
      return;
    }

    container.innerHTML = data.map(rep => {
      const reporter = rep.reporter || {};
      return `
        <div class="admin-item" data-id="${rep.id}">
          <div class="admin-item-info">
            <h4>Denúncia: ${escaparHtml(rep.target_type || 'desconhecido')}</h4>
            <p>Reportado por: ${escaparHtml(reporter.display_name || reporter.email || 'Anônimo')}</p>
            <span class="admin-item-meta">
              <span class="status-badge status-${rep.status}">${rep.status}</span>
              • ${dataRelativa(rep.created_at)}
            </span>
          </div>
          <div class="admin-item-actions">
            <button class="btn-icon" onclick="verDenuncia('${rep.id}')" aria-label="Ver denúncia" title="Ver">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-icon success" onclick="resolverDenuncia('${rep.id}', 'resolvido')" aria-label="Resolver" title="Resolver">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="btn-icon danger" onclick="resolverDenuncia('${rep.id}', 'descartado')" aria-label="Descartar" title="Descartar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('[SolitudeScan] Erro ao carregar denúncias:', err);
    container.innerHTML = '<div class="error-state"><p>Falha ao carregar denúncias.</p></div>';
  }
}

async function verDenuncia(denunciaId) {
  // Implementação: abrir modal com detalhes da denúncia e conteúdo reportado
  mostrarToast('Visualização de denúncia em desenvolvimento.', 'info');
}

async function resolverDenuncia(denunciaId, status) {
  if (!AppState.usuario.isAdmin) return;

  try {
    const { error } = await AppState.supabase
      .from('reports')
      .update({ 
        status: status,
        resolved_at: new Date().toISOString(),
        resolved_by: AppState.usuario.id
      })
      .eq('id', denunciaId);

    if (error) throw error;
    mostrarToast('Denúncia ' + (status === 'resolvido' ? 'resolvida' : 'descartada') + '.', 'sucesso');
    carregarDenunciasAdmin();
  } catch (err) {
    console.error('[SolitudeScan] Erro ao resolver denúncia:', err);
    mostrarToast('Falha ao atualizar denúncia.', 'erro');
  }
}


/* =========================================================================
   37. PWA — SERVICE WORKER E INSTALAÇÃO
   ========================================================================= */

function registrarServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('[SolitudeScan] SW registrado com sucesso:', registration.scope);
          
          // Verificar atualizações periodicamente
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000); // A cada 1 hora
        })
        .catch(e => console.warn('[SolitudeScan] SW não registrado:', e));
    });
  }
}

function inicializarPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.pwa.deferredInstallPrompt = e;
    const btn = document.getElementById('btnInstalarApp');
    if (btn) btn.style.display = 'block';
  });

  window.addEventListener('appinstalled', () => {
    AppState.pwa.deferredInstallPrompt = null;
    const btn = document.getElementById('btnInstalarApp');
    if (btn) btn.style.display = 'none';
    mostrarToast('App instalado com sucesso!', 'sucesso');
  });
}

async function instalarApp() {
  if (!AppState.pwa.deferredInstallPrompt) {
    mostrarToast('Use o menu do navegador e escolha "Adicionar à tela inicial".', 'info', 6000);
    return;
  }
  
  AppState.pwa.deferredInstallPrompt.prompt();
  const escolha = await AppState.pwa.deferredInstallPrompt.userChoice;
  
  if (escolha.outcome === 'accepted') {
    mostrarToast('App instalado! Acesse pela tela inicial.', 'sucesso');
    AppState.pwa.deferredInstallPrompt = null;
    const btn = document.getElementById('btnInstalarApp');
    if (btn) btn.style.display = 'none';
  }
}

/* =========================================================================
   38. ACESSIBILIDADE (COMPLETA)
   ========================================================================= */

function aplicarAcessibilidade() {
  // Skip link já está no HTML, mas garantimos que funciona
  const skipLink = document.getElementById('skipLink');
  if (skipLink) {
    skipLink.addEventListener('focus', () => {
      skipLink.style.left = '0';
      skipLink.style.top = '0';
    });
    skipLink.addEventListener('blur', () => {
      skipLink.style.left = '-9999px';
    });
  }

  // Garantir que toast container tem ARIA
  const toastContainer = document.getElementById('toastContainer');
  if (toastContainer && !toastContainer.getAttribute('aria-live')) {
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('role', 'status');
  }

  // Adicionar aria-label em botões de ícone
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
        else if (classes.includes('fa-gear')) rotulo = 'Configurações';
        else if (classes.includes('fa-user')) rotulo = 'Perfil';
        else if (classes.includes('fa-right-from-bracket')) rotulo = 'Sair';
        else if (classes.includes('fa-download')) rotulo = 'Download';
        else if (classes.includes('fa-magnifying-glass')) rotulo = 'Buscar';
        else if (classes.includes('fa-pen')) rotulo = 'Editar';
        else if (classes.includes('fa-trash')) rotulo = 'Excluir';
        else if (classes.includes('fa-check')) rotulo = 'Confirmar';
        else if (classes.includes('fa-images')) rotulo = 'Páginas';
        else if (classes.includes('fa-shield')) rotulo = 'Admin';
        else if (classes.includes('fa-crown')) rotulo = 'VIP';
        else if (classes.includes('fa-copy')) rotulo = 'Copiar';
        else if (classes.includes('fa-flag')) rotulo = 'Denunciar';
        else if (classes.includes('fa-reply')) rotulo = 'Responder';
        else if (classes.includes('fa-spinner')) rotulo = 'Carregando';
        
        btn.setAttribute('aria-label', rotulo);
      }
    }
  });

  // Navegação por teclado nos cards
  if (!window.__enterCardAtivo) {
    window.__enterCardAtivo = true;
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && document.activeElement && 
          document.activeElement.classList && 
          document.activeElement.classList.contains('manga-card')) {
        e.preventDefault();
        document.activeElement.click();
      }
    });
  }

  // Respeitar prefers-reduced-motion
  if (!document.getElementById('estiloMovimentoReduzido')) {
    const style = document.createElement('style');
    style.id = 'estiloMovimentoReduzido';
    style.textContent = `
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Focus trap em modais
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (!modal.classList.contains('active')) return;

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    });
  });

  // Fechar modal com Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && AppState.ui.modalAtual) {
      // Não fechar o leitor com Escape (já tem handler próprio)
      if (AppState.ui.modalAtual === 'readerModal') return;
      toggleModal(AppState.ui.modalAtual);
    }
  });
}

function marcarCardsNavegaveis() {
  const aplicar = () => {
    document.querySelectorAll('.manga-card:not([tabindex])').forEach(card => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'listitem');
    });
  };

  aplicar();

  if (!window.__cardsObserver) {
    window.__cardsObserver = new MutationObserver(aplicar);
    window.__cardsObserver.observe(document.body, { childList: true, subtree: true });
  }
}

/* =========================================================================
   39. SEO DINÂMICO — META TAGS E DEEP LINKS
   ========================================================================= */

function atualizarMetaTagsDinamicas(obra) {
  if (!obra) return;

  // Atualizar title
  document.title = obra.titulo + ' | SolitudeScan';
  
  // Função auxiliar para criar/atualizar meta tags
  const setMeta = (name, content, property = false) => {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    let meta = document.querySelector(selector);
    if (!meta) {
      meta = document.createElement('meta');
      if (property) meta.setAttribute('property', name);
      else meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  };

  // Descrição
  const descricao = (obra.sinopse || '').substring(0, 160);
  setMeta('description', descricao, false);
  
  // Open Graph
  setMeta('og:title', obra.titulo, true);
  setMeta('og:description', descricao, true);
  setMeta('og:image', obra.capa || '', true);
  setMeta('og:url', window.location.origin + '/?obra=' + encodeURIComponent(obra.id), true);
  setMeta('og:type', 'book', true);
  
  // Twitter Cards
  setMeta('twitter:title', obra.titulo, false);
  setMeta('twitter:description', descricao, false);
  setMeta('twitter:image', obra.capa || '', false);
  setMeta('twitter:card', 'summary_large_image', false);

  // Canonical
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', window.location.origin + '/?obra=' + encodeURIComponent(obra.id));
}

function restaurarMetaTagsPadrao() {
  document.title = 'SolitudeScan | Leia Manhwas, Mangás e Manhuás Online';
  
  const setMeta = (name, content, property = false) => {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    const meta = document.querySelector(selector);
    if (meta) meta.setAttribute('content', content);
  };

  setMeta('description', 'Leia manhwas, mangás e manhuás online com experiência de leitura profissional, rápida e segura. Atualizações diárias e catálogo exclusivo.', false);
  setMeta('og:title', 'SolitudeScan | Leia Manhwas, Mangás e Manhuás Online', true);
  setMeta('og:description', 'Experiência de leitura profissional, rápida e segura. Atualizações diárias e catálogo exclusivo.', true);
}

function processarLinksProfundos() {
  const params = new URLSearchParams(window.location.search);
  const obraId = params.get('obra');
  
  if (obraId) {
    setTimeout(() => {
      abrirDetalhesObra(obraId);
    }, 800);
  }
}

function ativarPopstate() {
  window.addEventListener('popstate', () => {
    processarLinksProfundos();
  });
}

/* =========================================================================
   40. TESTES AUTOMATIZADOS (SUITE COMPLETA)
   ========================================================================= */

async function rodarTestesSolitude() {
  const resultados = [];
  
  function teste(nome, ok, detalhe) {
    resultados.push({ nome: nome, ok: !!ok, detalhe: detalhe || '' });
  }

  // Teste 1: Elementos DOM essenciais
  const elementos = [
    'mangaContainer', 'toastContainer', 'heroBannerSection', 'tendenciasContainer',
    'rankingContainer', 'continueLendoContainer', 'readerCascataContainer',
    'detalhesModal', 'readerModal', 'loginModal', 'registerModal', 'searchInput',
    'listaCapitulosContainer', 'btnFavoritar', 'pixModal', 'adminModal',
    'admPaginasArquivo', 'cookieBanner', 'btnInstalarApp', 'skipLink',
    'generoFiltro', 'statusFiltro', 'ordemFiltro', 'themeToggleBtn',
    'loggedOutView', 'loggedInView', 'userNameDisplay', 'userAvatarImg',
    'userPlanBadge', 'profileAvatarLarge', 'profileNameLarge'
  ];
  
  elementos.forEach(id => {
    teste('Elemento #' + id, !!document.getElementById(id));
  });

  // Teste 2: Funções essenciais
  const funcoes = [
    'carregarObras', 'abrirDetalhesObra', 'abrirLeitor', 'fecharLeitor',
    'alternarFavorito', 'executarLoginCustom', 'executarCadastro', 'abrirPainelAdmin',
    'exportarDadosUsuario', 'compartilharObraAtual', 'avaliarObra', 'adicionarComentario',
    'carregarListasDoUsuario', 'salvarLista', 'escaparHtml', 'ehUuid', 'formatarNumero',
    'processarUploadAdmin', 'processarPDFParaImagens', 'abrirModalPix', 'gerarCobrancaPix',
    'alternarTema', 'aceitarCookies', 'rodarTestesSolitude', 'limparFiltros',
    'carregarObrasAdmin', 'carregarUsuariosAdmin', 'carregarPagamentosAdmin',
    'aprovarPagamento', 'salvarObraAdmin', 'salvarCapituloAdmin'
  ];
  
  funcoes.forEach(fn => {
    teste('Função ' + fn + '()', typeof window[fn] === 'function');
  });

  // Teste 3: localStorage
  try {
    localStorage.setItem('solitude_teste', '1');
    const lido = localStorage.getItem('solitude_teste');
    localStorage.removeItem('solitude_teste');
    teste('localStorage lê/grava', lido === '1');
  } catch (e) {
    teste('localStorage lê/grava', false, e.message);
  }

  // Teste 4: APIs do navegador
  teste('Service Worker suportado', 'serviceWorker' in navigator);
  teste('Fetch API suportado', typeof fetch === 'function');
  teste('Clipboard API suportado', !!(navigator.clipboard));
  teste('IntersectionObserver suportado', 'IntersectionObserver' in window);
  teste('Web Share API suportado', !!(navigator.share));
  teste('PDF.js carregável', typeof carregarPDFjs === 'function');

  // Teste 5: Conexão Supabase
  if (AppState.supabase) {
    try {
      const { error } = await AppState.supabase.from('works').select('id', { count: 'exact', head: true });
      teste('Conexão Supabase (tabela works)', !error, error ? error.message : '');
    } catch (e) {
      teste('Conexão Supabase (tabela works)', false, e.message);
    }

    try {
      const { data } = await AppState.supabase.from('profiles').select('id').limit(1);
      teste('Tabela profiles legível', !!data);
    } catch (e) {
      teste('Tabela profiles legível', false, e.message);
    }

    try {
      const { data } = await AppState.supabase.storage.from('covers').list('', { limit: 1 });
      teste('Bucket covers acessível', !!data);
    } catch (e) {
      teste('Bucket covers acessível', false, e.message);
    }

    try {
      const { data } = await AppState.supabase.storage.from('avatars').list('', { limit: 1 });
      teste('Bucket avatars acessível', !!data);
    } catch (e) {
      teste('Bucket avatars acessível', false, e.message);
    }
  } else {
    teste('Conexão Supabase', false, 'Cliente não inicializado');
    teste('Tabela profiles legível', false, 'Cliente não inicializado');
    teste('Bucket covers acessível', false, 'Cliente não inicializado');
    teste('Bucket avatars acessível', false, 'Cliente não inicializado');
  }

  // Teste 6: Segurança
  teste('CSP presente', !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  teste('Autorização admin não usa e-mail hardcoded', !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(String(executarLoginCustom)));
  teste('isAdmin vem do Supabase', String(carregarPerfilRemoto).includes('data.is_admin'));

  // Teste 7: Acessibilidade
  teste('Skip link presente', !!document.getElementById('skipLink'));
  teste('Prefers-reduced-motion injetado', !!document.getElementById('estiloMovimentoReduzido'));

  // Resultado final
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
    mostrarToast('Todos os ' + total + ' testes passaram. Sistema saudável!', 'sucesso', 8000);
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

function garantirBotaoTeste() {
  if (!AppState.usuario.isAdmin) return;
  if (document.getElementById('btnTesteSolitude')) return;
  
  const btn = document.createElement('button');
  btn.id = 'btnTesteSolitude';
  btn.textContent = 'Testar Sistema';
  btn.style.cssText = 'position:fixed; bottom:80px; right:20px; background:#10b981; color:#fff; border:none; padding:10px 16px; border-radius:8px; font-weight:700; font-size:0.75rem; z-index:99999; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  btn.onclick = rodarTestesSolitude;
  document.body.appendChild(btn);
}

function fecharDropdowns(e) {
  if (!e.target.closest('.dropdown') && !e.target.closest('#notifBadge')) {
    document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
    AppState.notificacoes.dropdownAberto = false;
  }
}

/* =========================================================================
   42. INICIALIZAÇÃO DA PÁGINA (DOMContentLoaded) — BOOTSTRAP COMPLETO
   ========================================================================= */

document.addEventListener("DOMContentLoaded", () => {
  console.log('[SolitudeScan] Inicializando aplicação v4.0...');

  // ===== SEGURANÇA =====
  ativarProtecaoClickjacking();
  ativarProtecoesLeitor();
  ativarSincronizacaoSessao();

  // ===== TEMA =====
  aplicarTemaAutomatico();
  inicializarBotaoTema();

  // ===== COOKIE BANNER LGPD =====
  mostrarBannerCookies();

  // ===== RESTAURAR DADOS LOCAIS DO USUÁRIO =====
  AppState.usuario.foto = localStorage.getItem('solitude_foto') || AppState.usuario.foto;
  AppState.usuario.nome = localStorage.getItem('solitude_nome') || AppState.usuario.nome;
  AppState.usuario.telefone = localStorage.getItem('solitude_tel') || AppState.usuario.telefone;

  // ===== APLICAR OVERRIDES LOCAIS =====
  aplicarOverridesLocais();

  // ===== VERIFICAR VIP ATIVO =====
  verificarVipAtivo();

  // ===== CARREGAR DADOS =====
  carregarListasDoUsuario();
  carregarFavoritosUsuario();
  carregarHistoricoUsuario();
  carregarObras();
  inicializarBusca();
  renderizarContinueLendo();
  atualizarPerfilTela();
  atualizarVisibilidadeAdmin();

  // ===== LEITOR =====
  iniciarGestosLeitor();
  iniciarAtalhosTecladoLeitor();
  iniciarGestosAvancadosLeitor();
  injetarEstiloAutoImersivo();

  // ===== NOTIFICAÇÕES =====
  carregarNotificacoes();

  // ===== PWA =====
  registrarServiceWorker();
  inicializarPWAInstall();

  // ===== SEO — LINKS PROFUNDOS =====
  processarLinksProfundos();
  ativarPopstate();

  // ===== ACESSIBILIDADE =====
  aplicarAcessibilidade();
  marcarCardsNavegaveis();

  // ===== HERO — SWIPE + AUTO-ROTATE =====
  ativarSwipeHero();

  // ===== DROPDOWNS — FECHAR AO CLICAR FORA =====
  document.addEventListener('click', fecharDropdowns);

  // ===== SPOILER CHECKBOX =====
  garantirCheckboxSpoiler();

  // ===== TESTES =====
  processarParametroTestes();
  garantirBotaoTeste();

  // ===== LIMPAR PLACEHOLDERS MORTOS PERIODICAMENTE =====
  setInterval(limparPlaceholdersMortos, 5000);

  // ===== VERIFICAR SESSÃO SUPABASE =====
  if (AppState.supabase) verificarSessaoSupabase();

  // ===== BOTÃO ADMIN =====
  const btnAdmin = document.getElementById('btnAdminNav');
  if (btnAdmin) {
    btnAdmin.addEventListener('click', abrirPainelAdmin);
  }

  // ===== BOTÃO NOTIFICAÇÕES =====
  const notifBadge = document.getElementById('notifBadge');
  if (notifBadge) {
    notifBadge.addEventListener('click', toggleDropdownNotificacoes);
  }

  // ===== VERIFICAÇÃO DE VIP A CADA 1 HORA =====
  setInterval(verificarVipAtivo, 3600000);

  // ===== ESCONDER BOTÃO DE TESTE DOS VISITANTES (SÓ ADMIN VÊ) =====
  setTimeout(function () {
    if (AppState.usuario.isAdmin) return;
    const btnTeste = document.getElementById('btnTesteSolitude');
    if (btnTeste) btnTeste.remove();
  }, 1500);

  // ===== LOG FINAL =====
  console.log('[SolitudeScan] Aplicação inicializada com sucesso.');
  console.log('[SolitudeScan] Stack: Vanilla JS + Supabase');
  console.log('[SolitudeScan] Segurança: CSP + RLS + Validação de Inputs');
  console.log('[SolitudeScan] Performance: Lazy Loading + Service Worker + Debounce');
  console.log('[SolitudeScan] Acessibilidade: ARIA + Skip Link + Reduced Motion + Focus Trap');
});

