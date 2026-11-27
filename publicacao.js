/* SolitudeScan — Publicação de capítulos
 * Entrada: PDF, ZIP/CBZ ou imagens. Pré-visualização, reordenação, remoção,
 * rascunho e publicação real no Supabase Storage + tabelas chapters/pages.
 * Nada é simulado: cada página enviada é confirmada pelo servidor.
 */
(function () {
  'use strict';

  var LIM = {
    imagem: 8 * 1024 * 1024,
    pdf: 60 * 1024 * 1024,
    zip: 150 * 1024 * 1024,
    maxPaginas: 400,
    larguraMax: 1600
  };

  var EST = { obraId: null, obras: [], paginas: [], processando: false, enviando: false };

  function pf() { return window.PF || {}; }
  function cliente() { var P = pf(); return P.sb ? P.sb() : null; }
  function usuario() { var P = pf(); return P.usuarioAtual ? P.usuarioAtual() : null; }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtBytes(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function el(id) { return document.getElementById(id); }

  function mensagem(tipo, texto) {
    var box = el('pubMsg');
    if (!box) return;
    box.hidden = false;
    box.className = 'pub-msg pub-msg--' + tipo;
    box.textContent = texto;
  }

  function progresso(texto, pct) {
    var wrap = el('pubProgresso');
    var barra = el('pubBarra');
    var rotulo = el('pubProgressoTxt');
    if (!wrap) return;
    if (texto === null) { wrap.hidden = true; return; }
    wrap.hidden = false;
    rotulo.textContent = texto;
    barra.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
  }

  /* ------------------------------------------------------------------ */
  /* Interface                                                          */
  /* ------------------------------------------------------------------ */

  function montar() {
    if (el('pubOverlay')) return;
    var div = document.createElement('div');
    div.className = 'pub-overlay';
    div.id = 'pubOverlay';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-labelledby', 'pubTitulo');
    div.innerHTML =
      '<div class="pub-modal">' +
        '<header class="pub-head">' +
          '<div><h2 id="pubTitulo">Publicar capítulo</h2>' +
          '<p class="pub-sub">PDF, ZIP/CBZ ou imagens — as páginas são convertidas e enviadas ao armazenamento.</p></div>' +
          '<button type="button" class="pub-x" id="pubFechar" aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="pub-body">' +
          '<div class="pub-grid3">' +
            '<label class="pub-field"><span>Obra</span><select class="pub-input" id="pubObra"></select></label>' +
            '<label class="pub-field"><span>Número do capítulo</span><input class="pub-input" id="pubNumero" type="number" min="0" step="0.1" inputmode="decimal"></label>' +
            '<label class="pub-field"><span>Título (opcional)</span><input class="pub-input" id="pubTituloCap" maxlength="120"></label>' +
          '</div>' +
          '<div class="pub-drop" id="pubDrop">' +
            '<input type="file" id="pubArquivos" multiple accept=".pdf,.zip,.cbz,image/jpeg,image/png,image/webp" hidden>' +
            '<p class="pub-drop-titulo">Arraste os arquivos aqui</p>' +
            '<button type="button" class="pub-btn" id="pubEscolher">Escolher arquivos</button>' +
            '<p class="pub-hint">PDF até 60 MB · ZIP/CBZ até 150 MB · imagens até 8 MB · máximo ' + LIM.maxPaginas + ' páginas</p>' +
          '</div>' +
          '<div class="pub-progresso" id="pubProgresso" hidden>' +
            '<span id="pubProgressoTxt">Processando…</span>' +
            '<div class="pub-barra"><i id="pubBarra"></i></div>' +
          '</div>' +
          '<div class="pub-grade" id="pubGrade"></div>' +
          '<div class="pub-msg" id="pubMsg" hidden role="status"></div>' +
        '</div>' +
        '<footer class="pub-foot">' +
          '<button type="button" class="pub-btn" id="pubRascunho">Salvar rascunho</button>' +
          '<button type="button" class="pub-btn pub-btn--primary" id="pubPublicar">Publicar capítulo</button>' +
        '</footer>' +
      '</div>';
    document.body.appendChild(div);

    el('pubFechar').addEventListener('click', fechar);
    div.addEventListener('click', function (ev) { if (ev.target === div) fechar(); });
    el('pubEscolher').addEventListener('click', function () { el('pubArquivos').click(); });
    el('pubArquivos').addEventListener('change', function (ev) {
      adicionar(ev.target.files);
      ev.target.value = '';
    });
    el('pubPublicar').addEventListener('click', function () { publicar(false); });
    el('pubRascunho').addEventListener('click', function () { publicar(true); });

    var drop = el('pubDrop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('pub-drop--ativo'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('pub-drop--ativo'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) adicionar(e.dataTransfer.files);
    });

    el('pubGrade').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pub-acao]');
      if (!b) return;
      var i = Number(b.getAttribute('data-i'));
      var acao = b.getAttribute('data-pub-acao');
      if (acao === 'remover') remover(i);
      else if (acao === 'esq') mover(i, -1);
      else if (acao === 'dir') mover(i, 1);
    });
  }

  async function carregarObras() {
    var sb = cliente();
    var sel = el('pubObra');
    if (!sb || !sel) return;
    sel.innerHTML = '<option value="">Carregando…</option>';
    var r = await sb.from('works').select('id, title').order('title', { ascending: true }).limit(500);
    if (r.error) {
      sel.innerHTML = '<option value="">Erro ao carregar obras</option>';
      mensagem('erro', 'Não foi possível listar suas obras: ' + (r.error.message || 'erro desconhecido'));
      return;
    }
    EST.obras = r.data || [];
    if (!EST.obras.length) {
      sel.innerHTML = '<option value="">Nenhuma obra disponível</option>';
      mensagem('aviso', 'Nenhuma obra encontrada para o seu perfil. Cadastre uma obra primeiro.');
      return;
    }
    sel.innerHTML = '<option value="">Selecione a obra</option>' + EST.obras.map(function (o) {
      return '<option value="' + esc(o.id) + '">' + esc(o.title || 'Sem título') + '</option>';
    }).join('');
    if (EST.obraId) sel.value = EST.obraId;
  }

  function abrir(obraId) {
    if (!pf().ehStaff || !pf().ehStaff()) {
      if (window.mostrarToast) window.mostrarToast('A publicação é restrita a administradores e cooperadores.', 'erro');
      return;
    }
    montar();
    var ov = el('pubOverlay');
    ov.classList.add('pub-overlay--aberto');
    document.body.style.overflow = 'hidden';
    EST.obraId = obraId || null;
    carregarObras();
    renderGrade();
    setTimeout(function () { el('pubNumero').focus(); }, 120);
  }

  function fechar() {
    var ov = el('pubOverlay');
    if (ov) ov.classList.remove('pub-overlay--aberto');
    document.body.style.overflow = '';
  }

  /* ------------------------------------------------------------------ */
  /* Entrada de arquivos                                                */
  /* ------------------------------------------------------------------ */

  function carregarScript(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { falha(new Error('Não foi possível carregar ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function pdfLib() {
    if (window.pdfjsLib) return window.pdfjsLib;
    var base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    await carregarScript(base + 'pdf.min.js');
    if (!window.pdfjsLib) throw new Error('Biblioteca de PDF indisponível.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }

  async function pdfParaImagens(file, onProg) {
    var lib = await pdfLib();
    var doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    if (doc.numPages > LIM.maxPaginas) {
      throw new Error('O PDF tem ' + doc.numPages + ' páginas e o limite é ' + LIM.maxPaginas + '.');
    }
    var saida = [];
    for (var i = 1; i <= doc.numPages; i++) {
      var page = await doc.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var escala = Math.min(3, LIM.larguraMax / base.width);
      var vp = page.getViewport({ scale: escala });
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      var blob = await new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', 0.9); });
      if (!blob) throw new Error('Falha ao converter a página ' + i + ' do PDF.');
      saida.push({ nome: 'pagina-' + String(i).padStart(3, '0') + '.jpg', blob: blob });
      canvas.width = canvas.height = 0;
      onProg(i, doc.numPages);
    }
    return saida;
  }

  function imagemValida(blob) {
    return new Promise(function (ok) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img.naturalWidth > 0 && img.naturalHeight > 0); };
      img.onerror = function () { URL.revokeObjectURL(url); ok(false); };
      img.src = url;
    });
  }

  async function adicionar(fileList) {
    if (EST.processando) { mensagem('aviso', 'Aguarde o processamento atual terminar.'); return; }
    var arquivos = Array.prototype.slice.call(fileList || []);
    if (!arquivos.length) return;

    EST.processando = true;
    var entraram = 0, falhas = [];

    try {
      for (var i = 0; i < arquivos.length; i++) {
        var f = arquivos[i];
        var nome = (f.name || '').toLowerCase();
        var tipo = (f.type || '').toLowerCase();

        if (EST.paginas.length >= LIM.maxPaginas) {
          falhas.push(nome + ': limite de ' + LIM.maxPaginas + ' páginas atingido');
          break;
        }

        try {
          if (tipo === 'application/pdf' || /\.pdf$/.test(nome)) {
            if (f.size > LIM.pdf) throw new Error('PDF acima de ' + fmtBytes(LIM.pdf));
            progresso('Convertendo ' + f.name + '…', 2);
            var paginasPdf = await pdfParaImagens(f, function (n, total) {
              progresso('Convertendo PDF — página ' + n + ' de ' + total, Math.round((n / total) * 100));
            });
            EST.paginas = EST.paginas.concat(paginasPdf);
            entraram += paginasPdf.length;

          } else if (/\.(zip|cbz)$/.test(nome) || tipo === 'application/zip' || tipo === 'application/x-cbz') {
            if (f.size > LIM.zip) throw new Error('Arquivo acima de ' + fmtBytes(LIM.zip));
            if (!window.ZipLeitor) throw new Error('Leitor de ZIP não carregado.');
            progresso('Lendo ' + f.name + '…', 2);
            var imagens = await window.ZipLeitor.lerZip(await f.arrayBuffer(), {
              maxPaginas: LIM.maxPaginas - EST.paginas.length,
              onProgresso: function (n, total) {
                progresso('Extraindo ' + f.name + ' — ' + n + ' de ' + total, Math.round((n / total) * 100));
              }
            });
            EST.paginas = EST.paginas.concat(imagens);
            entraram += imagens.length;

          } else if (/^image\//.test(tipo) || /\.(jpe?g|png|webp)$/.test(nome)) {
            if (f.size > LIM.imagem) throw new Error('imagem acima de ' + fmtBytes(LIM.imagem));
            if (!(await imagemValida(f))) throw new Error('imagem corrompida ou ilegível');
            EST.paginas.push({ nome: f.name, blob: f });
            entraram++;

          } else {
            falhas.push(f.name + ': formato não suportado (use PDF, ZIP/CBZ, JPG, PNG ou WebP)');
          }
        } catch (e) {
          falhas.push(f.name + ': ' + (e.message || 'falha ao processar'));
        }
      }
    } finally {
      EST.processando = false;
      progresso(null);
      renderGrade();
    }

    if (falhas.length) {
      mensagem('erro', falhas.length + ' arquivo(s) não entraram — ' + falhas.slice(0, 3).join('; '));
    } else if (entraram) {
      mensagem('ok', entraram + ' página(s) adicionada(s). Confira a ordem antes de publicar.');
    }
  }

  function renderGrade() {
    var grade = el('pubGrade');
    if (!grade) return;
    if (!EST.paginas.length) {
      grade.innerHTML = '<p class="pub-vazio">Nenhuma página adicionada ainda.</p>';
      return;
    }
    var total = EST.paginas.reduce(function (s, p) { return s + (p.blob.size || 0); }, 0);
    grade.innerHTML =
      '<div class="pub-grade-head"><span>' + EST.paginas.length + ' página(s) · ' + fmtBytes(total) + '</span>' +
      '<button type="button" class="pub-link" id="pubLimpar">Remover todas</button></div>' +
      '<div class="pub-thumbs">' + EST.paginas.map(function (p, i) {
        var url = URL.createObjectURL(p.blob);
        return '<figure class="pub-thumb">' +
          '<img src="' + url + '" alt="Página ' + (i + 1) + '" loading="lazy">' +
          '<figcaption>' + (i + 1) + '</figcaption>' +
          '<div class="pub-thumb-acoes">' +
            '<button type="button" data-pub-acao="esq" data-i="' + i + '" aria-label="Mover página ' + (i + 1) + ' para a esquerda"' + (i === 0 ? ' disabled' : '') + '>&larr;</button>' +
            '<button type="button" data-pub-acao="dir" data-i="' + i + '" aria-label="Mover página ' + (i + 1) + ' para a direita"' + (i === EST.paginas.length - 1 ? ' disabled' : '') + '>&rarr;</button>' +
            '<button type="button" data-pub-acao="remover" data-i="' + i + '" aria-label="Remover página ' + (i + 1) + '">&times;</button>' +
          '</div>' +
        '</figure>';
      }).join('') + '</div>';

    var limpar = el('pubLimpar');
    if (limpar) limpar.addEventListener('click', function () {
      EST.paginas = [];
      renderGrade();
      mensagem('aviso', 'Todas as páginas foram removidas.');
    });
  }

  function mover(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= EST.paginas.length) return;
    var tmp = EST.paginas[i];
    EST.paginas[i] = EST.paginas[j];
    EST.paginas[j] = tmp;
    renderGrade();
  }

  function remover(i) {
    if (i < 0 || i >= EST.paginas.length) return;
    EST.paginas.splice(i, 1);
    renderGrade();
  }

  /* ------------------------------------------------------------------ */
  /* Publicação                                                         */
  /* ------------------------------------------------------------------ */

  function colunaDesconhecida(err) {
    var m = (err && (err.message || err.details || '')) || '';
    return /column .* does not exist|Could not find the .* column|schema cache/i.test(m);
  }

  async function criarCapitulo(obraId, numero, titulo, rascunho) {
    var sb = cliente();
    var base = { work_id: obraId, number: numero, title: titulo || null };
    var tentativas = [];
    if (rascunho) {
      tentativas.push(Object.assign({}, base, { is_published: false }));
      tentativas.push(Object.assign({}, base, { status: 'rascunho' }));
    } else {
      tentativas.push(Object.assign({}, base, { is_published: true }));
      tentativas.push(Object.assign({}, base, { status: 'publicado' }));
    }
    tentativas.push(base);

    var ultimo = null;
    for (var i = 0; i < tentativas.length; i++) {
      var r = await sb.from('chapters').insert(tentativas[i]).select();
      if (!r.error) return { ok: true, capitulo: (r.data && r.data[0]) || null };
      ultimo = r.error;
      if (!colunaDesconhecida(r.error)) break;
    }
    return { ok: false, error: ultimo };
  }

  async function inserirPagina(chapterId, numero, url) {
    var sb = cliente();
    var candidatos = [
      { chapter_id: chapterId, page_number: numero, image_url: url },
      { chapter_id: chapterId, page_number: numero, url: url },
      { chapter_id: chapterId, number: numero, image_url: url },
      { chapter_id: chapterId, page_number: numero, image: url },
      { chapter_id: chapterId, page_number: numero, path: url }
    ];
    var ultimo = null;
    for (var i = 0; i < candidatos.length; i++) {
      var r = await sb.from('pages').insert(candidatos[i]);
      if (!r.error) return { ok: true };
      ultimo = r.error;
      if (!colunaDesconhecida(r.error)) break;
    }
    return { ok: false, error: ultimo };
  }

  async function publicar(rascunho) {
    if (EST.enviando) return;
    var sb = cliente();
    if (!sb) { mensagem('erro', 'Sessão não disponível. Entre novamente na sua conta.'); return; }

    var obraId = el('pubObra') ? el('pubObra').value : '';
    var numeroTxt = el('pubNumero') ? el('pubNumero').value : '';
    var titulo = el('pubTituloCap') ? el('pubTituloCap').value.trim() : '';

    if (!obraId) { mensagem('erro', 'Selecione a obra.'); return; }
    if (numeroTxt === '' || isNaN(Number(numeroTxt)) || Number(numeroTxt) < 0) {
      mensagem('erro', 'Informe um número de capítulo válido.');
      return;
    }
    if (!EST.paginas.length) { mensagem('erro', 'Adicione ao menos uma página.'); return; }

    EST.enviando = true;
    var btnPub = el('pubPublicar'), btnRas = el('pubRascunho');
    if (btnPub) btnPub.disabled = true;
    if (btnRas) btnRas.disabled = true;
    mensagem('aviso', rascunho ? 'Salvando rascunho…' : 'Publicando capítulo…');

    try {
      progresso('Criando capítulo…', 1);
      var res = await criarCapitulo(obraId, Number(numeroTxt), titulo, !!rascunho);
      if (!res.ok) {
        mensagem('erro', 'Não foi possível criar o capítulo: ' + ((res.error && (res.error.message || res.error.details)) || 'erro desconhecido'));
        return;
      }
      var cap = res.capitulo;
      if (!cap || !cap.id) { mensagem('erro', 'O capítulo foi criado, mas o servidor não retornou o registro.'); return; }

      var enviadas = 0;
      for (var i = 0; i < EST.paginas.length; i++) {
        var p = EST.paginas[i];
        var ext = (p.blob.type || '').indexOf('png') >= 0 ? 'png' : (p.blob.type || '').indexOf('webp') >= 0 ? 'webp' : 'jpg';
        var caminho = obraId + '/' + cap.id + '/' + String(i + 1).padStart(3, '0') + '.' + ext;
        progresso('Enviando página ' + (i + 1) + ' de ' + EST.paginas.length, Math.round(((i + 1) / EST.paginas.length) * 100));

        var up = await sb.storage.from('pages').upload(caminho, p.blob, {
          contentType: p.blob.type || 'image/jpeg',
          upsert: true,
          cacheControl: '31536000'
        });
        if (up.error) {
          mensagem('erro', 'A página ' + (i + 1) + ' falhou no envio: ' + (up.error.message || 'erro'));
          break;
        }
        var pub = sb.storage.from('pages').getPublicUrl(caminho);
        var url = pub && pub.data ? pub.data.publicUrl : caminho;
        var reg = await inserirPagina(cap.id, i + 1, url);
        if (!reg.ok) {
          mensagem('erro', 'Falha ao registrar a página ' + (i + 1) + ': ' + ((reg.error && reg.error.message) || 'erro'));
          break;
        }
        enviadas++;
      }

      if (enviadas === EST.paginas.length) {
        mensagem('ok', (rascunho ? 'Rascunho salvo' : 'Capítulo publicado') + ' com ' + enviadas + ' página(s).');
        if (window.mostrarToast) {
          window.mostrarToast(rascunho ? 'Rascunho salvo.' : 'Capítulo publicado.', 'sucesso');
        }
        EST.paginas = [];
        renderGrade();
        if (el('pubNumero')) el('pubNumero').value = '';
        if (el('pubTituloCap')) el('pubTituloCap').value = '';
        document.dispatchEvent(new CustomEvent('ss:capitulo-publicado', { detail: { obraId: obraId, capituloId: cap.id } }));
      } else {
        mensagem('erro', 'O capítulo ' + numeroTxt + ' foi criado, mas apenas ' + enviadas + ' de ' +
          EST.paginas.length + ' páginas foram enviadas. Reenvie as páginas restantes antes de liberar a leitura.');
      }
    } catch (e) {
      mensagem('erro', 'Erro inesperado: ' + (e.message || e));
    } finally {
      EST.enviando = false;
      progresso(null);
      if (btnPub) btnPub.disabled = false;
      if (btnRas) btnRas.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Integração com o painel                                            */
  /* ------------------------------------------------------------------ */

  function injetarBotaoPainel() {
    var alvo = document.querySelector('.plat-abas') || document.querySelector('.plat-painel') || document.querySelector('#pfCorpo');
    if (!alvo || alvo.querySelector('.pub-abrir-painel')) return;
    if (!pf().ehStaff || !pf().ehStaff()) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pub-btn pub-abrir-painel';
    b.textContent = 'Publicar capítulo (PDF/ZIP)';
    b.addEventListener('click', function () { abrir(null); });
    alvo.appendChild(b);
  }

  function engancharPainel() {
    var P = window.PF;
    if (!P || !P.abrirPainel || P.__pubHook) return;
    var original = P.abrirPainel;
    P.abrirPainel = function () {
      var r = original.apply(this, arguments);
      setTimeout(injetarBotaoPainel, 350);
      return r;
    };
    P.__pubHook = true;
  }

  window.PUB = { abrir: abrir, fechar: fechar };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(engancharPainel, 600); });
  } else {
    setTimeout(engancharPainel, 600);
  }
})();
