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
      console.log('ANTHROPIC RESPONSE:', JSON.stringify(d));
      const titre = (d.content?.[0]?.text || 'FORMATION').trim().toUpperCase();
      return res.json({ titre });
    } catch(e) {
      console.error('TITLE ERROR:', e.message, e);
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
      const { createCanvas, loadImage } = await import('canvas');
      const W = 400, H = 225;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');

      // Background image
      const bg = await loadImage(process.cwd() + '/backgrounds/Background.png');
      ctx.drawImage(bg, 0, 0, W, H);

      // Logo accueil (coin haut droite)
      if (accueilFile) {
        const acc = await loadImage(process.cwd() + '/accueil/' + accueilFile);
        ctx.drawImage(acc, W-47, 0, 47, 47);
      }

      // Icone (gauche)
      if (iconeFile) {
        const ico = await loadImage(process.cwd() + '/icons/' + iconeFile);
        ctx.drawImage(ico, 0, 0, W*0.38, H);
      }

      // Titre
      ctx.fillStyle = '#272727';
      ctx.textAlign = 'right';
      ctx.font = 'bold 36px sans-serif';
      const maxW = W * 0.4;
      const words = (titre||'').split(' ');
      let lines = [], line = '';
      for (const w of words) {
        const test = line ? line+' '+w : w;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line); line = w;
        } else { line = test; }
      }
      if (line) lines.push(line);
      const lineH = 40;
      const totalH = lines.length * lineH;
      let y = H/2 - totalH/2 + lineH;
      for (const l of lines) { ctx.fillText(l, W-12, y); y += lineH; }

      // Catégorie
      ctx.font = '10px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText((categorie||'').toUpperCase(), W-12, H*0.78);

      // Logo fournisseur
      if (fournisseurFile) {
        const fourn = await loadImage(process.cwd() + '/fournisseur/' + fournisseurFile);
        const fh = 11;
        const fw = fourn.width * fh / fourn.height;
        ctx.drawImage(fourn, W-fw-8, H-fh-8, fw, fh);
      }

      const pngBase64 = canvas.toBuffer('image/png').toString('base64');
      return res.json({ titre, pngBase64 });
    } catch(e) {
      console.error('PNG ERROR:', e);
      return res.json({ error: e.message });
    }
  }

  return res.status(404).json({ error: 'Action inconnue' });
}
