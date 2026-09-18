import fs from 'fs'

const files = [
  'src/renderer/src/i18n/en.ts',
  'src/renderer/src/i18n/tr.ts',
  'src/renderer/src/i18n/tr.d.ts'
]

let allGood = true
const PRB = '\n'
for (const f of files) {
  const buf = fs.readFileSync(f)
  // Varlık doğrulaması: expected byte dizileri
  const hasTombstone = s => {
    // ö = C3 B6, ü = C3 BC, nöbet
    const NÖB = Buffer.from('nöbet', 'utf8')
    const NÖ = Buffer.from('ö', 'utf8')
    return {
      nöbetIncorrect: buf.includes(Buffer.from('n\u00C3\u00B6', 'latin1')) === false && !buf.includes(NÖB),
      öSingleC3B6: countOcc(buf, NÖ)
    }
  }
  // mojibake kırıntıları: Ã¶ (0xC3 0x83 0xC2 0xB6), Ã¼, vb — düz metin olarak aranır
  const mojiPatterns = [
    Buffer.from('Ã¶', 'latin1'),   // Ã¶  -> C3 83 C2 B6
    Buffer.from('Ã¼', 'latin1'),   // Ã¼
    Buffer.from('Ã§', 'latin1'),   // Ã§
    Buffer.from('Ã®', 'latin1'),   // Ã®
    Buffer.from('Ã', 'latin1'),    // saf Ã yüksek bayt
    Buffer.from('Å\u017E', 'latin1') // Å¾ vs (ş mojibake)
  ]
  let mojiCount = 0
  for (const m of mojiPatterns) mojiCount += countOcc(buf, m)
  const s = fs.readFileSync(f, 'utf8')
  const öCount = (s.match(/ö/g) || []).length
  const üCount = (s.match(/ü/g) || []).length
  const ÅCount = (s.match(/Ã/g) || []).length
  const hasHdr = s.includes('flexible breaks ─')
  const hasNöbet = /nöbet/i.test(s)
  const ok = mojiCount === 0 && !hasHdr
  if (!ok) allGood = false
  console.log(PRB + `== ${f} ==`)
  console.log(`  UTF-8 bayt olarak doğru 'ö': ${öCount} kez | 'ü': ${üCount} kez`)
  console.log(`  mojibake ayıklayıcı: 'Ã' karakteri ${ÅCount} adet | sahte-flex başlık: ${hasHdr}`)
  console.log(`  'nöbet' string: ${hasNöbet ? 'OK' : 'YOK/BOZUK'}`)
  console.log(`  SOYUT SONUÇ: ${ok ? 'TEMİZ' : 'HÂLÂ BOZUK'}`)
}
console.log(PRB + `>> TOPLAM: ${allGood ? 'İKİSİ DE TEMİZ ✅' : 'EN AZ BİRİ BOZUK ❌'}`)

function countOcc(hay, needle) {
  let c = 0
  const nb = needle, len = nb.length
  outer:
  for (let i = 0; i <= hay.length - len; i++) {
    for (let j = 0; j < len; j++) if (hay[i + j] !== nb[j]) continue outer
    c++
    i += len - 1
  }
  return c
}
