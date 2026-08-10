/* ══════════════════════════════════════════════════════════════
   Doginal Dogs Legends — Card Data
   ──────────────────────────────────────────────────────────────
   THIS IS PLACEHOLDER DATA. Replace the entries below with the real
   111 cards from Rise of the Pack once you have them.

   HOW TO ADD A REAL CARD — copy this template into the CARDS array:
   {
     id:      "rotp-001",              // unique id: rotp-### (keep numbering)
     name:    "Card Name",
     class:   "Guardian",              // one of the CLASSES below
     type:    "Creature",              // "Creature" | "Spell" | "Trap"
     cost:    3,                       // mana cost, 0–10 (the diamond)
     atk:     4,                       // creatures only (else null)
     hp:      5,                       // creatures only (else null)
     rarity:  "Rare",                  // one of the RARITIES below
     keywords:["Taunt"],               // [] if none
     text:    "What the card does.",
     image:   "ddl-cards/rotp-001.png" // path to the card art (add later)
   }

   The five classes and rarity names below are PLACEHOLDERS — rename them
   to match the real game once confirmed. The app reads these two lists
   automatically, so changing them here updates the whole site.
   ══════════════════════════════════════════════════════════════ */

window.DDL_META = {
  setName: "Rise of the Pack",
  totalCards: 111,          // real set size — the tracker counts toward this
  deckSize: 40,             // cards per deck
  // Placeholder class names — rename to the real five classes.
  CLASSES: ["Guardian", "Hunter", "Mystic", "Trickster", "Warlord"],
  // Placeholder rarity tiers, rarest last.
  RARITIES: ["Common", "Uncommon", "Rare", "Epic", "Legendary"],
  // Keyword glossary (from the official rules) — used for card detail tooltips.
  KEYWORDS: {
    "Taunt":   "Must be attacked first. Blocks face and other bodies until it's gone.",
    "Rush":    "Can attack creatures the turn it enters. Can't hit the hero that turn.",
    "Poison":  "Destroys any creature it fights, ignoring the usual ATK ≥ HP rule.",
    "Play":    "Effect triggers when you play the card from hand.",
    "Death":   "Effect triggers when the creature dies.",
    "Haunt":   "Ongoing graveyard-style effect — read the card text.",
    "Passive": "Always on while this permanent is in play."
  }
};

/* Placeholder cards — a representative spread across classes, types,
   costs, rarities, and keywords so the app looks and behaves real.
   Delete these and paste the real 111 when ready. */
window.DDL_CARDS = [
  // ── Guardian ──
  { id:"rotp-001", name:"Kennel Sentinel",  class:"Guardian", type:"Creature", cost:2, atk:2, hp:4, rarity:"Common",    keywords:["Taunt"],            text:"A steady body that soaks early pressure.", image:"" },
  { id:"rotp-002", name:"Iron Collar",      class:"Guardian", type:"Spell",    cost:1, atk:null, hp:null, rarity:"Common", keywords:[],                 text:"Give a friendly creature +0/+3 this turn.", image:"" },
  { id:"rotp-003", name:"Bulwark Hound",    class:"Guardian", type:"Creature", cost:4, atk:3, hp:7, rarity:"Uncommon",  keywords:["Taunt"],            text:"The wall your pack forms behind.", image:"" },
  { id:"rotp-004", name:"Last Stand",       class:"Guardian", type:"Trap",     cost:2, atk:null, hp:null, rarity:"Rare", keywords:[],                   text:"When a friendly creature would die, it survives with 1 HP.", image:"" },
  { id:"rotp-005", name:"Warden of the Yard", class:"Guardian", type:"Creature", cost:6, atk:5, hp:9, rarity:"Epic",    keywords:["Taunt","Passive"],  text:"Passive: adjacent allies take 1 less damage.", image:"" },
  { id:"rotp-006", name:"Aegis, First Shield", class:"Guardian", type:"Creature", cost:8, atk:7, hp:12, rarity:"Legendary", keywords:["Taunt","Play"], text:"Play: gain 5 armor. The pack does not fall today.", image:"" },

  // ── Hunter ──
  { id:"rotp-007", name:"Scent Tracker",    class:"Hunter", type:"Creature", cost:1, atk:2, hp:1, rarity:"Common",   keywords:["Rush"],             text:"Fast off the line.", image:"" },
  { id:"rotp-008", name:"Quick Shot",       class:"Hunter", type:"Spell",    cost:2, atk:null, hp:null, rarity:"Common", keywords:[],                text:"Deal 3 damage to a creature.", image:"" },
  { id:"rotp-009", name:"Pack Flanker",     class:"Hunter", type:"Creature", cost:3, atk:4, hp:2, rarity:"Uncommon", keywords:["Rush"],             text:"Hits hard the moment it lands.", image:"" },
  { id:"rotp-010", name:"Ambush Line",      class:"Hunter", type:"Trap",     cost:1, atk:null, hp:null, rarity:"Rare", keywords:[],                  text:"When an enemy attacks, deal 2 damage to it first.", image:"" },
  { id:"rotp-011", name:"Alpha Stalker",    class:"Hunter", type:"Creature", cost:5, atk:6, hp:4, rarity:"Epic",     keywords:["Rush","Play"],      text:"Play: deal 2 to any target.", image:"" },
  { id:"rotp-012", name:"Fang, the Relentless", class:"Hunter", type:"Creature", cost:7, atk:8, hp:6, rarity:"Legendary", keywords:["Rush","Poison"], text:"Nothing it bites survives.", image:"" },

  // ── Mystic ──
  { id:"rotp-013", name:"Ember Pup",        class:"Mystic", type:"Creature", cost:2, atk:3, hp:2, rarity:"Common",   keywords:["Play"],             text:"Play: deal 1 damage to the enemy hero.", image:"" },
  { id:"rotp-014", name:"Arcane Bark",      class:"Mystic", type:"Spell",    cost:3, atk:null, hp:null, rarity:"Common", keywords:[],                text:"Draw 2 cards.", image:"" },
  { id:"rotp-015", name:"Runed Retriever",  class:"Mystic", type:"Creature", cost:4, atk:3, hp:5, rarity:"Uncommon", keywords:["Death"],            text:"Death: draw a card.", image:"" },
  { id:"rotp-016", name:"Mana Snare",       class:"Mystic", type:"Trap",     cost:2, atk:null, hp:null, rarity:"Rare", keywords:[],                  text:"When the enemy casts a spell, it costs 2 more.", image:"" },
  { id:"rotp-017", name:"Stormcaller Shiba", class:"Mystic", type:"Creature", cost:6, atk:5, hp:5, rarity:"Epic",    keywords:["Play"],             text:"Play: deal 3 damage split among enemies.", image:"" },
  { id:"rotp-018", name:"Orin, the Oracle", class:"Mystic", type:"Creature", cost:8, atk:6, hp:8, rarity:"Legendary", keywords:["Play","Haunt"],   text:"Play & Haunt: your spells cost 1 less.", image:"" },

  // ── Trickster ──
  { id:"rotp-019", name:"Sneaky Paws",      class:"Trickster", type:"Creature", cost:1, atk:1, hp:2, rarity:"Common", keywords:[],                  text:"Cheap, annoying, everywhere.", image:"" },
  { id:"rotp-020", name:"Switcheroo",       class:"Trickster", type:"Spell",   cost:2, atk:null, hp:null, rarity:"Common", keywords:[],               text:"Swap the ATK and HP of a creature.", image:"" },
  { id:"rotp-021", name:"Masked Mutt",      class:"Trickster", type:"Creature", cost:3, atk:2, hp:3, rarity:"Uncommon", keywords:["Death"],          text:"Death: return this to your hand.", image:"" },
  { id:"rotp-022", name:"Double Cross",     class:"Trickster", type:"Trap",    cost:3, atk:null, hp:null, rarity:"Rare", keywords:[],                  text:"When an enemy creature attacks, take control of it until end of turn.", image:"" },
  { id:"rotp-023", name:"Jester's Gambit",  class:"Trickster", type:"Creature", cost:5, atk:4, hp:4, rarity:"Epic",    keywords:["Play"],             text:"Play: both players discard a random card.", image:"" },
  { id:"rotp-024", name:"Loki, the Unseen", class:"Trickster", type:"Creature", cost:7, atk:6, hp:6, rarity:"Legendary", keywords:["Rush","Play"],   text:"Play: copy an enemy creature's text.", image:"" },

  // ── Warlord ──
  { id:"rotp-025", name:"War Pup",          class:"Warlord", type:"Creature", cost:2, atk:3, hp:2, rarity:"Common",   keywords:[],                   text:"Trained for the front line.", image:"" },
  { id:"rotp-026", name:"Rally Cry",        class:"Warlord", type:"Spell",    cost:3, atk:null, hp:null, rarity:"Common", keywords:[],                text:"Give all friendly creatures +1/+1.", image:"" },
  { id:"rotp-027", name:"Siege Mastiff",    class:"Warlord", type:"Creature", cost:4, atk:5, hp:3, rarity:"Uncommon", keywords:["Rush"],             text:"Built to break lines.", image:"" },
  { id:"rotp-028", name:"No Retreat",       class:"Warlord", type:"Trap",     cost:2, atk:null, hp:null, rarity:"Rare", keywords:[],                  text:"When a friendly creature dies, give another +2/+0.", image:"" },
  { id:"rotp-029", name:"General Grit",     class:"Warlord", type:"Creature", cost:6, atk:6, hp:6, rarity:"Epic",     keywords:["Play","Passive"],   text:"Passive: your creatures have +1 ATK.", image:"" },
  { id:"rotp-030", name:"Titus, Warbringer", class:"Warlord", type:"Creature", cost:9, atk:9, hp:9, rarity:"Legendary", keywords:["Rush","Play"],   text:"Play: deal 4 damage to all enemy creatures.", image:"" }
];
