/* SolitudeScan — Plataforma
 * Cargos e permissões (admin / cooperador / leitor), painéis com dados reais,
 * suporte, denúncias, notificações, progresso de leitura persistente e
 * confirmação de e-mail. Nenhum dado fictício: tudo vem do Supabase.
 *
 * Regras de segurança: este arquivo NUNCA decide autorização sozinho.
 * As RPCs e as políticas RLS do banco são a fonte de verdade; a interface
 * apenas esconde o que o usuário não pode fazer.
 */
(function () {
  'use strict';

  var PF = (window.PF = window.PF || {});

  var ESTADO = {
    perfil: null,
    usuario: null,
    papel: 'leitor',
    status: 'ativo',
    carregado: false,
    abaAtual: null,
    obraSelecionada: null,
    timerProgresso: null
  };

  var CARGOS = { leitor: 'Leitor', cooperador: 'Cooperador', admin: 'Administrador' };
  var STATUS_CONTA = { ativo: 'Ativa', suspenso: 'Suspensa', banido: 'Banida' };
  var TIPOS_NOTIF = {
    novo_capitulo: 'Capítulos',
    resposta_comentario: 'Comentários',
    publicacao: 'Publicações',
    pagamento: 'Pagamentos',
    conta: 'Conta',
    seguranca: 'Segurança',
    suporte: 'Suporte',
    sistema: 'Sistema',
    system: 'Sistema'
  };

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function sb() {
    if (window.AppState && AppState.supabase) return AppState.supabase;
    try {
      if (window.supabase && typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL) {
        AppState.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        return AppState.supabase;
      }
    } catch (e) { /* sem cliente disponível */ }
    return null;
  }

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function textoErro(error) {
    if (!error) return 'Erro desconhecido.';
    var m = error.message || error.error_description || error.msg || String(error);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Falha de conexão. Verifique sua internet e tente novamente.';
    if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.';
    return m;
  }

  function colunaDesconhecida(error) {
    if (!error) return null;
    var m = error.message || '';
    var a = m.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
    if (a) return a[1];
    var b = m.match(/column "([a-zA-Z0-9_]+)" of relation/i);
    if (b) return b[1];
    var c = m.match(/column ([a-zA-Z0-9_]+) does not exist/i);
    if (c) return c[1];
    return null;
  }

  /* Insere ignorando colunas que o schema real ainda não possui.
     Assim o app funciona antes e depois de aplicar a migração. */
  async function inserirAdaptativo(tabela, payload) {
    var dados = Object.assign({}, payload);
    var ultimo = null;
    for (var i = 0; i < 10; i++) {
      var res = await sb().from(tabela).insert(dados).select();
      if (!res.error) return { data: res.data, error: null };
      ultimo = res.error;
      var col = colunaDesconhecida(res.error);
      if (col && Object.prototype.hasOwnProperty.call(dados, col)) { delete dados[col]; continue; }
      return { data: null, error: res.error };
    }
    return { data: null, error: ultimo };
  }

  async function atualizarAdaptativo(tabela, filtroCol, filtroVal, payload) {
    var dados = Object.assign({}, payload);
    var ultimo = null;
    for (var i = 0; i < 10; i++) {
      var res = await sb().from(tabela).update(dados).eq(filtroCol, filtroVal).select();
      if (!res.error) return { data: res.data, error: null };
      ultimo = res.error;
      var col = colunaDesconhecida(res.error);
      if (col && Object.prototype.hasOwnProperty.call(dados, col)) { delete dados[col]; continue; }
      return { data: null, error: res.error };
    }
    return { data: null, error: ultimo };
  }

  async function contar(tabela, aplicar) {
    try {
      var q = sb().from(tabela).select('id', { count: 'exact', head: true });
      if (typeof aplicar === 'function') q = aplicar(q) || q;
      var res = await q;
      if (res.error) return null;
      return res.count;
    } catch (e) { return null; }
  }

  function aviso(el, tipo, mensagem) {
    if (!el) return;
    el.className = 'plat-alert plat-alert--' + tipo;
    el.textContent = mensagem;
    el.style.display = 'block';
  }

  function dataCurta(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }

  /* ------------------------------------------------------------------ */
  /* Sessão e papel                                                      */
  /* ------------------------------------------------------------------ */

  PF.carregarSessao = async function () {
    if (!sb()) return null;
    try {
      var sess = await sb().auth.getSession();
      ESTADO.usuario = sess && sess.data && sess.data.session ? sess.data.session.user : null;
      if (!ESTADO.usuario) { ESTADO.perfil = null; ESTADO.papel = 'leitor'; ESTADO.carregado = true; return null; }

      var res = await sb().from('profiles').select('*').eq('id', ESTADO.usuario.id).maybeSingle();
      ESTADO.perfil = res && !res.error ? res.data : null;
      ESTADO.papel = calcularPapel(ESTADO.perfil);
      ESTADO.status = (ESTADO.perfil && ESTADO.perfil.status) || 'ativo';
      ESTADO.carregado = true;
      return ESTADO.perfil;
    } catch (e) {
      ESTADO.carregado = true;
      return null;
    }
  };

  function calcularPapel(p) {
    if (!p) return 'leitor';
    if (p.is_admin === true) return 'admin';
    if (p.role === 'admin') return 'admin';
    if (p.role === 'cooperador') return 'cooperador';
    return 'leitor';
  }

  PF.papel = function () { return ESTADO.papel; };
  PF.ehAdmin = function () { return ESTADO.papel === 'admin'; };
  PF.ehStaff = function () { return ESTADO.papel === 'admin' || ESTADO.papel === 'cooperador'; };
  PF.perfil = function () { return ESTADO.perfil; };

  /* ------------------------------------------------------------------ */
  /* Navegação injetada (Painel / Suporte / Notificações)                */
  /* ------------------------------------------------------------------ */

  function injetarNavegacao() {
    var nav = document.querySelector('.nav-links') || document.querySelector('.navbar') || document.querySelector('nav');
    if (!nav || document.getElementById('pfNavPainel')) return;

    if (PF.ehStaff()) {
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'pfNavPainel';
      b.className = 'nav-link pf-nav-btn';
      b.textContent = 'Painel';
      b.addEventListener('click', function () { PF.abrirPainel(); });
      nav.appendChild(b);
    }

    var s = document.createElement('a');
    s.id = 'pfNavSuporte';
    s.className = 'nav-link';
    s.href = '#';
    s.textContent = 'Suporte';
    s.addEventListener('click', function (ev) { ev.preventDefault(); PF.abrirSuporte(); });
    nav.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* Confirmação de e-mail                                              */
  /* ------------------------------------------------------------------ */

  function barraEmail() {
    var bar = document.getElementById('pfEmailBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pfEmailBar';
      bar.className = 'plat-emailbar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<span id="pfEmailTxt"></span>' +
        '<button type="button" id="pfEmailReenviar">Reenviar confirmação</button>';
      document.body.insertBefore(bar, document.body.firstChild);
      bar.querySelector('#pfEmailReenviar').addEventListener('click', reenviarConfirmacao);
    }
    return bar;
  }

  function atualizarBarraEmail() {
    var bar = barraEmail();
    var logado = !!ESTADO.usuario;
    var confirmado = !!(ESTADO.usuario && ESTADO.usuario.email_confirmed_at);
    var txt = bar.querySelector('#pfEmailTxt');

    if (!logado || confirmado) { bar.classList.remove('ativo'); return; }

    bar.classList.add('ativo');
    txt.textContent = 'Confirme seu e-mail (' + (ESTADO.usuario.email || '') + ') para liberar todos os recursos.';
  }

  async function reenviarConfirmacao() {
    var btn = document.getElementById('pfEmailReenviar');
    var txt = document.getElementById('pfEmailTxt');
    if (!ESTADO.usuario || !ESTADO.usuario.email) {
      if (txt) txt.textContent = 'Entre na sua conta para reenviar a confirmação.';
      return;
    }
    var original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
      var res = await sb().auth.resend({ type: 'signup', email: ESTADO.usuario.email });
      if (res && res.error) {
        if (txt) txt.textContent = 'Não foi possível enviar: ' + textoErro(res.error);
        if (window.mostrarToast) mostrarToast('Falha ao enviar confirmação: ' + textoErro(res.error), 'erro');
      } else {
        if (txt) txt.textContent = 'Confirmação solicitada. Verifique a caixa de entrada e o spam de ' + ESTADO.usuario.email + '.';
        if (window.mostrarToast) mostrarToast('E-mail de confirmação solicitado.', 'sucesso');
      }
    } catch (e) {
      if (txt) txt.textContent = 'Falha de conexão ao reenviar a confirmação.';
      if (window.mostrarToast) mostrarToast('Falha de conexão ao reenviar.', 'erro');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original || 'Reenviar confirmação'; }
    }
  }

  PF.verificarEmail = async function () {
    if (!sb()) return false;
    var res = await sb().auth.getUser();
    if (res && res.data && res.data.user) {
      ESTADO.usuario = res.data.user;
      atualizarBarraEmail();
      return !!res.data.user.email_confirmed_at;
    }
    return false;
  };

  /* ------------------------------------------------------------------ */
  /* Overlay genérico                                                    */
  /* ------------------------------------------------------------------ */

  function overlay() {
    var el = document.getElementById('pfOverlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pfOverlay';
    el.className = 'plat-overlay';
    el.innerHTML =
      '<div class="plat-shell" role="dialog" aria-modal="true" aria-labelledby="pfTitulo">' +
        '<div class="plat-shell-head">' +
          '<h2 id="pfTitulo">Painel</h2>' +
          '<button type="button" class="plat-btn plat-btn--ghost" data-pf="fechar" aria-label="Fechar painel">Fechar</button>' +
        '</div>' +
        '<div class="plat-tabs" id="pfTabs" role="tablist"></div>' +
        '<div class="plat-shell-body" id="pfCorpo"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      if (ev.target === el) PF.fecharPainel();
    });
    return el;
  }

  PF.fecharPainel = function () {
    var el = document.getElementById('pfOverlay');
    if (el) el.classList.remove('aberto');
    document.body.style.overflow = '';
  };

  function montarAbas(abas, ativa) {
    var tabs = document.getElementById('pfTabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    abas.forEach(function (aba) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'plat-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(aba.id === ativa));
      b.textContent = aba.rotulo;
      b.addEventListener('click', function () { aba.acao(); });
      tabs.appendChild(b);
    });
  }

  function corpo() { return document.getElementById('pfCorpo'); }

  /* ------------------------------------------------------------------ */
  /* Painel                                                             */
  /* ------------------------------------------------------------------ */

  PF.abrirPainel = async function (abaInicial) {
    if (!ESTADO.carregado) await PF.carregarSessao();
    if (!PF.ehStaff()) {
      if (window.mostrarToast) mostrarToast('Acesso restrito à equipe da plataforma.', 'erro');
      return;
    }
    if (ESTADO.status !== 'ativo' && !PF.ehAdmin()) {
      if (window.mostrarToast) mostrarToast('Sua conta está ' + (STATUS_CONTA[ESTADO.status] || ESTADO.status) + '. Fale com o suporte.', 'erro');
      return;
    }

    var el = overlay();
    el.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    document.getElementById('pfTitulo').textContent = PF.ehAdmin() ? 'Painel administrativo' : 'Painel do cooperador';

    var abas = PF.ehAdmin() ? [
      { id: 'geral', rotulo: 'Visão geral', acao: function () { abaAdmin('geral'); } },
      { id: 'obras', rotulo: 'Obras', acao: function () { abaAdmin('obras'); } },
      { id: 'usuarios', rotulo: 'Usuários', acao: function () { abaAdmin('usuarios'); } },
      { id: 'suporte', rotulo: 'Suporte', acao: function () { abaAdmin('suporte'); } },
      { id: 'denuncias', rotulo: 'Denúncias', acao: function () { abaAdmin('denuncias'); } },
      { id: 'auditoria', rotulo: 'Auditoria', acao: function () { abaAdmin('auditoria'); } }
    ] : [
      { id: 'geral', rotulo: 'Visão geral', acao: function () { abaCoop('geral'); } },
      { id: 'minhas', rotulo: 'Minhas obras', acao: function () { abaCoop('minhas'); } },
      { id: 'nova', rotulo: 'Nova obra', acao: function () { abaCoop('nova'); } }
    ];

    var inicial = abaInicial || 'geral';
    montarAbas(abas, inicial);
    if (PF.ehAdmin()) await abaAdmin(inicial);
    else await abaCoop(inicial);
  };

  /* --------------------------- ADMIN -------------------------------- */

  async function abaAdmin(aba) {
    ESTADO.abaAtual = aba;
    var abas = ['geral', 'obras', 'usuarios', 'suporte', 'denuncias', 'auditoria'];
    var tabs = document.querySelectorAll('#pfTabs .plat-tab');
    tabs.forEach(function (t, i) { t.setAttribute('aria-selected', String(abas[i] === aba)); });

    if (aba === 'geral') return adminGeral();
    if (aba === 'obras') return adminObras();
    if (aba === 'usuarios') return adminUsuarios();
    if (aba === 'suporte') return adminSuporte();
    if (aba === 'denuncias') return adminDenuncias();
    if (aba === 'auditoria') return adminAuditoria();
  }

  async function adminGeral() {
    corpo().innerHTML = '<div class="plat-empty">Carregando indicadores reais...</div>';
    var res = await Promise.all([
      contar('works'),
      contar('works', function (q) { return q.eq('approval_status', 'pendente'); }),
      contar('chapters'),
      contar('profiles'),
      contar('profiles', function (q) { return q.neq('status', 'ativo'); }),
      contar('payment_requests', function (q) { return q.eq('status', 'pendente'); }),
      contar('reports'),
      contar('support_tickets', function (q) { return q.neq('status', 'resolvido'); })
    ]);

    function num(v) { return v === null || v === undefined ? '—' : String(v); }

    corpo().innerHTML =
      '<div class="plat-stats">' +
        stat(num(res[0]), 'Obras cadastradas') +
        stat(num(res[1]), 'Aguardando aprovação') +
        stat(num(res[2]), 'Capítulos') +
        stat(num(res[3]), 'Usuários') +
        stat(num(res[4]), 'Contas restritas') +
        stat(num(res[5]), 'Pagamentos pendentes') +
        stat(num(res[6]), 'Denúncias') +
        stat(num(res[7]), 'Chamados abertos') +
      '</div>' +
      '<div class="plat-card"><h3>Como os números são calculados</h3>' +
      '<p>Contagens feitas diretamente nas tabelas do Supabase com as permissões da sua conta. ' +
      'Se um indicador mostrar “—”, a consulta foi bloqueada pelas políticas RLS ou a tabela não existe — ' +
      'isso é um aviso real, não um número inventado.</p></div>';

    function stat(valor, rotulo) {
      return '<div class="plat-stat"><strong>' + esc(valor) + '</strong><span>' + esc(rotulo) + '</span></div>';
    }
  }

  async function adminObras() {
    corpo().innerHTML = '<div class="plat-empty">Carregando obras...</div>';
    var res = await sb().from('works').select('*').order('created_at', { ascending: false }).limit(60);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar as obras: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var obras = res.data || [];
    if (!obras.length) {
      corpo().innerHTML = '<div class="plat-empty">Nenhuma obra cadastrada ainda. Use o formulário de publicação para começar.</div>';
      return;
    }

    corpo().innerHTML =
      '<div class="plat-toolbar"><span class="plat-meta">' + obras.length + ' obra(s)</span></div>' +
      '<div class="plat-list">' + obras.map(function (o) {
        var status = o.approval_status || 'aprovado';
        var classe = status === 'pendente' ? 'plat-badge--warn' : status === 'rejeitado' ? 'plat-badge--erro' : 'plat-badge--ok';
        return '<div class="plat-row">' +
          '<div><h4>' + esc(o.title || 'Sem título') + '</h4>' +
          '<p>' + esc(o.type || o.tipo || 'Obra') + ' · ' + esc(o.status || '—') + ' · atualizada em ' + esc(dataCurta(o.updated_at || o.created_at)) + '</p>' +
          '<p><span class="plat-badge ' + classe + '">' + esc(status) + '</span> ' +
          (o.is_featured ? '<span class="plat-badge">Destaque</span>' : '') + '</p></div>' +
          '<div class="plat-actions">' +
          (status !== 'aprovado' ? '<button type="button" class="plat-btn plat-btn--primary" data-pf="aprovar" data-id="' + esc(o.id) + '">Aprovar</button>' : '') +
          (status !== 'rejeitado' ? '<button type="button" class="plat-btn plat-btn--danger" data-pf="rejeitar" data-id="' + esc(o.id) + '">Rejeitar</button>' : '') +
          '</div></div>';
      }).join('') + '</div>';

    corpo().querySelectorAll('[data-pf]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.getAttribute('data-id');
        var aprovar = b.getAttribute('data-pf') === 'aprovar';
        var motivo = aprovar ? null : (window.prompt('Motivo da rejeição (o autor será notificado):') || '');
        if (!aprovar && !motivo.trim()) return;
        b.disabled = true;
        var rpc = await sb().rpc('admin_aprovar_obra', { p_work: id, p_aprovar: aprovar, p_motivo: motivo });
        if (rpc.error) {
          if (window.mostrarToast) mostrarToast('Falha: ' + textoErro(rpc.error), 'erro');
          b.disabled = false;
          return;
        }
        if (window.mostrarToast) mostrarToast(aprovar ? 'Obra aprovada.' : 'Obra rejeitada.', 'sucesso');
        adminObras();
      });
    });
  }

  async function adminUsuarios() {
    corpo().innerHTML = '<div class="plat-empty">Carregando usuários...</div>';
    var res = await sb().from('profiles').select('*').order('created_at', { ascending: false }).limit(80);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar usuários: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var lista = res.data || [];
    if (!lista.length) { corpo().innerHTML = '<div class="plat-empty">Nenhum usuário encontrado.</div>'; return; }

    corpo().innerHTML =
      '<div class="plat-toolbar"><span class="plat-meta">' + lista.length + ' conta(s)</span></div>' +
      '<div class="plat-list">' + lista.map(function (u) {
        var papel = calcularPapel(u);
        var st = u.status || 'ativo';
        var badge = papel === 'admin' ? 'plat-badge--admin' : papel === 'cooperador' ? 'plat-badge--coop' : '';
        var stBadge = st === 'ativo' ? 'plat-badge--ok' : st === 'suspenso' ? 'plat-badge--warn' : 'plat-badge--erro';
        return '<div class="plat-row"><div>' +
          '<h4>' + esc(u.display_name || u.username || 'Usuário') + ' <span class="plat-badge ' + badge + '">' + esc(CARGOS[papel]) + '</span></h4>' +
          '<p>' + esc(u.email || 'e-mail não disponível') + ' · desde ' + esc(dataCurta(u.created_at)) + '</p>' +
          '<p><span class="plat-badge ' + stBadge + '">' + esc(STATUS_CONTA[st] || st) + '</span></p></div>' +
          '<div class="plat-actions">' +
          '<select class="plat-select" data-cargo="' + esc(u.id) + '" aria-label="Cargo de ' + esc(u.username || 'usuário') + '">' +
            ['leitor', 'cooperador', 'admin'].map(function (r) {
              return '<option value="' + r + '"' + (papel === r ? ' selected' : '') + '>' + CARGOS[r] + '</option>';
            }).join('') + '</select>' +
          '<select class="plat-select" data-status="' + esc(u.id) + '" aria-label="Status de ' + esc(u.username || 'usuário') + '">' +
            ['ativo', 'suspenso', 'banido'].map(function (s) {
              return '<option value="' + s + '"' + (st === s ? ' selected' : '') + '>' + STATUS_CONTA[s] + '</option>';
            }).join('') + '</select>' +
          '</div></div>';
      }).join('') + '</div>';

    corpo().querySelectorAll('[data-cargo]').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        var id = sel.getAttribute('data-cargo');
        var papel = sel.value;
        sel.disabled = true;
        var r = await sb().rpc('admin_definir_cargo', { p_user: id, p_role: papel });
        sel.disabled = false;
        if (r.error) {
          if (window.mostrarToast) mostrarToast('Falha ao alterar cargo: ' + textoErro(r.error), 'erro');
          return;
        }
        if (window.mostrarToast) mostrarToast('Cargo atualizado.', 'sucesso');
      });
    });

    corpo().querySelectorAll('[data-status]').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        var id = sel.getAttribute('data-status');
        var st = sel.value;
        var nota = null;
        if (st !== 'ativo') {
          nota = window.prompt('Motivo (registrado na auditoria e enviado ao usuário):') || '';
          if (!nota.trim()) { sel.value = 'ativo'; return; }
        }
        sel.disabled = true;
        var r = await sb().rpc('admin_definir_status', { p_user: id, p_status: st, p_nota: nota });
        sel.disabled = false;
        if (r.error) {
          if (window.mostrarToast) mostrarToast('Falha ao alterar status: ' + textoErro(r.error), 'erro');
          return;
        }
        if (window.mostrarToast) mostrarToast('Status atualizado.', 'sucesso');
      });
    });
  }

  async function adminSuporte() {
    corpo().innerHTML = '<div class="plat-empty">Carregando chamados...</div>';
    var res = await sb().from('support_tickets').select('*').order('created_at', { ascending: false }).limit(60);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar chamados: ' + esc(textoErro(res.error)) +
        '<br><small>Execute a migração da plataforma no Supabase para criar a tabela de suporte.</small></div>';
      return;
    }
    var tickets = res.data || [];
    if (!tickets.length) { corpo().innerHTML = '<div class="plat-empty">Nenhum chamado aberto.</div>'; return; }

    corpo().innerHTML = '<div class="plat-list">' + tickets.map(function (t) {
      var st = t.status || 'aberto';
      var cls = st === 'resolvido' || st === 'encerrado' ? 'plat-badge--ok' : st === 'aberto' ? 'plat-badge--warn' : '';
      return '<div class="plat-row"><div>' +
        '<h4>' + esc(t.subject) + ' <span class="plat-badge ' + cls + '">' + esc(st) + '</span></h4>' +
        '<p>' + esc(t.category) + ' · protocolo ' + esc(t.protocol || '—') + ' · ' + esc(dataCurta(t.created_at)) + '</p>' +
        '<p>' + esc(String(t.message || '').slice(0, 220)) + '</p></div>' +
        '<div class="plat-actions">' +
        '<select class="plat-select" data-ticket="' + esc(t.id) + '" aria-label="Status do chamado">' +
          ['aberto', 'em_analise', 'aguardando_usuario', 'resolvido', 'encerrado'].map(function (s) {
            return '<option value="' + s + '"' + (st === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') + '</select>' +
        '</div></div>';
    }).join('') + '</div>';

    corpo().querySelectorAll('[data-ticket]').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        sel.disabled = true;
        var r = await sb().from('support_tickets').update({ status: sel.value, updated_at: new Date().toISOString() }).eq('id', sel.getAttribute('data-ticket'));
        sel.disabled = false;
        if (r.error) { if (window.mostrarToast) mostrarToast('Falha: ' + textoErro(r.error), 'erro'); return; }
        if (window.mostrarToast) mostrarToast('Chamado atualizado.', 'sucesso');
      });
    });
  }

  async function adminDenuncias() {
    corpo().innerHTML = '<div class="plat-empty">Carregando denúncias...</div>';
    var res = await sb().from('reports').select('*').order('created_at', { ascending: false }).limit(60);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar denúncias: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var lista = res.data || [];
    if (!lista.length) { corpo().innerHTML = '<div class="plat-empty">Nenhuma denúncia registrada.</div>'; return; }

    corpo().innerHTML = '<div class="plat-list">' + lista.map(function (d) {
      var st = d.status || 'pendente';
      var cls = st === 'resolvido' || st === 'resolvida' ? 'plat-badge--ok' : 'plat-badge--warn';
      return '<div class="plat-row"><div>' +
        '<h4>Denúncia <span class="plat-badge ' + cls + '">' + esc(st) + '</span></h4>' +
        '<p>' + esc(d.reason || d.motivo || 'Sem motivo informado') + ' · ' + esc(dataCurta(d.created_at)) + '</p>' +
        '<p>' + esc(String(d.details || d.descricao || d.description || '').slice(0, 240)) + '</p></div>' +
        '<div class="plat-actions">' +
        '<button type="button" class="plat-btn" data-denuncia="' + esc(d.id) + '">Marcar como resolvida</button>' +
        '</div></div>';
    }).join('') + '</div>';

    corpo().querySelectorAll('[data-denuncia]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var r = await sb().from('reports').update({ status: 'resolvido' }).eq('id', b.getAttribute('data-denuncia'));
        if (r.error) { b.disabled = false; if (window.mostrarToast) mostrarToast('Falha: ' + textoErro(r.error), 'erro'); return; }
        if (window.mostrarToast) mostrarToast('Denúncia resolvida.', 'sucesso');
        adminDenuncias();
      });
    });
  }

  async function adminAuditoria() {
    corpo().innerHTML = '<div class="plat-empty">Carregando auditoria...</div>';
    var res = await sb().from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(80);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar a auditoria: ' + esc(textoErro(res.error)) +
        '<br><small>A tabela é criada pela migração da plataforma.</small></div>';
      return;
    }
    var logs = res.data || [];
    if (!logs.length) { corpo().innerHTML = '<div class="plat-empty">Nenhuma ação administrativa registrada ainda.</div>'; return; }

    corpo().innerHTML = '<div class="plat-list">' + logs.map(function (l) {
      return '<div class="plat-row"><div><h4>' + esc(l.action) + '</h4>' +
        '<p>' + esc(l.target_type || '') + ' ' + esc(l.target_id || '') + ' · ' + esc(dataCurta(l.created_at)) + '</p>' +
        '<p><small>' + esc(JSON.stringify(l.details || {})) + '</small></p></div></div>';
    }).join('') + '</div>';
  }

  /* ------------------------ COOPERADOR ------------------------------- */

  async function abaCoop(aba) {
    ESTADO.abaAtual = aba;
    var abas = ['geral', 'minhas', 'nova'];
    var tabs = document.querySelectorAll('#pfTabs .plat-tab');
    tabs.forEach(function (t, i) { t.setAttribute('aria-selected', String(abas[i] === aba)); });
    if (aba === 'geral') return coopGeral();
    if (aba === 'minhas') return coopMinhas();
    if (aba === 'nova') return coopNova();
  }

  async function coopGeral() {
    var uid = ESTADO.usuario ? ESTADO.usuario.id : null;
    corpo().innerHTML = '<div class="plat-empty">Carregando...</div>';
    var obras = await sb().from('works').select('*').eq('submitted_by', uid).order('created_at', { ascending: false }).limit(50);
    var lista = obras.error ? [] : (obras.data || []);
    var aprovadas = lista.filter(function (o) { return (o.approval_status || 'aprovado') === 'aprovado'; }).length;
    var pendentes = lista.filter(function (o) { return o.approval_status === 'pendente'; }).length;
    var rejeitadas = lista.filter(function (o) { return o.approval_status === 'rejeitado'; }).length;

    corpo().innerHTML =
      '<div class="plat-stats">' +
        '<div class="plat-stat"><strong>' + lista.length + '</strong><span>Obras enviadas</span></div>' +
        '<div class="plat-stat"><strong>' + aprovadas + '</strong><span>Aprovadas</span></div>' +
        '<div class="plat-stat"><strong>' + pendentes + '</strong><span>Em análise</span></div>' +
        '<div class="plat-stat"><strong>' + rejeitadas + '</strong><span>Rejeitadas</span></div>' +
      '</div>' +
      (obras.error ? '<div class="plat-alert plat-alert--erro">Consulta restrita: ' + esc(textoErro(obras.error)) +
        '<br><small>Aplique a migração da plataforma para liberar o envio de obras por cooperadores.</small></div>' : '') +
      '<div class="plat-card"><h3>O que você pode fazer</h3><p>Cadastrar obras, enviar capas, criar capítulos e páginas, salvar rascunhos e enviar para aprovação. ' +
      'Aprovar obras, alterar cargos, pagamentos e planos são ações exclusivas do administrador — bloqueadas também no banco de dados.</p></div>';
  }

  async function coopMinhas() {
    var uid = ESTADO.usuario ? ESTADO.usuario.id : null;
    corpo().innerHTML = '<div class="plat-empty">Carregando suas obras...</div>';
    var res = await sb().from('works').select('*').eq('submitted_by', uid).order('created_at', { ascending: false }).limit(50);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar suas obras: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var obras = res.data || [];
    if (!obras.length) {
      corpo().innerHTML = '<div class="plat-empty">Você ainda não enviou obras. Use a aba “Nova obra”.</div>';
      return;
    }

    corpo().innerHTML = '<div class="plat-list">' + obras.map(function (o) {
      var st = o.approval_status || 'aprovado';
      var cls = st === 'aprovado' ? 'plat-badge--ok' : st === 'pendente' ? 'plat-badge--warn' : 'plat-badge--erro';
      return '<div class="plat-row"><div><h4>' + esc(o.title || 'Sem título') + ' <span class="plat-badge ' + cls + '">' + esc(st) + '</span></h4>' +
        '<p>' + esc(o.type || o.tipo || 'Obra') + ' · ' + esc(o.status || '—') + '</p>' +
        (o.rejection_reason ? '<p><small>Motivo da rejeição: ' + esc(o.rejection_reason) + '</small></p>' : '') +
        '</div><div class="plat-actions">' +
        '<button type="button" class="plat-btn" data-capitulos="' + esc(o.id) + '" data-titulo="' + esc(o.title || '') + '">Capítulos</button>' +
        '</div></div>';
    }).join('') + '</div>';

    corpo().querySelectorAll('[data-capitulos]').forEach(function (b) {
      b.addEventListener('click', function () {
        ESTADO.obraSelecionada = { id: b.getAttribute('data-capitulos'), titulo: b.getAttribute('data-titulo') };
        coopCapitulos();
      });
    });
  }

  async function coopNova() {
    corpo().innerHTML = '<div class="plat-empty">Carregando gêneros...</div>';
    var generos = [];
    var g = await sb().from('genres').select('*').limit(100);
    if (!g.error && g.data) generos = g.data;

    corpo().innerHTML =
      '<form class="plat-form" id="pfFormObra" novalidate>' +
        '<div class="plat-field"><label for="pfTituloObra">Título *</label>' +
          '<input class="plat-input" id="pfTituloObra" name="title" maxlength="120" required>' +
          '<span class="plat-erro" data-erro="title"></span></div>' +
        '<div class="plat-field"><label for="pfSinopse">Sinopse *</label>' +
          '<textarea class="plat-textarea" id="pfSinopse" name="synopsis" maxlength="2000" required></textarea>' +
          '<span class="plat-hint">Mínimo de 20 caracteres. Aparece na página da obra e na pesquisa.</span>' +
          '<span class="plat-erro" data-erro="synopsis"></span></div>' +
        '<div class="plat-grid">' +
          '<div class="plat-field"><label for="pfAutor">Autor</label><input class="plat-input" id="pfAutor" name="author" maxlength="80"></div>' +
          '<div class="plat-field"><label for="pfArtista">Artista</label><input class="plat-input" id="pfArtista" name="artist" maxlength="80"></div>' +
        '</div>' +
        '<div class="plat-grid">' +
          '<div class="plat-field"><label for="pfTipo">Tipo *</label><select class="plat-select" id="pfTipo" name="type">' +
            ['Mangá', 'Manhwa', 'Manhua', 'Webtoon'].map(function (t) { return '<option>' + t + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="plat-field"><label for="pfStatusObra">Status *</label><select class="plat-select" id="pfStatusObra" name="status">' +
            ['Em andamento', 'Finalizado', 'Hiato', 'Cancelado'].map(function (t) { return '<option>' + t + '</option>'; }).join('') +
          '</select></div>' +
        '</div>' +
        (generos.length ? '<div class="plat-field"><label>Gêneros</label><div class="plat-chips" id="pfGeneros">' +
          generos.map(function (gg) {
            var nome = gg.name || gg.nome || gg.title || '';
            return '<button type="button" class="plat-chip" aria-pressed="false" data-genero="' + esc(gg.id) + '" data-nome="' + esc(nome) + '">' + esc(nome) + '</button>';
          }).join('') + '</div></div>' : '') +
        '<div class="plat-field"><label for="pfCapa">Capa (JPG, PNG ou WebP, até 5 MB)</label>' +
          '<input class="plat-input" id="pfCapa" name="cover" type="file" accept="image/jpeg,image/png,image/webp">' +
          '<span class="plat-erro" data-erro="cover"></span>' +
          '<div id="pfCapaPreview"></div></div>' +
        '<div class="plat-grid">' +
          '<label class="plat-field"><span>Conteúdo +18</span><input type="checkbox" id="pfAdulto"></label>' +
          '<label class="plat-field"><span>Exclusivo VIP</span><input type="checkbox" id="pfVip"></label>' +
        '</div>' +
        '<div class="plat-actions">' +
          '<button type="submit" class="plat-btn plat-btn--primary" id="pfEnviarObra">Enviar para aprovação</button>' +
          '<button type="button" class="plat-btn" id="pfRascunho">Salvar rascunho</button>' +
        '</div>' +
        '<div id="pfObraMsg" class="plat-alert" style="display:none"></div>' +
      '</form>';

    var chips = corpo().querySelectorAll('[data-genero]');
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      });
    });

    var capa = document.getElementById('pfCapa');
    if (capa) {
      capa.addEventListener('change', function () {
        var preview = document.getElementById('pfCapaPreview');
        var f = capa.files && capa.files[0];
        preview.innerHTML = '';
        if (!f) return;
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
          document.querySelector('[data-erro="cover"]').textContent = 'Formato inválido. Use JPG, PNG ou WebP.';
          capa.value = '';
          return;
        }
        if (f.size > 5 * 1024 * 1024) {
          document.querySelector('[data-erro="cover"]').textContent = 'A imagem tem mais de 5 MB.';
          capa.value = '';
          return;
        }
        document.querySelector('[data-erro="cover"]').textContent = '';
        var img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.alt = 'Pré-visualização da capa';
        img.style.cssText = 'max-width:140px;border-radius:10px;margin-top:10px;display:block';
        preview.appendChild(img);
      });
    }

    document.getElementById('pfFormObra').addEventListener('submit', function (ev) {
      ev.preventDefault();
      salvarObra(false);
    });
    document.getElementById('pfRascunho').addEventListener('click', function () { salvarObra(true); });
  }

  async function salvarObra(rascunho) {
    var msg = document.getElementById('pfObraMsg');
    var titulo = document.getElementById('pfTituloObra');
    var sinopse = document.getElementById('pfSinopse');
    var capa = document.getElementById('pfCapa');
    var btn = document.getElementById('pfEnviarObra');
    var erros = {};

    document.querySelectorAll('[data-erro]').forEach(function (e) { e.textContent = ''; });
    if (!titulo.value || titulo.value.trim().length < 3) erros.title = 'Informe um título com pelo menos 3 caracteres.';
    if (!rascunho && (!sinopse.value || sinopse.value.trim().length < 20)) erros.synopsis = 'A sinopse precisa de pelo menos 20 caracteres.';

    if (Object.keys(erros).length) {
      Object.keys(erros).forEach(function (k) {
        var alvo = document.querySelector('[data-erro="' + k + '"]');
        if (alvo) alvo.textContent = erros[k];
      });
      aviso(msg, 'erro', 'Corrija os campos destacados antes de continuar.');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    aviso(msg, 'aviso', 'Enviando obra...');

    try {
      var urlCapa = null;
      var arquivo = capa && capa.files && capa.files[0];
      if (arquivo) {
        var ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
        var caminho = ESTADO.usuario.id + '/' + Date.now() + '.' + ext;
        var up = await sb().storage.from('covers').upload(caminho, arquivo, { upsert: false, contentType: arquivo.type });
        if (up.error) {
          aviso(msg, 'erro', 'Falha no upload da capa: ' + textoErro(up.error));
          if (btn) { btn.disabled = false; btn.textContent = 'Enviar para aprovação'; }
          return;
        }
        var pub = sb().storage.from('covers').getPublicUrl(caminho);
        urlCapa = pub && pub.data ? pub.data.publicUrl : null;
      }

      var selecionados = [];
      corpo().querySelectorAll('[data-genero][aria-pressed="true"]').forEach(function (c) {
        selecionados.push(c.getAttribute('data-nome'));
      });

      var payload = {
        title: titulo.value.trim(),
        synopsis: sinopse.value.trim(),
        author: (document.getElementById('pfAutor').value || '').trim() || null,
        artist: (document.getElementById('pfArtista').value || '').trim() || null,
        type: document.getElementById('pfTipo').value,
        status: document.getElementById('pfStatusObra').value,
        cover_url: urlCapa,
        is_vip: document.getElementById('pfVip').checked,
        is_adult: document.getElementById('pfAdulto').checked,
        submitted_by: ESTADO.usuario.id,
        approval_status: rascunho ? 'rascunho' : 'pendente'
      };

      var res = await inserirAdaptativo('works', payload);
      if (res.error) {
        aviso(msg, 'erro', 'Não foi possível salvar a obra: ' + textoErro(res.error));
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar para aprovação'; }
        return;
      }

      var obra = res.data && res.data[0] ? res.data[0] : null;
      if (obra && selecionados.length) {
        // Tenta gravar os gêneros em tabela de junção, se existir. Falha aqui
        // não invalida a obra: apenas não associa gêneros.
        for (var i = 0; i < selecionados.length; i++) {
          try {
            await sb().from('work_genres').insert({ work_id: obra.id, genre: selecionados[i] });
          } catch (e) { /* schema alternativo */ }
        }
      }

      aviso(msg, 'ok', rascunho ? 'Rascunho salvo.' : 'Obra enviada para aprovação administrativa.');
      if (window.mostrarToast) mostrarToast(rascunho ? 'Rascunho salvo.' : 'Obra enviada para aprovação.', 'sucesso');
      document.getElementById('pfFormObra').reset();
      var prev = document.getElementById('pfCapaPreview');
      if (prev) prev.innerHTML = '';
      if (obra) ESTADO.obraSelecionada = { id: obra.id, titulo: obra.title };
      setTimeout(function () { abaCoop('minhas'); }, 900);
    } catch (e) {
      aviso(msg, 'erro', 'Erro inesperado ao salvar: ' + textoErro(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar para aprovação'; }
    }
  }

  async function coopCapitulos() {
    var obra = ESTADO.obraSelecionada;
    if (!obra) return;
    corpo().innerHTML =
      '<div class="plat-toolbar"><div><h3 style="margin:0">' + esc(obra.titulo) + '</h3>' +
      '<span class="plat-meta">Capítulos e páginas</span></div>' +
      '<button type="button" class="plat-btn" id="pfVoltarObras">Voltar</button></div>' +
      '<div class="plat-card" style="margin-bottom:16px"><form class="plat-form" id="pfFormCapitulo">' +
        '<div class="plat-grid">' +
          '<div class="plat-field"><label for="pfNumCap">Número do capítulo *</label><input class="plat-input" id="pfNumCap" type="number" min="0" step="0.1" required></div>' +
          '<div class="plat-field"><label for="pfTitCap">Título do capítulo</label><input class="plat-input" id="pfTitCap" maxlength="120"></div>' +
        '</div>' +
        '<div class="plat-field"><label for="pfPaginas">Páginas (imagens em ordem)</label>' +
          '<input class="plat-input" id="pfPaginas" type="file" accept="image/jpeg,image/png,image/webp" multiple>' +
          '<span class="plat-hint">Selecione as imagens na ordem de leitura. Cada arquivo até 5 MB.</span></div>' +
        '<div class="plat-actions"><button type="submit" class="plat-btn plat-btn--primary" id="pfCriarCap">Criar capítulo e enviar páginas</button></div>' +
        '<div id="pfCapMsg" class="plat-alert" style="display:none"></div>' +
      '</form></div>' +
      '<div id="pfListaCaps" class="plat-list"><div class="plat-empty">Carregando capítulos...</div></div>';

    document.getElementById('pfVoltarObras').addEventListener('click', function () { abaCoop('minhas'); });
    document.getElementById('pfFormCapitulo').addEventListener('submit', criarCapitulo);
    carregarCapitulosCoop(obra.id);
  }

  async function carregarCapitulosCoop(obraId) {
    var alvo = document.getElementById('pfListaCaps');
    if (!alvo) return;
    var res = await sb().from('chapters').select('*').eq('work_id', obraId).order('number', { ascending: true }).limit(200);
    if (res.error) {
      alvo.innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível listar capítulos: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var caps = res.data || [];
    if (!caps.length) { alvo.innerHTML = '<div class="plat-empty">Nenhum capítulo publicado nesta obra.</div>'; return; }
    alvo.innerHTML = caps.map(function (c) {
      return '<div class="plat-row"><div><h4>Capítulo ' + esc(c.number) + (c.title ? ' — ' + esc(c.title) : '') + '</h4>' +
        '<p>Criado em ' + esc(dataCurta(c.created_at)) + '</p></div></div>';
    }).join('');
  }

  async function criarCapitulo(ev) {
    ev.preventDefault();
    var obra = ESTADO.obraSelecionada;
    var msg = document.getElementById('pfCapMsg');
    var btn = document.getElementById('pfCriarCap');
    var numero = document.getElementById('pfNumCap').value;
    var titulo = document.getElementById('pfTitCap').value;
    var arquivos = Array.prototype.slice.call(document.getElementById('pfPaginas').files || []);

    if (numero === '' || isNaN(Number(numero))) { aviso(msg, 'erro', 'Informe o número do capítulo.'); return; }
    if (!arquivos.length) { aviso(msg, 'erro', 'Selecione ao menos uma página.'); return; }

    for (var i = 0; i < arquivos.length; i++) {
      if (!/^image\/(jpeg|png|webp)$/.test(arquivos[i].type)) {
        aviso(msg, 'erro', 'Arquivo inválido: ' + arquivos[i].name + '. Use JPG, PNG ou WebP.');
        return;
      }
      if (arquivos[i].size > 5 * 1024 * 1024) {
        aviso(msg, 'erro', 'A imagem ' + arquivos[i].name + ' passa de 5 MB.');
        return;
      }
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    aviso(msg, 'aviso', 'Criando capítulo...');

    try {
      var resCap = await inserirAdaptativo('chapters', {
        work_id: obra.id,
        number: Number(numero),
        title: titulo || null
      });
      if (resCap.error) {
        aviso(msg, 'erro', 'Não foi possível criar o capítulo: ' + textoErro(resCap.error));
        return;
      }
      var cap = resCap.data && resCap.data[0];
      if (!cap) { aviso(msg, 'erro', 'O capítulo foi criado, mas o servidor não retornou o registro.'); return; }

      var enviadas = 0;
      for (var n = 0; n < arquivos.length; n++) {
        var f = arquivos[n];
        var ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        var caminho = obra.id + '/' + cap.id + '/' + String(n + 1).padStart(3, '0') + '.' + ext;
        var up = await sb().storage.from('pages').upload(caminho, f, { contentType: f.type, upsert: true });
        if (up.error) {
          aviso(msg, 'erro', 'Página ' + (n + 1) + ' falhou: ' + textoErro(up.error));
          break;
        }
        var pub = sb().storage.from('pages').getPublicUrl(caminho);
        var url = pub && pub.data ? pub.data.publicUrl : caminho;
        var ok = await inserirPagina(cap.id, n + 1, url);
        if (!ok.ok) {
          aviso(msg, 'erro', 'Falha ao registrar a página ' + (n + 1) + ': ' + textoErro(ok.error));
          break;
        }
        enviadas++;
      }

      if (enviadas === arquivos.length) {
        aviso(msg, 'ok', 'Capítulo criado com ' + enviadas + ' página(s).');
        if (window.mostrarToast) mostrarToast('Capítulo publicado.', 'sucesso');
        document.getElementById('pfFormCapitulo').reset();
        carregarCapitulosCoop(obra.id);
      }
    } catch (e) {
      aviso(msg, 'erro', 'Erro inesperado: ' + textoErro(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar capítulo e enviar páginas'; }
    }
  }

  async function inserirPagina(chapterId, numero, url) {
    var candidatos = [
      { chapter_id: chapterId, page_number: numero, image_url: url },
      { chapter_id: chapterId, page_number: numero, url: url },
      { chapter_id: chapterId, number: numero, image_url: url },
      { chapter_id: chapterId, page_number: numero, image: url },
      { chapter_id: chapterId, page_number: numero, path: url }
    ];
    var ultimo = null;
    for (var i = 0; i < candidatos.length; i++) {
      var r = await sb().from('pages').insert(candidatos[i]);
      if (!r.error) return { ok: true };
      ultimo = r.error;
      if (!colunaDesconhecida(r.error)) break;
    }
    return { ok: false, error: ultimo };
  }

  /* ------------------------------------------------------------------ */
  /* Suporte (usuário)                                                  */
  /* ------------------------------------------------------------------ */

  PF.abrirSuporte = async function () {
    if (!ESTADO.carregado) await PF.carregarSessao();
    var el = overlay();
    el.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    document.getElementById('pfTitulo').textContent = 'Suporte SolitudeScan';

    montarAbas([
      { id: 'abrir', rotulo: 'Abrir chamado', acao: function () { suporteForm(); } },
      { id: 'meus', rotulo: 'Meus chamados', acao: function () { suporteMeus(); } }
    ], 'abrir');
    suporteForm();
  };

  function suporteForm() {
    corpo().innerHTML =
      '<div class="plat-grid">' +
        '<div class="plat-card"><h3>Antes de abrir um chamado</h3>' +
        '<p>Verifique se o problema já aparece nos termos e na política de privacidade. Para conteúdo irregular, use a denúncia — ela tem prioridade de moderação.</p></div>' +
        '<div class="plat-card"><h3>Prazo de resposta</h3><p>Chamados são respondidos em até 3 dias úteis. Pagamentos e segurança têm prioridade.</p></div>' +
      '</div>' +
      '<form class="plat-form" id="pfFormSuporte" style="margin-top:18px" novalidate>' +
        '<div class="plat-field"><label for="pfSupCat">Categoria *</label>' +
          '<select class="plat-select" id="pfSupCat">' +
            [['conta', 'Conta e acesso'], ['pagamento', 'Pagamento e assinatura'], ['conteudo', 'Conteúdo e leitura'],
             ['publicacao', 'Publicação de obras'], ['tecnico', 'Erro técnico'], ['privacidade', 'Privacidade e dados'],
             ['outro', 'Outro assunto']].map(function (p) {
              return '<option value="' + p[0] + '">' + p[1] + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="plat-field"><label for="pfSupAssunto">Assunto *</label>' +
          '<input class="plat-input" id="pfSupAssunto" maxlength="140" required></div>' +
        '<div class="plat-field"><label for="pfSupMsg">Descreva o problema *</label>' +
          '<textarea class="plat-textarea" id="pfSupMsg" maxlength="4000" required></textarea>' +
          '<span class="plat-hint">Inclua o que você fez, o que esperava e o que aconteceu. Não envie senhas.</span></div>' +
        '<div class="plat-actions"><button type="submit" class="plat-btn plat-btn--primary" id="pfEnviarSup">Abrir chamado</button></div>' +
        '<div id="pfSupMsgBox" class="plat-alert" style="display:none"></div>' +
      '</form>';

    document.getElementById('pfFormSuporte').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var box = document.getElementById('pfSupMsgBox');
      var btn = document.getElementById('pfEnviarSup');
      var assunto = document.getElementById('pfSupAssunto').value.trim();
      var mensagem = document.getElementById('pfSupMsg').value.trim();

      if (!ESTADO.usuario) { aviso(box, 'erro', 'Entre na sua conta para abrir um chamado.'); return; }
      if (assunto.length < 5) { aviso(box, 'erro', 'Escreva um assunto com pelo menos 5 caracteres.'); return; }
      if (mensagem.length < 20) { aviso(box, 'erro', 'Descreva o problema com pelo menos 20 caracteres.'); return; }

      btn.disabled = true;
      aviso(box, 'aviso', 'Enviando chamado...');
      var res = await inserirAdaptativo('support_tickets', {
        user_id: ESTADO.usuario.id,
        category: document.getElementById('pfSupCat').value,
        subject: assunto,
        message: mensagem,
        status: 'aberto'
      });
      btn.disabled = false;

      if (res.error) {
        aviso(box, 'erro', 'Não foi possível abrir o chamado: ' + textoErro(res.error) +
          (/relation|does not exist/i.test(textoErro(res.error)) ? ' A tabela de suporte precisa da migração da plataforma.' : ''));
        return;
      }
      var t = res.data && res.data[0];
      aviso(box, 'ok', 'Chamado aberto' + (t && t.protocol ? ' — protocolo ' + t.protocol : '') + '. Acompanhe em “Meus chamados”.');
      document.getElementById('pfFormSuporte').reset();
      suporteMeus();
    });
  }

  async function suporteMeus() {
    corpo().innerHTML = '<div class="plat-empty">Carregando seus chamados...</div>';
    if (!ESTADO.usuario) { corpo().innerHTML = '<div class="plat-empty">Entre na sua conta para ver seus chamados.</div>'; return; }

    var res = await sb().from('support_tickets').select('*').eq('user_id', ESTADO.usuario.id).order('created_at', { ascending: false }).limit(50);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar seus chamados: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var lista = res.data || [];
    if (!lista.length) { corpo().innerHTML = '<div class="plat-empty">Você ainda não abriu chamados.</div>'; return; }

    corpo().innerHTML = '<div class="plat-list">' + lista.map(function (t) {
      var st = t.status || 'aberto';
      var cls = st === 'resolvido' || st === 'encerrado' ? 'plat-badge--ok' : st === 'aberto' ? 'plat-badge--warn' : '';
      return '<div class="plat-row"><div><h4>' + esc(t.subject) + ' <span class="plat-badge ' + cls + '">' + esc(st) + '</span></h4>' +
        '<p>Protocolo ' + esc(t.protocol || '—') + ' · ' + esc(t.category) + ' · ' + esc(dataCurta(t.created_at)) + '</p>' +
        '<p>' + esc(String(t.message || '').slice(0, 200)) + '</p></div></div>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Denúncia                                                           */
  /* ------------------------------------------------------------------ */

  PF.abrirDenuncia = async function (obraId) {
    if (!ESTADO.carregado) await PF.carregarSessao();
    var el = overlay();
    el.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    document.getElementById('pfTitulo').textContent = 'Denunciar conteúdo';
    document.getElementById('pfTabs').innerHTML = '';

    corpo().innerHTML =
      '<form class="plat-form" id="pfFormDenuncia" novalidate>' +
        '<div class="plat-card"><p>Denúncias são analisadas pela moderação. Informe o motivo com precisão: ' +
        'direitos autorais, conteúdo ilegal, assédio, spam ou informações falsas. Denúncias falsas podem ser penalizadas.</p></div>' +
        '<div class="plat-field"><label for="pfDenMotivo">Tipo de problema *</label>' +
          '<select class="plat-select" id="pfDenMotivo">' +
            [['direitos_autorais', 'Violação de direitos autorais'], ['conteudo_ilegal', 'Conteúdo ilegal'],
             ['assedio', 'Assédio ou discurso de ódio'], ['spam', 'Spam ou fraude'],
             ['classificacao', 'Classificação indicativa incorreta'], ['outro', 'Outro']].map(function (p) {
              return '<option value="' + p[0] + '">' + p[1] + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="plat-field"><label for="pfDenObra">Obra ou capítulo</label>' +
          '<input class="plat-input" id="pfDenObra" maxlength="140" value="' + esc(obraId || '') + '" placeholder="Título ou link"></div>' +
        '<div class="plat-field"><label for="pfDenDesc">Descrição *</label>' +
          '<textarea class="plat-textarea" id="pfDenDesc" maxlength="3000" required></textarea></div>' +
        '<div class="plat-actions"><button type="submit" class="plat-btn plat-btn--primary" id="pfEnviarDen">Enviar denúncia</button></div>' +
        '<div id="pfDenMsg" class="plat-alert" style="display:none"></div>' +
      '</form>';

    document.getElementById('pfFormDenuncia').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var box = document.getElementById('pfDenMsg');
      var desc = document.getElementById('pfDenDesc').value.trim();
      var btn = document.getElementById('pfEnviarDen');
      if (!ESTADO.usuario) { aviso(box, 'erro', 'Entre na sua conta para denunciar.'); return; }
      if (desc.length < 20) { aviso(box, 'erro', 'Descreva o problema com pelo menos 20 caracteres.'); return; }

      btn.disabled = true;
      aviso(box, 'aviso', 'Registrando denúncia...');
      var res = await inserirAdaptativo('reports', {
        user_id: ESTADO.usuario.id,
        work_id: ehUuid(obraId) ? obraId : null,
        reason: document.getElementById('pfDenMotivo').value,
        details: desc,
        status: 'pendente'
      });
      btn.disabled = false;
      if (res.error) { aviso(box, 'erro', 'Não foi possível registrar: ' + textoErro(res.error)); return; }
      aviso(box, 'ok', 'Denúncia registrada. Nossa equipe vai analisar.');
      if (window.mostrarToast) mostrarToast('Denúncia registrada.', 'sucesso');
      document.getElementById('pfFormDenuncia').reset();
    });
  };

  function ehUuid(v) {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }

  /* ------------------------------------------------------------------ */
  /* Notificações completas                                             */
  /* ------------------------------------------------------------------ */

  PF.abrirNotificacoes = async function (filtro) {
    if (!ESTADO.carregado) await PF.carregarSessao();
    var el = overlay();
    el.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    document.getElementById('pfTitulo').textContent = 'Notificações';
    document.getElementById('pfTabs').innerHTML = '';

    if (!ESTADO.usuario) {
      corpo().innerHTML = '<div class="plat-empty">Entre na sua conta para ver suas notificações.</div>';
      return;
    }

    var res = await sb().from('notifications').select('*').eq('user_id', ESTADO.usuario.id).order('created_at', { ascending: false }).limit(100);
    if (res.error) {
      corpo().innerHTML = '<div class="plat-alert plat-alert--erro">Não foi possível carregar: ' + esc(textoErro(res.error)) + '</div>';
      return;
    }
    var lista = res.data || [];
    var naoLidas = lista.filter(function (n) { return !n.is_read; }).length;
    var filtroAtual = filtro || 'todas';

    var categorias = {};
    lista.forEach(function (n) { categorias[n.type || 'sistema'] = true; });

    corpo().innerHTML =
      '<div class="plat-toolbar">' +
        '<div class="plat-chips">' +
          '<button type="button" class="plat-chip" aria-pressed="' + (filtroAtual === 'todas') + '" data-filtro="todas">Todas (' + lista.length + ')</button>' +
          '<button type="button" class="plat-chip" aria-pressed="false" data-filtro="nao_lidas">Não lidas (' + naoLidas + ')</button>' +
          Object.keys(categorias).map(function (c) {
            return '<button type="button" class="plat-chip" aria-pressed="' + (filtroAtual === c) + '" data-filtro="' + esc(c) + '">' + esc(TIPOS_NOTIF[c] || c) + '</button>';
          }).join('') +
        '</div>' +
        '<button type="button" class="plat-btn" id="pfLerTodas">Marcar todas como lidas</button>' +
      '</div>' +
      '<div class="plat-list" id="pfNotifLista"></div>';

    function render() {
      var visiveis = lista.filter(function (n) {
        if (filtroAtual === 'todas') return true;
        if (filtroAtual === 'nao_lidas') return !n.is_read;
        return (n.type || 'sistema') === filtroAtual;
      });
      var alvo = document.getElementById('pfNotifLista');
      if (!visiveis.length) { alvo.innerHTML = '<div class="plat-empty">Nenhuma notificação nesta categoria.</div>'; return; }
      alvo.innerHTML = visiveis.map(function (n) {
        return '<div class="plat-notif ' + (n.is_read ? '' : 'nao-lida') + '" data-id="' + esc(n.id) + '">' +
          '<div class="plat-notif-body"><p>' + esc(n.message) + '</p>' +
          '<small>' + esc(TIPOS_NOTIF[n.type] || n.type || 'Sistema') + ' · ' + esc(dataCurta(n.created_at)) + '</small></div>' +
          '<div class="plat-actions">' +
            (n.is_read ? '' : '<button type="button" class="plat-btn" data-lida="' + esc(n.id) + '">Lida</button>') +
            (n.link || n.work_id ? '<button type="button" class="plat-btn" data-abrir="' + esc(n.id) + '">Abrir</button>' : '') +
            '<button type="button" class="plat-btn plat-btn--danger" data-excluir="' + esc(n.id) + '">Excluir</button>' +
          '</div></div>';
      }).join('');

      alvo.querySelectorAll('[data-lida]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var id = b.getAttribute('data-lida');
          var r = await sb().from('notifications').update({ is_read: true }).eq('id', id);
          if (r.error) { if (window.mostrarToast) mostrarToast('Falha: ' + textoErro(r.error), 'erro'); return; }
          var n = lista.find(function (x) { return String(x.id) === id; });
          if (n) n.is_read = true;
          if (window.carregarNotificacoes) carregarNotificacoes();
          PF.abrirNotificacoes(filtroAtual);
        });
      });

      alvo.querySelectorAll('[data-excluir]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var id = b.getAttribute('data-excluir');
          var r = await sb().from('notifications').delete().eq('id', id);
          if (r.error) { if (window.mostrarToast) mostrarToast('Falha ao excluir: ' + textoErro(r.error), 'erro'); return; }
          lista = lista.filter(function (x) { return String(x.id) !== id; });
          if (window.carregarNotificacoes) carregarNotificacoes();
          render();
        });
      });

      alvo.querySelectorAll('[data-abrir]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-abrir');
          var n = lista.find(function (x) { return String(x.id) === id; });
          if (!n) return;
          PF.fecharPainel();
          if (n.link) {
            try {
              var url = new URL(n.link, window.location.origin);
              if (url.origin === window.location.origin) { window.location.href = url.href; return; }
            } catch (e) { /* link inválido */ }
          }
          if (n.work_id && window.abrirDetalhesObra) abrirDetalhesObra(n.work_id);
        });
      });
    }

    corpo().querySelectorAll('[data-filtro]').forEach(function (c) {
      c.addEventListener('click', function () { PF.abrirNotificacoes(c.getAttribute('data-filtro')); });
    });

    var lerTodas = document.getElementById('pfLerTodas');
    if (lerTodas) {
      lerTodas.addEventListener('click', async function () {
        lerTodas.disabled = true;
        var r = await sb().from('notifications').update({ is_read: true }).eq('user_id', ESTADO.usuario.id).eq('is_read', false);
        lerTodas.disabled = false;
        if (r.error) { if (window.mostrarToast) mostrarToast('Falha: ' + textoErro(r.error), 'erro'); return; }
        lista.forEach(function (n) { n.is_read = true; });
        if (window.carregarNotificacoes) carregarNotificacoes();
        PF.abrirNotificacoes(filtroAtual);
      });
    }

    render();
  };

  /* ------------------------------------------------------------------ */
  /* Progresso de leitura persistente                                   */
  /* ------------------------------------------------------------------ */

  PF.registrarProgresso = async function (obraId, capituloId, pagina, total, numeroCap) {
    if (!obraId || !ESTADO.usuario) return { ok: false, motivo: 'sem_sessao' };
    var pag = Math.max(1, Number(pagina) || 1);
    var tot = Number(total) || null;
    var pct = tot ? Math.min(100, Math.round((pag / tot) * 10000) / 100) : 0;

    var payload = {
      user_id: ESTADO.usuario.id,
      work_id: obraId,
      chapter_id: ehUuid(capituloId) ? capituloId : null,
      page: pag,
      total_pages: tot,
      percent: pct,
      chapter_number: numeroCap ? String(numeroCap) : null,
      updated_at: new Date().toISOString()
    };

    var res = await sb().from('reading_progress')
      .upsert(payload, { onConflict: 'user_id,work_id' })
      .select();

    if (res.error) {
      // Não apaga o progresso local: o histórico do app continua como apoio.
      console.warn('[Plataforma] Progresso não sincronizado:', res.error.message);
      return { ok: false, error: res.error };
    }
    return { ok: true, data: res.data };
  };

  PF.obterProgresso = async function (obraId) {
    if (!obraId || !ESTADO.usuario) return null;
    var res = await sb().from('reading_progress').select('*')
      .eq('user_id', ESTADO.usuario.id).eq('work_id', obraId).maybeSingle();
    if (res.error) return null;
    return res.data;
  };

  function extrairLeituraAtual(obraId) {
    var L = (window.AppState && AppState.leitor) || {};
    var cap = L.capituloId || L.chapterId || L.capitulo || null;
    var pag = L.pagina || L.page || L.currentPage || 1;
    var tot = L.totalPaginas || L.totalPages || L.total || null;
    var num = L.numeroCapitulo || L.chapterNumber || null;
    return { obraId: obraId, capituloId: cap, pagina: pag, total: tot, numero: num };
  }

  function engancharProgresso() {
    if (typeof window.salvarNoHistorico === 'function' && !window.salvarNoHistorico.__pf) {
      var orig = window.salvarNoHistorico;
      window.salvarNoHistorico = function (obraId) {
        var r = orig.apply(this, arguments);
        try {
          var d = extrairLeituraAtual(obraId);
          PF.registrarProgresso(d.obraId, d.capituloId, d.pagina, d.total, d.numero);
        } catch (e) { /* nunca bloqueia a leitura */ }
        return r;
      };
      window.salvarNoHistorico.__pf = true;
    }

    if (typeof window.atualizarProgressoLeitor === 'function' && !window.atualizarProgressoLeitor.__pf) {
      var orig2 = window.atualizarProgressoLeitor;
      window.atualizarProgressoLeitor = function () {
        var r = orig2.apply(this, arguments);
        try {
          if (ESTADO.timerProgresso) clearTimeout(ESTADO.timerProgresso);
          ESTADO.timerProgresso = setTimeout(function () {
            var L = (window.AppState && AppState.leitor) || {};
            var obraId = L.obraId || L.workId || null;
            if (!obraId) return;
            var d = extrairLeituraAtual(obraId);
            PF.registrarProgresso(d.obraId, d.capituloId, d.pagina, d.total, d.numero);
          }, 2500);
        } catch (e) { /* silencioso */ }
        return r;
      };
      window.atualizarProgressoLeitor.__pf = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ligações com a interface existente                                 */
  /* ------------------------------------------------------------------ */

  function melhorarDropdownNotificacoes() {
    var drop = document.getElementById('notifDropdown');
    if (!drop || drop.querySelector('#pfVerTodas')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'pfVerTodas';
    b.className = 'plat-btn';
    b.style.cssText = 'width:100%;margin:8px 0 0';
    b.textContent = 'Ver todas as notificações';
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      PF.abrirNotificacoes();
    });
    drop.appendChild(b);
  }

  function delegarAcoes() {
    document.addEventListener('click', function (ev) {
      var alvo = ev.target.closest ? ev.target.closest('[data-pf-acao]') : null;
      if (!alvo) return;
      var acao = alvo.getAttribute('data-pf-acao');
      if (acao === 'painel') { ev.preventDefault(); PF.abrirPainel(); }
      if (acao === 'suporte') { ev.preventDefault(); PF.abrirSuporte(); }
      if (acao === 'notificacoes') { ev.preventDefault(); PF.abrirNotificacoes(); }
      if (acao === 'denunciar') { ev.preventDefault(); PF.abrirDenuncia(alvo.getAttribute('data-obra') || null); }
      if (acao === 'fechar') { ev.preventDefault(); PF.fecharPainel(); }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') PF.fecharPainel();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                      */
  /* ------------------------------------------------------------------ */

  PF.init = async function () {
    delegarAcoes();
    try {
      await PF.carregarSessao();
    } catch (e) {
      console.warn('[Plataforma] Não foi possível carregar a sessão:', e);
    }
    injetarNavegacao();
    atualizarBarraEmail();
    engancharProgresso();
    melhorarDropdownNotificacoes();

    if (sb()) {
      sb().auth.onAuthStateChange(function () {
        setTimeout(async function () {
          await PF.carregarSessao();
          injetarNavegacao();
          atualizarBarraEmail();
          var nav = document.getElementById('pfNavPainel');
          if (nav && !PF.ehStaff()) nav.remove();
        }, 400);
      });
    }

    // Revalida a confirmação ao voltar para a aba (usuário clicou no link).
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && ESTADO.usuario) PF.verificarEmail();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', PF.init);
  } else {
    PF.init();
  }
})();
