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
- 2 à 4 mots MAXIMUM
- En MAJUSCULES
- Mémorisable et direct
- Réponds UNIQUEMENT avec le titre, rien d'autre
- Pas de guillemets, pas d'explication, pas de ponctuation
Exemples: INTRO OKR, AGILE BASICS, LEAN THINKING, IMPACT IA, MANAGEMENT VISUEL`,
          messages: [{ role: 'user', content: `Description: ${description}\nTitre:` }]
        })
      });
      const d = await r.json();
      const titre = (d.content?.[0]?.text || 'FORMATION').trim().toUpperCase();
      return res.json({ titre });
    } catch(e) {
      return res.json({ titre: 'FORMATION' });
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

  return res.status(404).json({ error: 'Action inconnue' });
}
