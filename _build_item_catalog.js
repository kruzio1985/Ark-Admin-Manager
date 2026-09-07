// Analizuje Items z ASM GameData i generuje katalog itemów
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'dataArk', 'ASM', 'GameData');
const outFile = path.join(__dirname, 'data', 'items-catalog.json');

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.gamedata'));
console.log('Files:', files.length);

const itemMap = new Map(); // className -> item
let total = 0;

for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8'));
    const items = data.Items || [];
    total += items.length;
    for (const it of items) {
      if (!it.ClassName) continue;
      if (!itemMap.has(it.ClassName)) {
        itemMap.set(it.ClassName, it);
      }
    }
  } catch (e) { console.log('skip', f, e.message); }
}

console.log('Total items (all maps):', total);
console.log('Unique items:', itemMap.size);

// Kategorie
const cats = {};
for (const it of itemMap.values()) {
  const c = it.Category || 'Other';
  cats[c] = (cats[c] || 0) + 1;
}
console.log('Categories:', JSON.stringify(cats, null, 2));

// GFI: PrimalItemResource_MetalIngot_C -> MetalIngot
// PrimalItemAmmo_ArrowStone_Feathered_C -> ArrowStone_Feathered
function toGfi(className) {
  let g = className;
  g = g.replace(/^PrimalItem[A-Za-z0-9]*_/, '');
  g = g.replace(/_C$/, '');
  return g;
}

function normCat(c) {
  const map = {
    'Resource': 'Resources',
    'Structure': 'Structures',
    'Weapon': 'Weapons',
    'Consumable': 'Consumables',
    'Ammo': 'Ammunition',
    'Spawner': 'Other',
    'Mek Module': 'Other',
  };
  return map[c] || c || 'Other';
}

const catalog = [];
for (const it of itemMap.values()) {
  catalog.push({
    gfi: toGfi(it.ClassName),
    name: it.Description || it.ClassName,
    category: normCat(it.Category || 'Other'),
    className: it.ClassName,
    mod: it.Mod || 'ArkPrime',
  });
}
catalog.sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));

fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2), 'utf8');
console.log('Wrote:', outFile, catalog.length, 'items');

// Przykłady zasobów
console.log('\n--- Przykładowe zasoby/materiały ---');
const samples = catalog.filter(i => /resource|ingot|wood|stone|metal|hide|fiber|cement|polymer|oil|crystal|obsidian|chitin|keratin|silk|pearl/i.test(i.gfi + ' ' + i.name)).slice(0, 40);
samples.forEach(i => console.log(`  ${i.gfi} | ${i.name} | ${i.category}`));
