/* ==========================================================================
   SolitudeScan — pesquisa, filtros e catálogo
   Toda a listagem vem da tabela public.works do Supabase (respeitando RLS).
   Não existe obra, capítulo ou estatística fictícia neste módulo.
   ========================================================================== */
(function () {
  'use strict';

  var TIPOS = ['Mangá', 'Manhwa', 'Manhua', 'Webtoon'];
  var DEMOGRAFIAS = ['Shounen', 'Shoujo', 'Seinen', 'Josei'];
  var CHAVE_RECENTES = 'solitude_buscas_recentes';
  var POR_PAGINA = 12;
  var CAPA_FALLBACK = 'data:image/svg+xml,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'><rect width='300' height='450' fill='#1a0f1e'/><text x='150' y='225' fill='#ec4899' text-anchor='middle' font-size='14' font-family='sans-serif'>SolitudeScan</text></svg>"
  );

  var sugestaoAtiva = -1;
  var iniciado = false;

  /* ---------------------------------------------------------------- apoio */

  function esc(texto) {
    if (typeof escaparHtml === 'function') return escaparHtml(texto == null ? '' : texto);
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function numero(valor) {
    if (typeof formatarNumero === 'function') return formatarNumero(valor);
    var n = Number(valor) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' mi';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + ' mil';
    return String(n);
  }

  function capaSegura(url) {
    if (typeof sanitizarUrlImagem === 'function') return sanitizarUrlImagem(url, CAPA_FALLBACK);
    return url ? String(url) : CAPA_FALLBACK;
  }

  function estado() {
    var c = AppState.catalogo;
    if (!Array.isArray(c.generosSelecionados)) c.generosSelecionados = [];
    if (!Array.isArray(c.generosDisponiveis)) c.generosDisponiveis = [];
    if (typeof c.termoBusca !== 'string') c.termoBusca = '';
    if (!c.tipoAtual) c.tipoAtual = 'Todos';
    if (!c.demografiaAtual) c.demografiaAtual = 'Todas';
    if (!c.statusFiltro) c.statusFiltro = 'Todos';
    if (!c.ordemFiltro) c.ordemFiltro = 'atualizados';
    if (typeof c.apenasAdultos !== 'boolean') c.apenasAdultos = false;
    if (!Number.isFinite(c.pagina) || c.pagina < 1) c.pagina = 1;
    if (!('erro' in c)) c.erro = null;
    if (typeof c.carregando !== 'boolean') c.carregando = false;
    return c;
  }

  /* --------------------------------------------------------- carga de dados */

  function mapearObra(obra) {
    var generos = (obra.genres || []).map(function (g) {
      return g && g.genres ? g.genres.name : (g ? g.name : null);
    }).filter(Boolean);

    var alternativo = obra.alternative_title || obra.alternative_titles || '';
    if (Array.isArray(alternativo)) alternativo = alternativo.join(' / ');

    var tags = obra.tags;
    if (typeof tags === 'string') tags = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    if (!Array.isArray(tags)) tags = [];

    return {
      id: obra.id,
      titulo: obra.title || 'Sem título',
      tituloAlternativo: alternativo || '',
      capa: obra.cover_url || CAPA_FALLBACK,
      autor: obra.author || '',
      artista: obra.artist || obra.author || '',
      status: obra.status || 'Em Lançamento',
      generos: generos,
      tags: tags,
      demografia: obra.demographic || '',
      sinopse: obra.synopsis || '',
      tipo: obra.type || 'Manhwa',
      visualizacoes: Number(obra.views) || 0,
      curtidas: Number(obra.likes_count) || 0,
      avaliacao: Number(obra.rating_avg != null ? obra.rating_avg : obra.rating) || 0,
      totalAvaliacoes: Number(obra.rating_count) || 0,
      totalCapitulos: (obra.chapters && obra.chapters[0] && obra.chapters[0].count) || 0,
      atualizadoEm: obra.updated_at,
      criadoEm: obra.created_at,
      exclusivo: !!obra.is_vip,
      adulto: !!obra.is_adult,
      destaque: !!obra.is_featured
    };
  }

  async function carregarGenerosDisponiveis(cliente) {
    var c = estado();
    var nomes = new Set();
    (c.obrasRemotas || []).forEach(function (obra) {
      (obra.generos || []).forEach(function (g) { nomes.add(g); });
    });
    try {
      var resposta = await cliente.from('genres').select('name').order('name', { ascending: true });
      if (!resposta.error) {
        (resposta.data || []).forEach(function (linha) {
          if (linha && linha.name) nomes.add(linha.name);
        });
      }
    } catch (erro) {
      console.warn('[SolitudeScan] Não foi possível carregar a lista de gêneros:', erro && erro.message);
    }
    c.generosDisponiveis = [...nomes].sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }

  async function carregarObras() {
    var c = estado();
    var cliente = AppState.supabase;
    if (c.carregando) return;
    if (!cliente) {
      c.erro = 'sem-conexao';
      popularFiltrosCatalogo();
      renderizarCatalogo();
      return;
    }
    c.carregando = true;
    try {
      var base = '*, genres:work_genres(genres(name)), chapters(count)';
      var completo = 'alternative_title, alternative_titles, tags, demographic, ' + base;
      var resposta = await cliente.from('works').select(completo).order('updated_at', { ascending: false });
      if (resposta.error) {
        /* O banco ainda pode não ter as colunas opcionais: mantém o catálogo funcional. */
        resposta = await cliente.from('works').select(base).order('updated_at', { ascending: false });
      }
      if (resposta.error) throw resposta.error;

      c.obrasRemotas = (resposta.data || []).map(mapearObra);
      c.erro = null;
      if (typeof aplicarOverridesLocais === 'function') aplicarOverridesLocais();
      await carregarGenerosDisponiveis(cliente);
      popularFiltrosCatalogo();
      renderizarCatalogo();

      ['renderizarHeroBanner', 'renderizarTendencias', 'renderizarRanking', 'renderizarGeneros', 'renderizarContinueLendo']
        .forEach(function (nome) {
          if (typeof window[nome] === 'function') {
            try { window[nome](); } catch (e) { console.warn('[SolitudeScan] ' + nome + ' falhou:', e); }
          }
        });
    } catch (erro) {
      console.error('[SolitudeScan] Erro ao carregar o catálogo:', erro);
      c.erro = 'falha';
      popularFiltrosCatalogo();
      renderizarCatalogo();
    } finally {
      c.carregando = false;
    }
  }

  /* --------------------------------------------------------------- filtros */

  function termosDaObra(obra) {
    var partes = [
      obra.titulo, obra.tituloAlternativo, obra.autor, obra.artista,
      obra.sinopse, obra.tipo, obra.status, obra.demografia
    ].concat(obra.generos || [], obra.tags || []);
    return normalizar(partes.filter(Boolean).join(' | '));
  }

  function obterObrasFiltradas() {
    var c = estado();
    var obras = (c.obrasRemotas || []).slice();

    if (!AppState.usuario.isAdmin && !c.apenasAdultos) {
      obras = obras.filter(function (o) { return !o.adulto; });
    }
    if (c.tipoAtual !== 'Todos') {
      var tipo = normalizar(c.tipoAtual);
      obras = obras.filter(function (o) { return normalizar(o.tipo) === tipo; });
    }
    if (c.statusFiltro !== 'Todos') {
      obras = obras.filter(function (o) { return o.status === c.statusFiltro; });
    }
    if (c.demografiaAtual !== 'Todas') {
      var demo = normalizar(c.demografiaAtual);
      obras = obras.filter(function (o) { return normalizar(o.demografia) === demo; });
    }
    if (c.generosSelecionados.length) {
      var alvos = c.generosSelecionados.map(normalizar);
      obras = obras.filter(function (o) {
        var doObra = (o.generos || []).map(normalizar);
        return alvos.every(function (alvo) { return doObra.indexOf(alvo) !== -1; });
      });
    }

    var termo = normalizar(c.termoBusca);
    if (termo) {
      var palavras = termo.split(' ').filter(Boolean);
      obras = obras.filter(function (o) {
        var alvo = termosDaObra(o);
        return palavras.every(function (palavra) { return alvo.indexOf(palavra) !== -1; });
      });
    }

    var data = function (valor) { var t = new Date(valor || 0).getTime(); return isNaN(t) ? 0 : t; };
    switch (c.ordemFiltro) {
      case 'recentes':
        obras.sort(function (a, b) { return data(b.criadoEm) - data(a.criadoEm); });
        break;
      case 'populares':
        obras.sort(function (a, b) { return b.visualizacoes - a.visualizacoes; });
        break;
      case 'avaliados':
        obras.sort(function (a, b) { return b.avaliacao - a.avaliacao || b.totalAvaliacoes - a.totalAvaliacoes; });
        break;
      case 'titulo':
        obras.sort(function (a, b) { return a.titulo.localeCompare(b.titulo, 'pt-BR'); });
        break;
      case 'capitulos':
        obras.sort(function (a, b) { return b.totalCapitulos - a.totalCapitulos; });
        break;
      default:
        obras.sort(function (a, b) { return data(b.atualizadoEm) - data(a.atualizadoEm); });
    }
    return obras;
  }

  function filtrosAtivos() {
    var c = estado();
    var ativos = [];
    if (c.termoBusca) ativos.push({ chave: 'termo', rotulo: 'Busca: ' + c.termoBusca });
    if (c.tipoAtual !== 'Todos') ativos.push({ chave: 'tipo', rotulo: c.tipoAtual });
    if (c.statusFiltro !== 'Todos') ativos.push({ chave: 'status', rotulo: c.statusFiltro });
    if (c.demografiaAtual !== 'Todas') ativos.push({ chave: 'demografia', rotulo: c.demografiaAtual });
    c.generosSelecionados.forEach(function (g) { ativos.push({ chave: 'genero', valor: g, rotulo: g }); });
    if (c.apenasAdultos) ativos.push({ chave: 'adulto', rotulo: 'Conteúdo +18' });
    return ativos;
  }

  /* ------------------------------------------------------------- renderização */

  function ssCard(obra) {
    var generos = (obra.generos || []).slice(0, 2).map(function (g) {
      return '<span class="genre-tag">' + esc(g) + '</span>';
    }).join('');
    var selos = '';
    if (obra.exclusivo) selos += '<span class="exclusive-badge">Exclusivo</span>';
    if (obra.adulto) selos += '<span class="adult-badge">+18</span>';
    var statusClasse = 'status-' + normalizar(obra.status).replace(/\s+/g, '-');
    var id = esc(obra.id);
    var capitulos = obra.totalCapitulos
      ? '<span class="chapter-count">' + obra.totalCapitulos + ' cap.</span>'
      : '<span class="chapter-count">Sem capítulos</span>';
    var avaliacao = obra.avaliacao
      ? '<span class="manga-rating">' + obra.avaliacao.toFixed(1) + '</span>'
      : '<span class="manga-rating manga-rating-vazio">Sem nota</span>';
    return '' +
      '<article class="manga-card" data-id="' + id + '" onclick="abrirDetalhesObra(\'' + id + '\')" role="listitem" tabindex="0" aria-label="' + esc(obra.titulo) + '">' +
        '<div class="manga-cover">' +
          '<img src="' + esc(capaSegura(obra.capa)) + '" alt="Capa de ' + esc(obra.titulo) + '" loading="lazy" decoding="async">' +
          selos +
          '<div class="manga-overlay">' + capitulos +
            '<span class="view-count">' + numero(obra.visualizacoes) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="manga-info">' +
          '<h3 class="manga-title">' + esc(obra.titulo) + '</h3>' +
          '<div class="manga-meta">' +
            '<span class="manga-status ' + statusClasse + '">' + esc(obra.status) + '</span>' +
            avaliacao +
          '</div>' +
          '<div class="manga-genres">' + generos + '</div>' +
        '</div>' +
      '</article>';
  }

  function estadoVazio(titulo, texto, comLimpar) {
    return '<div class="empty-state">' +
      '<p class="empty-title">' + esc(titulo) + '</p>' +
      '<p class="empty-text">' + esc(texto) + '</p>' +
      (comLimpar ? '<button type="button" class="btn-secondary" onclick="limparFiltros()">Limpar filtros</button>' : '') +
      '</div>';
  }

  function atualizarContagem(total, exibidos) {
    var alvo = document.getElementById('catalogResultCount');
    if (!alvo) return;
    var c = estado();
    if (!(c.obrasRemotas || []).length) {
      alvo.textContent = '';
      return;
    }
    if (!total) {
      alvo.textContent = 'Nenhuma obra corresponde aos filtros aplicados.';
      return;
    }
    var rotulo = total === 1 ? '1 obra encontrada' : total + ' obras encontradas';
    if (exibidos < total) rotulo += ' — exibindo ' + exibidos;
    alvo.textContent = rotulo;
  }

  function renderizarCatalogo() {
    var c = estado();
    var container = document.getElementById('mangaContainer');
    if (!container) return;

    var filtradas = obterObrasFiltradas();
    var visiveis = filtradas.slice(0, c.pagina * POR_PAGINA);

    atualizarContagem(filtradas.length, visiveis.length);
    renderizarFiltrosAtivos();

    if (c.erro === 'sem-conexao') {
      container.innerHTML = estadoVazio('Catálogo indisponível', 'Não foi possível conectar ao banco de dados. Verifique a conexão e recarregue a página.', false);
    } else if (c.erro === 'falha') {
      container.innerHTML = estadoVazio('Não foi possível carregar o catálogo', 'Ocorreu uma falha ao consultar as obras. Tente recarregar a página.', false);
    } else if (!(c.obrasRemotas || []).length) {
      container.innerHTML = estadoVazio(
        'O acervo ainda está vazio',
        'Nenhuma obra publicada até o momento. Assim que a equipe publicar o primeiro título, ele aparece aqui automaticamente.',
        false
      );
    } else if (!filtradas.length) {
      container.innerHTML = estadoVazio(
        'Nenhuma obra encontrada',
        c.termoBusca
          ? 'Não encontramos resultados para "' + c.termoBusca + '". Ajuste os termos ou remova os filtros.'
          : 'Nenhuma obra corresponde à combinação de filtros selecionada.',
        true
      );
    } else {
      container.innerHTML = visiveis.map(ssCard).join('');
    }

    var botao = document.getElementById('btnCarregarMais');
    if (botao) botao.hidden = visiveis.length >= filtradas.length || !filtradas.length;
  }

  function renderizarFiltrosAtivos() {
    var alvo = document.getElementById('filtrosAtivos');
    if (!alvo) return;
    var ativos = filtrosAtivos();
    if (!ativos.length) {
      alvo.innerHTML = '';
      alvo.hidden = true;
      return;
    }
    alvo.hidden = false;
    alvo.innerHTML = ativos.map(function (item) {
      var valor = item.valor ? ' data-valor="' + esc(item.valor) + '"' : '';
      return '<button type="button" class="active-filter" data-chave="' + esc(item.chave) + '"' + valor + ' onclick="removerFiltro(this.dataset.chave, this.dataset.valor)">' +
        '<span>' + esc(item.rotulo) + '</span><span class="active-filter-x" aria-hidden="true">×</span>' +
        '<span class="sr-only">Remover filtro</span></button>';
    }).join('');
  }

  function popularFiltrosCatalogo() {
    var c = estado();
    renderizarChips('tipoChips', TIPOS, c.tipoAtual, 'definirTipoFiltro');
    renderizarChips('demografiaChips', DEMOGRAFIAS, c.demografiaAtual, 'definirDemografiaFiltro');
    renderizarChips('generoChips', c.generosDisponiveis, null, 'alternarGeneroFiltro', c.generosSelecionados);

    var status = document.getElementById('statusFiltro');
    if (status) status.value = c.statusFiltro;
    var ordem = document.getElementById('ordemFiltro');
    if (ordem) ordem.value = c.ordemFiltro;
    var adulto = document.getElementById('adultoFiltro');
    if (adulto) adulto.checked = c.apenasAdultos;
  }

  function renderizarChips(id, valores, selecionadoUnico, acao, selecionados) {
    var alvo = document.getElementById(id);
    if (!alvo) return;
    var html = '';
    if (selecionadoUnico !== null) {
      html += '<button type="button" class="filter-chip' + (selecionadoUnico === 'Todos' || selecionadoUnico === 'Todas' ? ' is-active' : '') +
        '" onclick="' + acao + '(\'Todos\')" aria-pressed="' + (selecionadoUnico === 'Todos' || selecionadoUnico === 'Todas') + '">Todos</button>';
    }
    html += valores.map(function (valor) {
      var ativo = selecionados ? selecionados.indexOf(valor) !== -1 : valor === selecionadoUnico;
      return '<button type="button" class="filter-chip' + (ativo ? ' is-active' : '') + '" data-valor="' + esc(valor) + '"' +
        ' onclick="' + acao + '(this.dataset.valor)" aria-pressed="' + ativo + '">' + esc(valor) + '</button>';
    }).join('');
    if (!valores.length) {
      html = '<p class="filter-empty">Nenhum gênero cadastrado ainda.</p>';
    }
    alvo.innerHTML = html;
  }

  /* ---------------------------------------------------------------- ações */

  function definirTipoFiltro(valor) {
    var c = estado();
    c.tipoAtual = valor === 'Todos' ? 'Todos' : valor;
    c.pagina = 1;
    popularFiltrosCatalogo();
    renderizarCatalogo();
  }

  function definirDemografiaFiltro(valor) {
    var c = estado();
    c.demografiaAtual = valor === 'Todos' ? 'Todas' : valor;
    c.pagina = 1;
    popularFiltrosCatalogo();
    renderizarCatalogo();
  }

  function alternarGeneroFiltro(valor) {
    var c = estado();
    var indice = c.generosSelecionados.indexOf(valor);
    if (indice === -1) c.generosSelecionados.push(valor);
    else c.generosSelecionados.splice(indice, 1);
    c.pagina = 1;
    popularFiltrosCatalogo();
    renderizarCatalogo();
  }

  function removerFiltro(chave, valor) {
    var c = estado();
    if (chave === 'termo') {
      c.termoBusca = '';
      var input = document.getElementById('searchInput');
      if (input) input.value = '';
      atualizarBotaoLimparBusca();
    } else if (chave === 'tipo') c.tipoAtual = 'Todos';
    else if (chave === 'status') c.statusFiltro = 'Todos';
    else if (chave === 'demografia') c.demografiaAtual = 'Todas';
    else if (chave === 'genero') c.generosSelecionados = c.generosSelecionados.filter(function (g) { return g !== valor; });
    else if (chave === 'adulto') c.apenasAdultos = false;
    c.pagina = 1;
    popularFiltrosCatalogo();
    renderizarCatalogo();
  }

  function limparFiltros() {
    var c = estado();
    c.termoBusca = '';
    c.tipoAtual = 'Todos';
    c.statusFiltro = 'Todos';
    c.demografiaAtual = 'Todas';
    c.generosSelecionados = [];
    c.apenasAdultos = false;
    c.pagina = 1;
    var input = document.getElementById('searchInput');
    if (input) input.value = '';
    atualizarBotaoLimparBusca();
    popularFiltrosCatalogo();
    renderizarCatalogo();
    fecharSugestoes();
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  function carregarMaisResultados() {
    var c = estado();
    c.pagina += 1;
    renderizarCatalogo();
  }

  function focarCatalogo() {
    var home = document.getElementById('tab-home');
    if (home && !home.classList.contains('active') && typeof switchTab === 'function') switchTab('tab-home');
    var grid = document.getElementById('mangaContainer');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var input = document.getElementById('searchInput');
    if (input) setTimeout(function () { input.focus({ preventScroll: true }); }, 300);
  }

  /* ---------------------------------------------------------- sugestões */

  function lerRecentes() {
    try {
      var lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
      return Array.isArray(lista) ? lista.slice(0, 6) : [];
    } catch (e) { return []; }
  }

  function gravarRecente(termo) {
    var limpo = String(termo || '').trim();
    if (limpo.length < 2) return;
    var lista = lerRecentes().filter(function (t) { return normalizar(t) !== normalizar(limpo); });
    lista.unshift(limpo);
    try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista.slice(0, 6))); } catch (e) { /* modo privado */ }
  }

  function limparBuscasRecentes() {
    try { localStorage.removeItem(CHAVE_RECENTES); } catch (e) { /* modo privado */ }
    renderizarSugestoes();
  }

  function usarBuscaRecente(termo) {
    var input = document.getElementById('searchInput');
    if (input) input.value = termo;
    aplicarBusca(termo);
  }

  function sugestoesPara(termo) {
    var c = estado();
    var alvo = normalizar(termo);
    if (!alvo) return [];
    var obras = (c.obrasRemotas || []).filter(function (o) {
      if (!AppState.usuario.isAdmin && !c.apenasAdultos && o.adulto) return false;
      return termosDaObra(o).indexOf(alvo) !== -1;
    });
    return obras.sort(function (a, b) {
      var pa = normalizar(a.titulo).indexOf(alvo) === 0 ? 0 : 1;
      var pb = normalizar(b.titulo).indexOf(alvo) === 0 ? 0 : 1;
      return pa - pb || b.visualizacoes - a.visualizacoes;
    }).slice(0, 6);
  }

  function renderizarSugestoes() {
    var painel = document.getElementById('searchSuggestions');
    var input = document.getElementById('searchInput');
    if (!painel || !input) return;

    var termo = input.value.trim();
    var c = estado();
    var html = '';

    if (termo.length < 2) {
      var recentes = lerRecentes();
      if (recentes.length) {
        html += '<div class="suggest-head"><span>Buscas recentes</span>' +
          '<button type="button" class="suggest-clear" onclick="limparBuscasRecentes()">Limpar</button></div>';
        html += recentes.map(function (t) {
          return '<button type="button" class="suggest-recent" onclick="usarBuscaRecente(this.dataset.termo)" data-termo="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('');
      }
      if (c.generosDisponiveis.length) {
        html += '<div class="suggest-head"><span>Gêneros populares</span></div>';
        html += '<div class="suggest-genres">' + c.generosDisponiveis.slice(0, 8).map(function (g) {
          return '<button type="button" class="suggest-genre" data-genero="' + esc(g) + '" onclick="alternarGeneroFiltro(this.dataset.genero); fecharSugestoes(); focarCatalogo();">' + esc(g) + '</button>';
        }).join('') + '</div>';
      }
      painel.innerHTML = html;
      painel.hidden = !html;
      if (html) painel.classList.add('is-open'); else painel.classList.remove('is-open');
      input.setAttribute('aria-expanded', html ? 'true' : 'false');
      return;
    }

    if (!(c.obrasRemotas || []).length && c.erro) {
      painel.innerHTML = '<div class="suggest-empty">Catálogo indisponível no momento.</div>';
      painel.hidden = false;
      painel.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    var resultados = sugestoesPara(termo);
    if (resultados.length) {
      html += resultados.map(function (obra, indice) {
        return '<button type="button" class="suggest-item" role="option" data-indice="' + indice + '" data-id="' + esc(obra.id) + '"' +
          ' onclick="abrirDetalhesObra(this.dataset.id); fecharSugestoes();">' +
          '<img class="suggest-cover" src="' + esc(capaSegura(obra.capa)) + '" alt="" loading="lazy" decoding="async">' +
          '<span class="suggest-body">' +
            '<span class="suggest-title">' + esc(obra.titulo) + '</span>' +
            '<span class="suggest-meta">' + esc(obra.tipo) + ' · ' + esc(obra.status) +
              (obra.totalCapitulos ? ' · ' + obra.totalCapitulos + ' capítulos' : '') +
              (obra.autor ? ' · ' + esc(obra.autor) : '') +
            '</span>' +
          '</span>' +
        '</button>';
      }).join('');
      html += '<button type="button" class="suggest-all" onclick="abrirPesquisaCompleta()">Ver todos os resultados para "' + esc(termo) + '"</button>';
    } else {
      html += '<div class="suggest-empty">Nenhuma obra encontrada para "' + esc(termo) + '".</div>';
    }
    painel.innerHTML = html;
    painel.hidden = false;
    painel.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
    sugestaoAtiva = -1;
  }

  function fecharSugestoes() {
    var painel = document.getElementById('searchSuggestions');
    var input = document.getElementById('searchInput');
    if (painel) {
      painel.hidden = true;
      painel.classList.remove('is-open');
    }
    if (input) input.setAttribute('aria-expanded', 'false');
    sugestaoAtiva = -1;
  }

  function moverSugestao(passo) {
    var painel = document.getElementById('searchSuggestions');
    if (!painel || painel.hidden) return;
    var itens = painel.querySelectorAll('.suggest-item');
    if (!itens.length) return;
    sugestaoAtiva = (sugestaoAtiva + passo + itens.length) % itens.length;
    itens.forEach(function (item, indice) {
      item.classList.toggle('is-focused', indice === sugestaoAtiva);
    });
    itens[sugestaoAtiva].scrollIntoView({ block: 'nearest' });
  }

  function aplicarBusca(termo) {
    var c = estado();
    c.termoBusca = String(termo || '').trim();
    c.pagina = 1;
    gravarRecente(c.termoBusca);
    fecharSugestoes();
    renderizarCatalogo();
    if (c.termoBusca) {
      var home = document.getElementById('tab-home');
      if (home && !home.classList.contains('active') && typeof switchTab === 'function') switchTab('tab-home');
      var grid = document.getElementById('mangaContainer');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '?q=' + encodeURIComponent(c.termoBusca));
      }
    }
  }

  function abrirPesquisaCompleta() {
    var input = document.getElementById('searchInput');
    aplicarBusca(input ? input.value : '');
  }

  function atualizarBotaoLimparBusca() {
    var botao = document.getElementById('searchClearBtn');
    var input = document.getElementById('searchInput');
    if (!botao || !input) return;
    botao.hidden = !input.value;
  }

  /* ------------------------------------------------------------ inicialização */

  function inicializarBusca() {
    var input = document.getElementById('searchInput');
    if (!input) return;

    var buscar = (typeof debounce === 'function')
      ? debounce(function (valor) {
          var c = estado();
          c.termoBusca = valor;
          c.pagina = 1;
          renderizarCatalogo();
          renderizarSugestoes();
        }, 250)
      : function (valor) {
          var c = estado();
          c.termoBusca = valor;
          c.pagina = 1;
          renderizarCatalogo();
          renderizarSugestoes();
        };

    input.addEventListener('input', function () {
      atualizarBotaoLimparBusca();
      buscar(input.value.trim());
    });

    input.addEventListener('focus', function () {
      renderizarSugestoes();
    });

    input.addEventListener('keydown', function (evento) {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        moverSugestao(1);
      } else if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        moverSugestao(-1);
      } else if (evento.key === 'Enter') {
        evento.preventDefault();
        var painel = document.getElementById('searchSuggestions');
        var itens = painel ? painel.querySelectorAll('.suggest-item') : [];
        if (sugestaoAtiva >= 0 && itens[sugestaoAtiva]) {
          var id = itens[sugestaoAtiva].dataset.id;
          fecharSugestoes();
          if (typeof abrirDetalhesObra === 'function') abrirDetalhesObra(id);
        } else {
          aplicarBusca(input.value);
        }
      } else if (evento.key === 'Escape') {
        if (input.value) {
          input.value = '';
          atualizarBotaoLimparBusca();
          aplicarBusca('');
        } else {
          fecharSugestoes();
          input.blur();
        }
      }
    });

    var limpar = document.getElementById('searchClearBtn');
    if (limpar) {
      limpar.addEventListener('click', function () {
        input.value = '';
        atualizarBotaoLimparBusca();
        aplicarBusca('');
        input.focus();
      });
    }

    var status = document.getElementById('statusFiltro');
    if (status) status.addEventListener('change', function () {
      var c = estado();
      c.statusFiltro = status.value;
      c.pagina = 1;
      renderizarCatalogo();
    });

    var ordem = document.getElementById('ordemFiltro');
    if (ordem) ordem.addEventListener('change', function () {
      var c = estado();
      c.ordemFiltro = ordem.value;
      c.pagina = 1;
      renderizarCatalogo();
    });

    var adulto = document.getElementById('adultoFiltro');
    if (adulto) adulto.addEventListener('change', function () {
      var c = estado();
      c.apenasAdultos = adulto.checked;
      c.pagina = 1;
      renderizarCatalogo();
    });

    document.addEventListener('click', function (evento) {
      var wrapper = evento.target.closest ? evento.target.closest('.nav-search') : null;
      if (!wrapper) fecharSugestoes();
    });

    atualizarBotaoLimparBusca();

    var params = new URLSearchParams(window.location.search);
    var termoInicial = params.get('q');
    if (termoInicial) {
      input.value = termoInicial;
      estado().termoBusca = termoInicial;
      atualizarBotaoLimparBusca();
      renderizarCatalogo();
    }
  }

  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    var c = estado();
    popularFiltrosCatalogo();
    inicializarBusca();
    renderizarCatalogo();
    if (!(c.obrasRemotas || []).length && !c.carregando) carregarObras();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  /* Funções chamadas por HTML e pelo restante do script. */
  window.carregarObras = carregarObras;
  window.renderizarCatalogo = renderizarCatalogo;
  window.inicializarBusca = inicializarBusca;
  window.popularFiltroGeneros = popularFiltrosCatalogo;
  window.popularFiltrosCatalogo = popularFiltrosCatalogo;
  window.limparFiltros = limparFiltros;
  window.carregarMaisResultados = carregarMaisResultados;
  window.focarCatalogo = focarCatalogo;
  window.definirTipoFiltro = definirTipoFiltro;
  window.definirDemografiaFiltro = definirDemografiaFiltro;
  window.alternarGeneroFiltro = alternarGeneroFiltro;
  window.removerFiltro = removerFiltro;
  window.abrirPesquisaCompleta = abrirPesquisaCompleta;
  window.fecharSugestoes = fecharSugestoes;
  window.usarBuscaRecente = usarBuscaRecente;
  window.limparBuscasRecentes = limparBuscasRecentes;
  window.filtrarPorGenero = function (genero) {
    var c = estado();
    c.generosSelecionados = genero && genero !== 'Todos' ? [genero] : [];
    c.pagina = 1;
    popularFiltrosCatalogo();
    renderizarCatalogo();
    focarCatalogo();
  };
  window.obterObrasFiltradas = obterObrasFiltradas;
})();
