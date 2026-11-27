/* Sonda de teste do leitor ZIP/CBZ: extrai as páginas e devolve JSON. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const Zip = require(path.join(__dirname, '..', 'zip-leitor.js'));

(async () => {
  const buf = fs.readFileSync(process.argv[2]);
  const paginas = await Zip.lerZip(buf, { maxPaginas: 500 });
  const saida = [];
  for (const p of paginas) {
    const ab = await p.blob.arrayBuffer();
    const bytes = Buffer.from(ab);
    saida.push({
      nome: p.nome,
      tipo: p.blob.type,
      bytes: bytes.length,
      sha: crypto.createHash('sha256').update(bytes).digest('hex')
    });
  }
  process.stdout.write(JSON.stringify({ ok: true, paginas: saida }));
})().catch(e => {
  process.stdout.write(JSON.stringify({ ok: false, erro: e.message }));
  process.exit(1);
});
