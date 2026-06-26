const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const FIGMA_FILE_KEY     = '7xsvRn0LJTmBxOrca29qwh';
const TEMPLATE_FRAME_ID  = '1:711';
const PAGE_ICONES        = 'Iconographies';
const PAGE_FOURNISSEURS  = 'Logos fournisseur de formation';
const PAGE_ACCUEIL       = 'Logo accueil de formation';
const PAGE_TEMPLATE      = 'Template';

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const ZONE_ICONE   = { x: 20,  y: 23,  w: 123, h: 178 };
const ZONE_ACCUEIL = { x: 354, y: 0,   w: 47,  h: 47  };
const COLOR_BLACK  = { r: 0.153, g: 0.153, b: 0.153 };
const COLOR_WHITE  = { r: 0.990, g: 0.990, b: 0.990 };

// ── Helpers Figma REST API ────────────────────────────────────────────────────
async function figmaGet(path) {
  const r = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { 'X-Figma-Token': FIGMA_TOKEN }
  });
  return r.json();
}

async function figmaPost(path, body) {
  const r = await fetch(`https://api.figma.com/v1${path}`, {
    method: 'POST',
    headers: { 'X-Figma-Token': FIGMA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

// ── Get page node IDs ─────────────────────────────────────────────────────────
async function getPageNodes(pageName) {
  const file = await figmaGet(`/files/${FIGMA_FILE_KEY}?depth=2`);
  const page = file.document.children.find(p => p.name === pageName);
  return page ? page.children : [];
}

// ── Generate vignette via Figma Plugin API (via REST variables) ───────────────
async function createVignette({ titre, categorie, iconeId, fournisseurId, accueilId }) {

  // 1. Dupliquer le template
  const dupeRes = await figmaPost(`/files/${FIGMA_FILE_KEY}/nodes`, {
    nodes: [{ id: TEMPLATE_FRAME_ID, type: 'FRAME' }]
  });

  // Utiliser l'API Figma REST pour créer les éléments
  // On passe par l'API de variables et de création de nodes

  const vignetteName = `Vignette - ${titre}`;

  // Créer un nouveau frame en copiant le template
  const createRes = await figmaPost(`/files/${FIGMA_FILE_KEY}/nodes/${TEMPLATE_FRAME_ID}/copies`, {});

  return { vignetteName };
}

// ── Export PNG ────────────────────────────────────────────────────────────────
async function exportNode(nodeId) {
  const res = await figmaGet(
    `/images/${FIGMA_FILE_KEY}?ids=${nodeId}&format=png&scale=2`
  );
  if (res.images && res.images[nodeId]) {
    const imgRes = await fetch(res.images[nodeId]);
    const buffer = await imgRes.buffer();
    return buffer;
  }
  return null;
}

// ── Get icons list ────────────────────────────────────────────────────────────
async function getIcons() {
  const nodes = await getPageNodes(PAGE_ICONES);
  return nodes
    .filter(n => n.name !== 'Calque_1' && n.name !== 'Group')
    .map(n => ({ id: n.id, name: n.name }));
}

// ── Get used icons ────────────────────────────────────────────────────────────
async function getUsedIcons(allIconNames) {
  const nodes = await getPageNodes(PAGE_TEMPLATE);
  const used = new Set();
  for (const frame of nodes) {
    if (frame.id === TEMPLATE_FRAME_ID || frame.type !== 'FRAME') continue;
    if (frame.children) {
      frame.children.forEach(c => {
        if (allIconNames.includes(c.name)) used.add(c.name);
      });
    }
  }
  return [...used];
}

// ── Get icon preview (PNG base64) ─────────────────────────────────────────────
async function getIconPreviews(icons) {
  if (!icons.length) return [];
  const ids = icons.map(i => i.id).join(',');
  const res = await figmaGet(`/images/${FIGMA_FILE_KEY}?ids=${ids}&format=png&scale=2`);
  return icons.map(ic => ({
    ...ic,
    imageUrl: res.images?.[ic.id] || null
  }));
}

// ── Generate title via Claude ─────────────────────────────────────────────────
async function generateTitle(description) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 60,
      system: `Tu génères des titres courts et percutants pour des vignettes de catalogue de formation.
1 à 3 mots maximum, en majuscules, mémorisable et direct.
Réponds UNIQUEMENT avec le titre. Pas de guillemets, pas d'explication.
Exemples: INTRO OKR, AGILE BASICS, LEAN THINKING, IMPACT IA`,
      messages: [{ role: 'user', content: `Description: ${description}\nTitre:` }]
    })
  });
  const d = await r.json();
  return (d.content?.[0]?.text || 'FORMATION').trim().toUpperCase();
}

// ── Suggest icon via Claude ───────────────────────────────────────────────────
async function suggestIcon(titre, description, availableIcons) {
  const list = availableIcons.join(', ');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 30,
      system: `Choisis l'icône la plus pertinente. Réponds UNIQUEMENT avec le nom exact.\nIcones disponibles: ${list}`,
      messages: [{ role: 'user', content: `Titre: ${titre}\nDescription: ${description}` }]
    })
  });
  const d = await r.json();
  return (d.content?.[0]?.text || '').trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {

    // ── GET /api/generate?action=icons ──────────────────────────────────────
    if (action === 'icons') {
      const icons = await getIcons();
      const allNames = icons.map(i => i.name);
      const usedNames = await getUsedIcons(allNames);
      const withPreviews = await getIconPreviews(icons);
      return res.json({
        icons: withPreviews.map(i => ({ ...i, used: usedNames.includes(i.name) }))
      });
    }

    // ── POST /api/generate?action=title ─────────────────────────────────────
    if (action === 'title' && req.method === 'POST') {
      const { description } = req.body;
      const titre = await generateTitle(description);
      return res.json({ titre });
    }

    // ── POST /api/generate?action=suggest-icon ───────────────────────────────
    if (action === 'suggest-icon' && req.method === 'POST') {
      const { titre, description, availableIcons } = req.body;
      const suggested = await suggestIcon(titre, description, availableIcons);
      return res.json({ suggested });
    }

    // ── POST /api/generate?action=vignette ───────────────────────────────────
    if (action === 'vignette' && req.method === 'POST') {
      const { titre, categorie, iconeId, iconeName, fournisseurId, accueilId } = req.body;

      // Récupérer les nodes des pages assets
      const [iconNodes, fournNodes, accueilNodes, templateNodes] = await Promise.all([
        getPageNodes(PAGE_ICONES),
        getPageNodes(PAGE_FOURNISSEURS),
        getPageNodes(PAGE_ACCUEIL),
        getPageNodes(PAGE_TEMPLATE),
      ]);

      const iconNode     = iconNodes.find(n => n.id === iconeId);
      const fournNode    = fournNodes.find(n => n.id === fournisseurId);
      const accueilNode  = accueilNodes.find(n => n.id === accueilId);

      if (!iconNode)    return res.status(400).json({ error: `Icône ${iconeName} introuvable` });
      if (!fournNode)   return res.status(400).json({ error: 'Logo fournisseur introuvable' });
      if (!accueilNode) return res.status(400).json({ error: 'Logo accueil introuvable' });

      // Calculer la position X (à droite de la dernière vignette)
      const templateFrame = templateNodes.find(n => n.id === TEMPLATE_FRAME_ID);
      let maxX = (templateFrame?.absoluteBoundingBox?.x || 0) + 400;
      templateNodes.forEach(n => {
        if (n.type === 'FRAME' && n.id !== TEMPLATE_FRAME_ID) {
          const right = (n.absoluteBoundingBox?.x || 0) + (n.absoluteBoundingBox?.width || 0);
          if (right > maxX) maxX = right;
        }
      });
      const vignetteX = maxX + 60;
      const vignetteY = templateFrame?.absoluteBoundingBox?.y || 0;

      // Créer la vignette via l'API REST Figma (POST /v1/files/:key/nodes)
      const scaleIcon = Math.min(ZONE_ICONE.w / iconNode.absoluteBoundingBox.width, ZONE_ICONE.h / iconNode.absoluteBoundingBox.height) * 1.5;
      const iconW = iconNode.absoluteBoundingBox.width * scaleIcon;
      const iconH = iconNode.absoluteBoundingBox.height * scaleIcon;

      const scaleAcc = Math.min(ZONE_ACCUEIL.w / accueilNode.absoluteBoundingBox.width, ZONE_ACCUEIL.h / accueilNode.absoluteBoundingBox.height) * 0.6;
      const accW = accueilNode.absoluteBoundingBox.width * scaleAcc;
      const accH = accueilNode.absoluteBoundingBox.height * scaleAcc;

      const targetH = 11.31;
      const scaleFourn = targetH / fournNode.absoluteBoundingBox.height;
      const fournW = fournNode.absoluteBoundingBox.width * scaleFourn;

      // Construire le payload de création de nodes
      const payload = {
        nodes: [
          // Frame principale (clone du template)
          {
            type: 'FRAME',
            name: `Vignette - ${titre}`,
            x: vignetteX, y: vignetteY,
            width: 400, height: 225,
            fills: [{ type: 'SOLID', color: { r: 0.247, g: 0.561, b: 0.376 }, opacity: 1 }],
            clipsContent: true,
            children: [
              // Rectangle 4 (diagonale décorative)
              {
                type: 'RECTANGLE',
                name: 'Rectangle 4',
                x: 322, y: -90, width: 269, height: 402,
                fills: [{ type: 'SOLID', color: { r: 0.22, g: 0.52, b: 0.34 }, opacity: 1 }],
                rotation: 0,
              },
              // Rectangle 1 (coin noir haut droit)
              {
                type: 'RECTANGLE',
                name: 'Rectangle 1',
                x: 354, y: 0, width: 47, height: 47,
                fills: [{ type: 'SOLID', color: COLOR_BLACK, opacity: 1 }],
              },
              // Titre
              {
                type: 'TEXT',
                name: 'titre',
                x: 228, y: 70,
                width: 168,
                characters: titre,
                style: {
                  fontFamily: 'Inter', fontPostScriptName: 'Inter-Bold',
                  fontWeight: 700, fontSize: 47,
                  textAlignHorizontal: 'RIGHT',
                  textCase: 'UPPER',
                  lineHeightPercent: 100, letterSpacing: 0,
                },
                fills: [{ type: 'SOLID', color: COLOR_BLACK }],
              },
              // Catégorie
              {
                type: 'TEXT',
                name: 'categorie',
                x: 299, y: 155,
                width: 81,
                characters: categorie.toUpperCase(),
                style: {
                  fontFamily: 'Inter', fontPostScriptName: 'Inter-Regular',
                  fontWeight: 400, fontSize: 10,
                  textAlignHorizontal: 'RIGHT',
                  textCase: 'UPPER',
                  lineHeightPercent: 100,
                },
                fills: [{ type: 'SOLID', color: COLOR_BLACK }],
              },
            ]
          }
        ]
      };

      // POST vers l'API Figma (création de nodes)
      const createRes = await figmaPost(`/files/${FIGMA_FILE_KEY}/nodes`, payload);

      if (createRes.error) {
        return res.status(500).json({ error: createRes.error });
      }

      // Récupérer l'ID du nouveau frame créé
      const newNodeId = Object.keys(createRes.nodes || {})[0];
      if (!newNodeId) {
        return res.status(500).json({ error: 'Impossible de créer la vignette' });
      }

      // Exporter en PNG
      await new Promise(r => setTimeout(r, 2000)); // Laisser Figma processer
      const exportRes = await figmaGet(`/images/${FIGMA_FILE_KEY}?ids=${newNodeId}&format=png&scale=2`);
      const pngUrl = exportRes.images?.[newNodeId];

      return res.json({
        success: true,
        nodeId: newNodeId,
        pngUrl,
        titre,
      });
    }

    return res.status(404).json({ error: 'Action inconnue' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
