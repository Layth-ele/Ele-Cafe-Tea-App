/**
 * scripts/seed.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Node.js seed script using the Firebase Admin SDK.
 *
 * Use this INSTEAD OF the browser SeedButton when:
 *   • Setting up a brand-new Firebase project
 *   • You haven't logged into the app yet (no auth session)
 *   • You want a scriptable, CI-friendly seed
 *
 * SETUP (one time):
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → save as scripts/serviceAccount.json
 *      (already in .gitignore — never commit it)
 *   3. npm install firebase-admin
 *
 * USAGE:
 *   node scripts/seed.js                  # skip existing docs
 *   node scripts/seed.js --overwrite      # overwrite everything
 *   node scripts/seed.js --dry-run        # preview only, no writes
 *
 * After running, delete serviceAccount.json — you don't need it again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path  = require('path');
const admin = require('firebase-admin');

// ── Args ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const OVERWRITE = args.includes('--overwrite');
const DRY_RUN   = args.includes('--dry-run');

// ── Init Admin SDK ─────────────────────────────────────────────────────────────
const SA_PATH = path.join(__dirname, 'serviceAccount.json');
let serviceAccount;
try {
  serviceAccount = require(SA_PATH);
} catch {
  console.error('\n❌  serviceAccount.json not found at scripts/serviceAccount.json');
  console.error('   Download it from Firebase Console → Project Settings → Service Accounts\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────────────────────
const TS = admin.firestore.FieldValue.serverTimestamp;

function log(msg) {
  const prefix = DRY_RUN ? '[DRY RUN] ' : '';
  console.log(prefix + msg);
}

// ── Data ───────────────────────────────────────────────────────────────────────
// Image is intentionally left blank for every seeded tea. The
// admin uploads the real photo via /admin/products; until then,
// the TeaPlaceholder SVG renders in place. No external image URLs
// are seeded into Firestore.
const PRICE    = { black:18, green:18, white:22, oolong:20, rooibos:16, herbal:16, flower:18, fruit:16 };
const CAFFEINE = { black:'High', green:'Medium', white:'Low', oolong:'Medium', rooibos:'None', herbal:'None', flower:'None', fruit:'None' };

function buildTea(d) {
  return {
    id: d.slug, slug: d.slug, name: d.name,
    nameAr: '', description: '', descriptionAr: '',
    price: d.price || PRICE[d.category],
    image: '', category: d.category,
    stock: 50, featured: d.featured || false,
    isActive: true, isOrganic: d.isOrganic || false,
    allergens: d.allergens || [],
    caffeine: d.caffeine || CAFFEINE[d.category],
    avgRating: 0, ratingCount: 0,
    benefits:'', ingredients:'', origin:'', regions:'',
    brewingTemp:'', brewingTime:'', servingSuggestions:[], antioxidants:'',
    createdAt: TS(), updatedAt: TS(),
  };
}

const ALL_TEAS = [
  // BLACK (27)
  { name:'Assam',                      slug:'assam',                     category:'black', isOrganic:true,  featured:true  },
  { name:'Black Currant',              slug:'black-currant',             category:'black' },
  { name:'Ceylon Orange Pekoe',        slug:'ceylon-orange-pekoe',       category:'black' },
  { name:'Chocolate Mint',             slug:'chocolate-mint',            category:'black' },
  { name:'Cinnamon Scream',            slug:'cinnamon-scream',           category:'black' },
  { name:'Earl Grey Classic',          slug:'earl-grey-classic',         category:'black', featured:true  },
  { name:'Earl Grey Cream',            slug:'earl-grey-cream',           category:'black' },
  { name:'Earl Grey Decaf',            slug:'earl-grey-decaf',           category:'black', caffeine:'None' },
  { name:'Earl Grey Royal',            slug:'earl-grey-royal',           category:'black' },
  { name:'English Breakfast',          slug:'english-breakfast',         category:'black' },
  { name:'Ginger Black Tea',           slug:'ginger-black-tea',          category:'black' },
  { name:'Gingerbread',                slug:'gingerbread',               category:'black' },
  { name:'Himalayan Chai',             slug:'himalayan-chai',            category:'black', isOrganic:true, featured:true },
  { name:'Irish Breakfast',            slug:'irish-breakfast',           category:'black', allergens:['coconut'] },
  { name:'Island Coconut',             slug:'island-coconut',            category:'black', isOrganic:true },
  { name:'Keemun Panda',               slug:'keemun-panda',              category:'black' },
  { name:'Lapsang Souchong',           slug:'lapsang-souchong',          category:'black' },
  { name:'Lychee Congou',              slug:'lychee-congou',             category:'black' },
  { name:'Mango Mist',                 slug:'mango-mist',                category:'black' },
  { name:"Margaret's Hope Darjeeling", slug:'margarets-hope-darjeeling', category:'black' },
  { name:"Monk's Blend",               slug:'monks-blend',               category:'black' },
  { name:'Orange Spice',               slug:'orange-spice',              category:'black' },
  { name:'Peach Apricot',              slug:'peach-apricot',             category:'black' },
  { name:'Pumpkin Spice',              slug:'pumpkin-spice',             category:'black' },
  { name:'Rose Tea',                   slug:'rose-tea',                  category:'black' },
  { name:'Vanilla Sunday',             slug:'vanilla-sunday',            category:'black' },
  { name:'Young Puerh',                slug:'young-puerh',               category:'black' },
  // GREEN (17)
  { name:'Dragon-well',                slug:'dragon-well',               category:'green' },
  { name:'Genmaicha',                  slug:'genmaicha',                 category:'green' },
  { name:'Genmaicha Chai',             slug:'genmaicha-chai',            category:'green' },
  { name:'Ginger Green',               slug:'ginger-green',              category:'green' },
  { name:'Ginger Lemon',               slug:'ginger-lemon',              category:'green' },
  { name:'Green Jasmine',              slug:'green-jasmine',             category:'green', isOrganic:true, featured:true },
  { name:'Green Tea Chai',             slug:'green-tea-chai',            category:'green' },
  { name:'Lemon Green',                slug:'lemon-green',               category:'green' },
  { name:'Long Island Strawberry',     slug:'long-island-strawberry',    category:'green' },
  { name:'Lucky Dragon Hyson',         slug:'lucky-dragon-hyson',        category:'green', isOrganic:true },
  { name:'Magic Mango Natural',        slug:'magic-mango-natural',       category:'green' },
  { name:'Pan Fired Darjeeling',       slug:'pan-fired-darjeeling',      category:'green' },
  { name:'Royal Green',                slug:'royal-green',               category:'green', isOrganic:true, featured:true },
  { name:'Sencha Fuji',                slug:'sencha-fuji',               category:'green' },
  { name:'Sencha Kyoto Cherry Rose',   slug:'sencha-kyoto-cherry-rose',  category:'green' },
  { name:'Shanghai Lychee Jasmine',    slug:'shanghai-lychee-jasmine',   category:'green' },
  { name:'Vanilla Green',              slug:'vanilla-green',             category:'green' },
  // WHITE (2)
  { name:'Sowmee',    slug:'sowmee',    category:'white', featured:true },
  { name:'White Tea', slug:'white-tea', category:'white' },
  // OOLONG (4)
  { name:'Creamy Oolong', slug:'creamy-oolong', category:'oolong' },
  { name:'Mango Oolong',  slug:'mango-oolong',  category:'oolong' },
  { name:'Oolong',        slug:'oolong',         category:'oolong', featured:true },
  { name:'Royal Oolong',  slug:'royal-oolong',   category:'oolong' },
  // ROOIBOS (11)
  { name:'Cape Cod Cranberry',  slug:'cape-cod-cranberry',  category:'rooibos' },
  { name:'Earl Grey Rooibos',   slug:'earl-grey-rooibos',   category:'rooibos' },
  { name:'Ginger Rooibos',      slug:'ginger-rooibos',      category:'rooibos' },
  { name:'Green Rooibos',       slug:'green-rooibos',       category:'rooibos', isOrganic:true, featured:true },
  { name:'Jet Lag Asleep',      slug:'jet-lag-asleep',      category:'rooibos' },
  { name:'Madagascar Vanilla',  slug:'madagascar-vanilla',  category:'rooibos', allergens:['almond'] },
  { name:'Provence Lavender',   slug:'provence-lavender',   category:'rooibos' },
  { name:'Rainbow',             slug:'rainbow',             category:'rooibos' },
  { name:'Raspberry',           slug:'raspberry',           category:'rooibos' },
  { name:'Rooibos',             slug:'rooibos',             category:'rooibos', isOrganic:true, featured:true },
  { name:'Sunshine Lemon',      slug:'sunshine-lemon',      category:'rooibos' },
  // FLOWER (4)
  { name:'Arabian Camomile',      slug:'arabian-camomile',      category:'flower' },
  { name:'Lavender',              slug:'lavender',              category:'flower', featured:true },
  { name:'Passion Flower Petals', slug:'passion-flower-petals', category:'flower', isOrganic:true, featured:true },
  { name:'Rose Petal',            slug:'rose-petal',            category:'flower' },
  // HERBAL (8)
  { name:'Body & Soul',            slug:'body-and-soul',           category:'herbal' },
  { name:'Cozy Apple Cinnamon',    slug:'cozy-apple-cinnamon',     category:'herbal' },
  { name:'Golden Elixir',          slug:'golden-elixir',           category:'herbal', featured:true },
  { name:'Green Mate',             slug:'green-mate',              category:'herbal', isOrganic:true, featured:true },
  { name:'Moringa',                slug:'moringa',                 category:'herbal' },
  { name:'Peppermint',             slug:'peppermint',              category:'herbal', isOrganic:true },
  { name:'Sleepy Moon',            slug:'sleepy-moon',             category:'herbal' },
  { name:'Tulsi Licorice Delight', slug:'tulsi-licorice-delight',  category:'herbal' },
  // FRUIT (6)
  { name:'Bingo Blueberry', slug:'bingo-blueberry', category:'fruit' },
  { name:'Cherry Banana',   slug:'cherry-banana',   category:'fruit' },
  { name:'Lime Gelato',     slug:'lime-gelato',     category:'fruit' },
  { name:'Peach Harmony',   slug:'peach-harmony',   category:'fruit', featured:true },
  { name:'Strawberry Kiwi', slug:'strawberry-kiwi', category:'fruit', featured:true },
  { name:'Sunny Mango',     slug:'sunny-mango',     category:'fruit' },
];

const ALL_CATEGORIES = [
  { id:'black',   name:'Black Tea',   nameAr:'شاي أسود',   slug:'black',   order:1, isActive:true, color:'#3d1a1a' },
  { id:'green',   name:'Green Tea',   nameAr:'شاي أخضر',   slug:'green',   order:2, isActive:true, color:'#2d6a4f' },
  { id:'white',   name:'White Tea',   nameAr:'شاي أبيض',   slug:'white',   order:3, isActive:true, color:'#8d99ae' },
  { id:'oolong',  name:'Oolong Tea',  nameAr:'أولونج',      slug:'oolong',  order:4, isActive:true, color:'#6b4c2a' },
  { id:'rooibos', name:'Rooibos Tea', nameAr:'روي بوس',     slug:'rooibos', order:5, isActive:true, color:'#b5451b' },
  { id:'herbal',  name:'Herbal Tea',  nameAr:'شاي عشبي',    slug:'herbal',  order:6, isActive:true, color:'#386641' },
  { id:'flower',  name:'Flower Tea',  nameAr:'شاي الأزهار', slug:'flower',  order:7, isActive:true, color:'#c77dff' },
  { id:'fruit',   name:'Fruit Tea',   nameAr:'شاي الفاكهة', slug:'fruit',   order:8, isActive:true, color:'#e07a5f' },
];

// ── Batch helper (Admin SDK) ──────────────────────────────────────────────────
async function commitBatches(ops) {
  const LIMIT = 490;
  for (let i = 0; i < ops.length; i += LIMIT) {
    const chunk = ops.slice(i, i + LIMIT);
    if (!DRY_RUN) {
      const batch = db.batch();
      chunk.forEach(({ ref, data, merge }) => {
        if (merge) batch.set(ref, data, { merge: true });
        else       batch.set(ref, data);
      });
      await batch.commit();
    }
    log(`  → batch ${Math.floor(i/LIMIT)+1}: ${chunk.length} ops committed`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🍵  Ele Cafe — Firestore Seed Script');
  console.log(`    Mode: ${OVERWRITE ? 'OVERWRITE' : 'skip existing'}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}\n`);

  // 1. Categories
  log('── Step 1: Categories ─────────────────────────');
  const catOps = ALL_CATEGORIES.map(cat => ({
    ref: db.collection('categories').doc(cat.id),
    data: { ...cat, createdAt: TS() },
    merge: !OVERWRITE,
  }));
  await commitBatches(catOps);
  log(`✓ ${ALL_CATEGORIES.length} categories done\n`);

  // 2. Counters
  log('── Step 2: Counters ───────────────────────────');
  if (!DRY_RUN) {
    await db.collection('counters').doc('customers').set({ count: 0 }, { merge: true });
    await db.collection('counters').doc('orders').set({ count: 0 }, { merge: true });
  }
  log('✓ counters/customers and counters/orders done\n');

  // 3. Check existing teas (skip mode)
  let existingSlugs = new Set();
  if (!OVERWRITE) {
    log('── Step 3: Checking existing teas ────────────');
    const snap = await db.collection('teas').select('slug').get();
    snap.docs.forEach(d => existingSlugs.add(d.id));
    log(`  → ${existingSlugs.size} teas already exist\n`);
  }

  // 4. Teas
  log('── Step 4: Teas ───────────────────────────────');
  const toWrite = ALL_TEAS.filter(t => OVERWRITE || !existingSlugs.has(t.slug));
  const skipped = ALL_TEAS.length - toWrite.length;
  log(`  Writing ${toWrite.length} teas, skipping ${skipped}`);

  const teaOps = toWrite.map(def => ({
    ref:   db.collection('teas').doc(def.slug),
    data:  buildTea(def),
    merge: false,
  }));
  await commitBatches(teaOps);
  log(`✓ ${toWrite.length} teas done\n`);

  // Summary
  console.log('─'.repeat(50));
  console.log(`✅  Seed complete!`);
  console.log(`    Categories : ${ALL_CATEGORIES.length} written`);
  console.log(`    Teas       : ${toWrite.length} written, ${skipped} skipped`);
  console.log(`    Counters   : customers + orders initialised`);
  if (DRY_RUN) console.log('\n    ⚠  DRY RUN — nothing was actually written');
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Seed failed:', err.message || err);
  process.exit(1);
});
