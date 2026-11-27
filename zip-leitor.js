/* SolitudeScan — leitor de ZIP/CBZ
 * Extrai imagens de arquivos .zip/.cbz sem dependências externas.
 * Usa DecompressionStream('deflate-raw') do navegador (ou do Node >= 18).
 * Exporta global (window.ZipLeitor) e também module.exports para testes.
 */
(function (raiz) {
  'use strict';

  var ASSINATURA_EOCD = 0x06054b50;
  var ASSINATURA_CENTRAL = 0x02014b50;

  function ehImagem(nome) {
    return /\.(jpe?g|png|webp|gif|avif)$/i.test(nome || '');
  }

  /* Ordena "2.jpg" antes de "10.jpg" — ordem natural, não alfabética. */
  function ordenarNatural(a, b) {
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  function encontrarEocd(buf) {
    var dv = new DataView(buf);
    var inicio = Math.max(0, buf.byteLength - 65557);
    for (var i = buf.byteLength - 22; i >= inicio; i--) {
      if (dv.getUint32(i, true) === ASSINATURA_EOCD) return i;
    }
    return -1;
  }

  function listar(buf) {
    if (!buf || buf.byteLength < 22) throw new Error('Arquivo ZIP vazio ou inválido.');
    var dv = new DataView(buf);
    var eocd = encontrarEocd(buf);
    if (eocd < 0) throw new Error('ZIP inválido: diretório central não encontrado.');

    var total = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var lista = [];

    for (var n = 0; n < total; n++) {
      if (off + 46 > buf.byteLength || dv.getUint32(off, true) !== ASSINATURA_CENTRAL) break;
      var metodo = dv.getUint16(off + 10, true);
      var compSize = dv.getUint32(off + 20, true);
      var uncompSize = dv.getUint32(off + 24, true);
      var nameLen = dv.getUint16(off + 28, true);
      var extraLen = dv.getUint16(off + 30, true);
      var commentLen = dv.getUint16(off + 32, true);
      var localOff = dv.getUint32(off + 42, true);
      var nome = new TextDecoder('utf-8').decode(new Uint8Array(buf, off + 46, nameLen));
      if (nome && nome.charAt(nome.length - 1) !== '/') {
        lista.push({ nome: nome, metodo: metodo, compSize: compSize, uncompSize: uncompSize, localOff: localOff });
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    if (!lista.length) throw new Error('ZIP sem arquivos.');
    return lista;
  }

  async function extrairEntrada(buf, ent) {
    var dv = new DataView(buf);
    if (ent.localOff + 30 > buf.byteLength) throw new Error('Entrada corrompida: ' + ent.nome);
    var nameLen = dv.getUint16(ent.localOff + 26, true);
    var extraLen = dv.getUint16(ent.localOff + 28, true);
    var inicio = ent.localOff + 30 + nameLen + extraLen;
    if (inicio + ent.compSize > buf.byteLength) throw new Error('Dados truncados: ' + ent.nome);

    var dados = new Uint8Array(buf, inicio, ent.compSize);
    if (ent.metodo === 0) return new Uint8Array(dados);
    if (ent.metodo === 8) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('Este navegador não suporta descompactar ZIP. Envie as imagens ou um PDF.');
      }
      var fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(fluxo).arrayBuffer());
    }
    throw new Error('Método de compressão não suportado (' + ent.metodo + ') em ' + ent.nome);
  }

  async function lerZip(buf, opcoes) {
    var opts = opcoes || {};
    var todas = listar(buf);
    var alvos = todas.filter(function (e) { return ehImagem(e.nome); });
    if (!alvos.length) throw new Error('O ZIP não contém imagens (JPG, PNG ou WebP).');
    alvos.sort(function (a, b) { return ordenarNatural(a.nome, b.nome); });
    if (opts.maxPaginas && alvos.length > opts.maxPaginas) alvos = alvos.slice(0, opts.maxPaginas);

    var saida = [];
    for (var i = 0; i < alvos.length; i++) {
      var dados = await extrairEntrada(buf, alvos[i]);
      var ext = (alvos[i].nome.split('.').pop() || 'jpg').toLowerCase();
      var tipo = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif' : ext === 'avif' ? 'image/avif' : 'image/jpeg';
      saida.push({ nome: alvos[i].nome, blob: new Blob([dados], { type: tipo }) });
      if (opts.onProgresso) opts.onProgresso(i + 1, alvos.length);
    }
    return saida;
  }

  var api = { lerZip: lerZip, listar: listar, extrairEntrada: extrairEntrada, ordenarNatural: ordenarNatural, ehImagem: ehImagem };
  raiz.ZipLeitor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
