// The parts of a bowl of shoyu ramen, bottom to top as they come apart.
// `kind` follows the five primary elements: broth, noodles, tare, aromatic oil, toppings.
// Facts are cross-checked in SOURCES.md.

export const BOWL_INFO = {
  name: 'A bowl of ramen',
  blurb: 'Ramen is built from five elements: broth, noodles, tare, aromatic oil and toppings. Tap the bowl to take it apart.',
};

export const PARTS = [
  { id: 'bowl', name: 'Ramen bowl', kind: 'The bowl',
    line: 'A wide, deep bowl keeps the soup hot and leaves room for toppings. The red square-spiral band is the classic “thunder” pattern.' },
  { id: 'broth', name: 'Broth', kind: 'Element 1 · Broth',
    line: 'The broth gives depth and body. Pork, chicken or fish bones simmer for hours to make it.' },
  { id: 'tare', name: 'Tare', kind: 'Element 2 · Tare',
    line: 'Tare is the strong seasoning poured in first. Soy sauce, salt or miso tare decides the kind of ramen.' },
  { id: 'oil', name: 'Aromatic oil', kind: 'Element 3 · Oil',
    line: 'A spoonful of flavoured fat, like chicken fat or garlic oil, floats on top for fragrance and richness.' },
  { id: 'noodles', name: 'Noodles', kind: 'Element 4 · Noodles',
    line: 'Wheat noodles made with kansui, an alkaline mineral water that makes them yellow, springy and chewy.' },
  { id: 'chashu', name: 'Chashu pork', kind: 'Element 5 · Topping',
    line: 'Pork belly is rolled, tied and slowly braised in soy sauce and sugar, then cut into round slices.' },
  { id: 'egg', name: 'Seasoned egg', kind: 'Element 5 · Topping',
    line: 'A soft-boiled egg soaked overnight in soy sauce: the white turns tan and the yolk stays jammy.' },
  { id: 'nori', name: 'Nori seaweed', kind: 'Element 5 · Topping',
    line: 'Sheets of dried, toasted seaweed. Tucked against the rim, they soften as they soak up broth.' },
  { id: 'menma', name: 'Menma', kind: 'Element 5 · Topping',
    line: 'Bamboo shoots, fermented and then simmered in seasoning: crunchy, salty and a little sweet.' },
  { id: 'woodear', name: 'Wood ear mushroom', kind: 'Element 5 · Topping',
    line: 'A mushroom that grows on tree trunks. Cut into thin strips it adds a crunchy, jelly-like snap.' },
  { id: 'onion', name: 'Green onions', kind: 'Element 5 · Topping',
    line: 'Thinly sliced spring onions add a fresh, sharp bite and a bright splash of green.' },
  { id: 'enoki', name: 'Enoki mushrooms', kind: 'Element 5 · Topping',
    line: 'Long, thin white mushrooms with tiny caps. They cook in seconds and add a gentle crunch.' },
];

export const BY_ID = Object.fromEntries(PARTS.map((p, i) => [p.id, { ...p, n: i + 1 }]));
PARTS.forEach((p, i) => { p.n = i + 1; });
