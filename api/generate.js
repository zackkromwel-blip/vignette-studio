export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── TITLE ──────────────────────────────────────────────────────────────────
  if (action === 'title' && req.method === 'POST') {
    const { description } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 60,
          system: `Tu génères des titres courts et percutants pour des vignettes de catalogue de formation.
RÈGLES STRICTES:
- 25 CARACTÈRES MAXIMUM (espaces inclus)
- 2 à 3 mots maximum
- En MAJUSCULES
- Mémorisable et direct
- Réponds UNIQUEMENT avec le titre, rien d'autre
- Pas de guillemets, pas d'explication, pas de ponctuation
Exemples: INTRO OKR, AGILE BASICS, LEAN THINKING, IMPACT IA`,
          messages: [{ role: 'user', content: `Description: ${description}\nTitre:` }]
        })
      });
      const d = await r.json();
      const titre = (d.content?.[0]?.text || 'FORMATION').trim().toUpperCase();
      return res.json({ titre });
    } catch(e) {
      return res.json({ titre: 'FORMATION', error: e.message });
    }
  }

  // ── SUGGEST ICON ───────────────────────────────────────────────────────────
  if (action === 'suggest-icon' && req.method === 'POST') {
    const { titre, description, availableIcons } = req.body;
    try {
      const list = availableIcons.join(', ');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 30,
          system: `Choisis l'icône la plus pertinente. Réponds UNIQUEMENT avec le nom exact.\nIcones disponibles: ${list}`,
          messages: [{ role: 'user', content: `Titre: ${titre}\nDescription: ${description}` }]
        })
      });
      const d = await r.json();
      const suggested = (d.content?.[0]?.text || '').trim();
      return res.json({ suggested });
    } catch(e) {
      return res.json({ suggested: '' });
    }
  }

  // ── PNG ────────────────────────────────────────────────────────────────────
  if (action === 'png' && req.method === 'POST') {
    const { titre, categorie, iconeFile, fournisseurFile, accueilFile } = req.body;
    try {
      const sharp = (await import('sharp')).default;
      const fs = (await import('fs')).default;
      const path = (await import('path')).default;
      const base = process.cwd();
      const W = 400, H = 225;

      const bgBuf = fs.readFileSync(path.join(base, 'backgrounds/Background.png'));
      let composite = [];

      if (iconeFile) {
        const icoBuf = fs.readFileSync(path.join(base, 'icons', iconeFile));
        const icoResized = await sharp(icoBuf).resize(Math.round(W*0.38), H, {fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
        composite.push({ input: icoResized, top: 0, left: 0 });
      }

      if (accueilFile) {
        const accBuf = fs.readFileSync(path.join(base, 'accueil', accueilFile));
        const accResized = await sharp(accBuf).resize(47, 47, {fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
        composite.push({ input: accResized, top: 0, left: W-47 });
      }

      if (fournisseurFile) {
        const foBuf = fs.readFileSync(path.join(base, 'fournisseur', fournisseurFile));
        const foResized = await sharp(foBuf).resize(null, 22, {fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
        const foMeta = await sharp(foResized).metadata();
        composite.push({ input: foResized, top: H-22-8, left: W-(foMeta.width||60)-8 });
      }

      const finalBuf = await sharp(bgBuf).resize(W, H).composite(composite).png().toBuffer();
      const pngBase64 = finalBuf.toString('base64');
      return res.json({ titre, pngBase64 });
    } catch(e) {
      console.error('PNG ERROR:', e);
      return res.json({ error: e.message });
    }
  }

  return res.status(404).json({ error: 'Action inconnue' });
}
