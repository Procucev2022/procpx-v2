/* Application constants extracted from lib/drawing-parser.ts. */

// Category matching heuristics based on industry CaPex keywords
export const CATEGORY_RULES: Array<{ category: string; keywords: string[] }> = [
  {
    category: 'Civil & Interior',
    keywords: [
      'tile', 'vitrified', 'granite', 'marble', 'flooring', 'ceiling', 'gypsum', 'partition',
      'glass', 'door', 'window', 'flush door', 'paint', 'putty', 'plaster', 'veneer', 'laminate',
      'skirting', 'hardware', 'lock', 'hinge', 'joinery', 'wood', 'plywood', 'corian', 'boxing', 'beam',
    ],
  },
  {
    category: 'Electrical',
    keywords: [
      'light', 'led', 'downlight', 'cable', 'wire', 'conduit', 'switch', 'socket', 'panel',
      'db', 'distribution board', 'mcb', 'mccb', 'ups', 'circuit', 'wiring', 'luminaire', 'track light',
      'power point', 'ups socket',
    ],
  },
  {
    category: 'HVAC',
    keywords: [
      'ac', 'air conditioning', 'split ac', 'cassette', 'chiller', 'duct', 'diffuser', 'grille',
      'vrf', 'vrv', 'fan coil', 'exhaust fan', 'ventilation', 'copper piping', 'refrigerant',
    ],
  },
  {
    category: 'Plumbing',
    keywords: [
      'plumbing', 'pipe', 'pvc', 'cpvc', 'drain', 'basin', 'wash basin', 'water closet', 'wc',
      'urinal', 'faucet', 'tap', 'trap', 'valve', 'pump', 'water heater', 'geyser', 'sanitary',
    ],
  },
  {
    category: 'Fire Fighting',
    keywords: [
      'fire', 'extinguisher', 'sprinkler', 'hydrant', 'smoke detector', 'fire alarm', 'hose reel',
      'alarm valve', 'fire suppression',
    ],
  },
  {
    category: 'ELV / IT',
    keywords: [
      'cat6', 'data point', 'rj45', 'rack', 'server', 'cctv', 'camera', 'access control',
      'biometric', 'pa system', 'speaker', 'wifi', 'access point', 'intercom', 'screen', 'display', 'menu board', 'dmb',
    ],
  },
  {
    category: 'Furniture',
    keywords: [
      'table', 'desk', 'chair', 'sofa', 'workstation', 'counter', 'reception', 'credenza',
      'storage unit', 'filing cabinet', 'podium', 'bench',
    ],
  },
  {
    category: 'Signage & Branding',
    keywords: [
      'signage', 'branding', 'logo', 'fascia', 'acrylic', 'glow sign', 'neon', 'directional sign',
      'wayfinding', 'pylon', 'manifestation',
    ],
  },
];

// Standard CaPex UOMs
export const KNOWN_UOMS = [
  'SQFT', 'SQM', 'NOS', 'MTR', 'RFT', 'CUM', 'SET', 'LOT', 'EA', 'KG', 'PAC', 'BAG',
];
