const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  settingsButton: document.getElementById("settingsButton"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  restartButton: document.getElementById("restartButton"),
};

const SURFACE_WIDTH = 5200;
const INTERIOR_WIDTH = 2200;
const SURFACE_HEIGHT = canvas.height;

const keys = new Set();
const pickups = [];
const interiorLoots = [];
const discoveredZones = new Set();

const stars = Array.from({ length: 180 }, () => ({
  x: Math.random() * SURFACE_WIDTH,
  y: Math.random() * 260,
  r: Math.random() * 1.6 + 0.35,
  a: Math.random() * 0.6 + 0.25,
}));

const zones = [
  { start: 0, end: 820, name: "Landing Flats" },
  { start: 820, end: 1700, name: "Silent Craters" },
  { start: 1700, end: 2660, name: "Glass Ridge" },
  { start: 2660, end: 3640, name: "Shadow Basin" },
  { start: 3640, end: 4520, name: "Frozen Drift" },
  { start: 4520, end: SURFACE_WIDTH, name: "Signal Wall" },
];

const locations = [
  {
    id: "lander",
    name: "Lander",
    x: 360,
    kind: "lander",
    height: 78,
    interiorTitle: "Lander Cabin",
    description: "Navigation panels hum softly around the pilot seat.",
    interiorTone: "#83d9ff",
    interiorAccent: "#173047",
  },
  {
    id: "hab",
    name: "Hab Dome",
    x: 1320,
    kind: "dome",
    height: 74,
    interiorTitle: "Hab Dome",
    description: "Warm life-support lights and a calm sleeping pod greet you.",
    interiorTone: "#a8f1ff",
    interiorAccent: "#163347",
  },
  {
    id: "lab",
    name: "Hydro Lab",
    x: 2480,
    kind: "lab",
    height: 82,
    interiorTitle: "Hydro Lab",
    description: "Hydroponic trays and water channels glow green in the dark.",
    interiorTone: "#8cffb8",
    interiorAccent: "#16382f",
  },
  {
    id: "bay",
    name: "Recycler Bay",
    x: 3880,
    kind: "bay",
    height: 78,
    interiorTitle: "Recycler Bay",
    description: "Storage crates, recycled parts, and repair tools line the walls.",
    interiorTone: "#ffd57d",
    interiorAccent: "#3b2c14",
  },
];

const camera = { x: 0 };

function createInitialPlayerState() {
  return {
    x: 180,
    y: 0,
    width: 34,
    height: 52,
    vx: 0,
    vy: 0,
    maxWalkSpeed: 3.2,
    accel: 0.34,
    drag: 0.78,
    airControl: 0.18,
    gravity: 0.18,
    jumpPower: -4.6,
    onGround: false,
    reach: 82,
    facing: 1,
  };
}

function createInitialGameState() {
  return {
    oxygen: 100,
    hunger: 100,
    energy: 100,
    day: 1,
    score: 0,
    elapsed: 0,
    cycleLength: 36,
    oxygenAssistCooldown: 0,
    gameOver: false,
    currentArea: "surface",
    activeInteriorId: null,
    lastSurfaceX: 180,
    inventory: {
      coins: 0,
      food: 2,
      ore: 0,
      ice: 0,
      parts: 0,
      weapons: 0,
    },
    log: [],
  };
}

const player = createInitialPlayerState();
const game = createInitialGameState();

function pushLog(text) {
  game.log.unshift(text);
  game.log = game.log.slice(0, 5);
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentWorldWidth() {
  return game.currentArea === "surface" ? SURFACE_WIDTH : INTERIOR_WIDTH;
}

function zoneForX(x) {
  return zones.find((zone) => x >= zone.start && x < zone.end) ?? zones[zones.length - 1];
}

function groundAt(x) {
  if (game.currentArea !== "surface") {
    return SURFACE_HEIGHT - 110;
  }

  const rolling = 14 * Math.sin(x * 0.0032);
  const medium = 28 * Math.sin(x * 0.0011 + 1.3);
  const basin = 16 * Math.sin(x * 0.0067 + 0.7);
  return SURFACE_HEIGHT - 104 + rolling + medium + basin;
}

function activeLocation() {
  return locations.find((location) => location.id === game.activeInteriorId) ?? locations[0];
}

function createInteriorLoot(locationId) {
  const lootByLocation = {
    lander: [
      { kind: "chest", x: 520, reward: { coins: 6, parts: 2, energy: 14 } },
      { kind: "food", x: 880, reward: { hunger: 18, energy: 8 } },
      { kind: "weapon", x: 1560, reward: { weapons: 1, score: 80 } },
    ],
    hab: [
      { kind: "food", x: 420, reward: { hunger: 20, energy: 10 } },
      { kind: "chest", x: 930, reward: { coins: 8, food: 1, energy: 12 } },
      { kind: "ice", x: 1620, reward: { oxygen: 18 } },
    ],
    lab: [
      { kind: "food", x: 560, reward: { hunger: 22, energy: 8 } },
      { kind: "chest", x: 1120, reward: { ore: 2, parts: 1, energy: 16 } },
      { kind: "weapon", x: 1760, reward: { weapons: 1, score: 90 } },
    ],
    bay: [
      { kind: "chest", x: 480, reward: { coins: 10, parts: 2, energy: 15 } },
      { kind: "ore", x: 980, reward: { ore: 1, energy: 8 } },
      { kind: "weapon", x: 1680, reward: { weapons: 1, score: 100 } },
    ],
  };

  return (lootByLocation[locationId] ?? []).map((item) => ({
    ...item,
    y: SURFACE_HEIGHT - 162,
    width: item.kind === "chest" ? 42 : 28,
    height: item.kind === "chest" ? 30 : 28,
    collected: false,
  }));
}

function nearestLocation() {
  if (game.currentArea !== "surface") {
    return { type: "exit" };
  }

  const px = player.x + player.width / 2;
  return locations.find((location) => Math.abs(location.x - px) < 92) ?? null;
}

function spawnPickup(kind, xHint) {
  const definitions = {
    coin: { color: "#ffd36e", radius: 9 },
    food: { color: "#ffb36a", radius: 13 },
    ore: { color: "#8bb6ff", radius: 11 },
    ice: { color: "#c7f6ff", radius: 12 },
    parts: { color: "#ffe18a", radius: 10 },
  };

  const weighted = ["coin", "coin", "food", "ore", "ore", "ice", "parts"];
  const type = kind ?? weighted[Math.floor(Math.random() * weighted.length)];
  const def = definitions[type];
  const x = clamp(xHint ?? randomRange(120, SURFACE_WIDTH - 120), 80, SURFACE_WIDTH - 80);
  const ground = groundAt(x);

  pickups.push({
    kind: type,
    x,
    baseY: ground - randomRange(90, 170),
    radius: def.radius,
    color: def.color,
    bob: Math.random() * Math.PI * 2,
    drift: randomRange(-0.18, 0.18),
  });
}

function fillRegion(start, end, count) {
  for (let i = 0; i < count; i += 1) {
    spawnPickup(undefined, randomRange(start, end));
  }
}

function seedWorld() {
  fillRegion(160, 1000, 10);
  fillRegion(1000, 2200, 10);
  fillRegion(2200, 3400, 10);
  fillRegion(3400, 5040, 12);
  player.y = groundAt(player.x) - player.height;
  pushLog("Mission started. Explore the moon and step inside the outposts.");
  discoverZone();
}

function restartGame() {
  keys.clear();
  pickups.length = 0;
  interiorLoots.length = 0;
  discoveredZones.clear();
  camera.x = 0;

  Object.assign(player, createInitialPlayerState());
  const nextState = createInitialGameState();
  Object.assign(game, nextState);
  game.inventory = { ...nextState.inventory };
  game.log = [];

  seedWorld();
  updateUI();
}

function updateUI() {
  ui.restartButton.classList.toggle("hidden", !game.gameOver);
}

function openSettings() {
  ui.settingsModal.classList.remove("hidden");
  ui.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  ui.settingsModal.classList.add("hidden");
  ui.settingsModal.setAttribute("aria-hidden", "true");
}

function collectPickup(pickup) {
  if (pickup.kind === "coin") {
    game.inventory.coins += 1;
    game.score += 25;
    game.energy = Math.min(100, game.energy + 2);
    return;
  }

  if (pickup.kind === "food") {
    game.inventory.food += 1;
    game.hunger = Math.min(100, game.hunger + 20);
    game.energy = Math.min(100, game.energy + 8);
    game.score += 18;
    return;
  }

  if (pickup.kind === "ice") {
    game.inventory.ice += 1;
    game.oxygen = Math.min(100, game.oxygen + 14);
    game.score += 18;
    return;
  }

  if (pickup.kind === "ore") {
    game.inventory.ore += 1;
    game.energy = Math.min(100, game.energy + 6);
    game.score += 18;
    return;
  }

  if (pickup.kind === "parts") {
    game.inventory.parts += 1;
    game.energy = Math.min(100, game.energy + 10);
    game.score += 20;
  }
}

function collectNearby() {
  if (game.gameOver || game.currentArea !== "surface") {
    return;
  }

  let collected = 0;
  let oxygenRecovered = 0;

  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const pickupY = pickup.baseY + Math.sin(pickup.bob) * 8;

    if (Math.hypot(pickup.x - px, pickupY - py) <= player.reach) {
      if (pickup.kind === "ice") {
        oxygenRecovered += 14;
      }
      collectPickup(pickup);
      pickups.splice(i, 1);
      collected += 1;
    }
  }

  if (collected > 0) {
    pushLog(
      oxygenRecovered > 0
        ? `Collected ${collected} items. Ice converted into ${oxygenRecovered}% oxygen.`
        : `Collected ${collected} nearby items.`,
    );
    while (pickups.length < 42) {
      spawnPickup();
    }
  }
}

function autoCollectNearby() {
  if (game.gameOver || game.currentArea !== "surface") {
    return;
  }

  let collected = 0;
  let oxygenRecovered = 0;

  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const pickupY = pickup.baseY + Math.sin(pickup.bob) * 8;
    const collectRadius = pickup.radius + player.width * 0.65;

    if (Math.hypot(pickup.x - px, pickupY - py) <= collectRadius) {
      if (pickup.kind === "ice") {
        oxygenRecovered += 14;
      }
      collectPickup(pickup);
      pickups.splice(i, 1);
      collected += 1;
    }
  }

  if (collected > 0) {
    pushLog(
      oxygenRecovered > 0
        ? `Auto-collected ${collected} items. Ice converted into ${oxygenRecovered}% oxygen.`
        : `Auto-collected ${collected} items.`,
    );
    while (pickups.length < 42) {
      spawnPickup();
    }
  }
}

function eatFood() {
  if (game.inventory.food <= 0 || game.gameOver) {
    pushLog("No food packs available.");
    return;
  }

  game.inventory.food -= 1;
  game.hunger = Math.min(100, game.hunger + 35);
  game.energy = Math.min(100, game.energy + 15);
  game.score += 10;
  pushLog("Food pack consumed. Vitals rising.");
}

function discoverZone() {
  if (game.currentArea !== "surface") {
    return;
  }

  const zone = zoneForX(player.x);
  if (!discoveredZones.has(zone.name)) {
    discoveredZones.add(zone.name);
    game.score += 40;
    pushLog(`New area discovered: ${zone.name}.`);
  }
}

function enterLocation(location) {
  game.lastSurfaceX = player.x;
  game.currentArea = "interior";
  game.activeInteriorId = location.id;
  interiorLoots.length = 0;
  interiorLoots.push(...createInteriorLoot(location.id));
  player.x = 140;
  player.y = groundAt(player.x) - player.height;
  player.vx = 0;
  player.vy = 0;
  camera.x = 0;
  pushLog(`Entered ${location.interiorTitle}.`);
}

function leaveInterior() {
  game.currentArea = "surface";
  game.activeInteriorId = null;
  interiorLoots.length = 0;
  player.x = game.lastSurfaceX;
  player.y = groundAt(player.x) - player.height;
  player.vx = 0;
  player.vy = 0;
  camera.x = clamp(player.x - canvas.width * 0.42, 0, SURFACE_WIDTH - canvas.width);
  pushLog("Returned to the lunar surface.");
}

function useContextAction() {
  if (game.gameOver) {
    return;
  }

  if (game.currentArea === "interior") {
    leaveInterior();
    return;
  }

  const location = nearestLocation();
  if (location) {
    enterLocation(location);
  } else {
    collectNearby();
  }
}

function updatePlayer(delta) {
  const dt = delta / 16.67;
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  let direction = 0;

  if (left) {
    direction -= 1;
  }
  if (right) {
    direction += 1;
  }
  if (direction !== 0) {
    player.facing = direction;
  }

  if (player.onGround) {
    player.vx += direction * player.accel * dt;
    if (direction === 0) {
      player.vx *= Math.pow(player.drag, dt);
    }
  } else {
    player.vx += direction * player.airControl * dt;
  }

  player.vx = clamp(player.vx, -player.maxWalkSpeed, player.maxWalkSpeed);
  player.vy += player.gravity * dt;
  player.x += player.vx * dt * 3.4;
  player.y += player.vy * dt * 3.4;
  player.x = clamp(player.x, 16, currentWorldWidth() - player.width - 16);

  const groundY = groundAt(player.x + player.width / 2) - player.height;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }
}

function updatePickups(delta) {
  if (game.currentArea !== "surface") {
    return;
  }

  const dt = delta / 16.67;
  pickups.forEach((pickup) => {
    pickup.bob += 0.04 * dt;
    pickup.x += pickup.drift * dt;
    if (pickup.x < 80 || pickup.x > SURFACE_WIDTH - 80) {
      pickup.drift *= -1;
    }
    const ground = groundAt(pickup.x);
    pickup.baseY = clamp(pickup.baseY, ground - 190, ground - 84);
  });
}

function updateCamera(delta) {
  const dt = delta / 16.67;
  const targetX = clamp(
    player.x + player.width / 2 - canvas.width * 0.42,
    0,
    currentWorldWidth() - canvas.width,
  );
  camera.x += (targetX - camera.x) * Math.min(1, 0.08 * dt + 0.04);
}

function collectInteriorLoot(item) {
  if (item.collected) {
    return;
  }

  item.collected = true;
  if (item.reward.coins) {
    game.inventory.coins += item.reward.coins;
  }
  if (item.reward.food) {
    game.inventory.food += item.reward.food;
  }
  if (item.reward.ore) {
    game.inventory.ore += item.reward.ore;
  }
  if (item.reward.parts) {
    game.inventory.parts += item.reward.parts;
  }
  if (item.reward.weapons) {
    game.inventory.weapons += item.reward.weapons;
  }
  if (item.reward.oxygen) {
    game.oxygen = Math.min(100, game.oxygen + item.reward.oxygen);
  }
  if (item.reward.hunger) {
    game.hunger = Math.min(100, game.hunger + item.reward.hunger);
  }
  if (item.reward.energy) {
    game.energy = Math.min(100, game.energy + item.reward.energy);
  }
  if (item.reward.score) {
    game.score += item.reward.score;
  } else {
    game.score += 35;
  }

  if (item.kind === "weapon") {
    pushLog("Weapon secured. Your explorer kit feels stronger.");
  } else if (item.kind === "chest") {
    pushLog("Chest opened. Supplies transferred immediately.");
  } else {
    pushLog("Interior supply recovered.");
  }
}

function autoCollectInteriorLoot() {
  if (game.gameOver || game.currentArea !== "interior") {
    return;
  }

  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  interiorLoots.forEach((item) => {
    if (item.collected) {
      return;
    }
    const ix = item.x + item.width / 2;
    const iy = item.y + item.height / 2;
    if (Math.hypot(ix - px, iy - py) <= 44) {
      collectInteriorLoot(item);
    }
  });
}

function updateSurvival(delta) {
  const factor = delta / 16.67;
  game.elapsed += delta / 1000;
  game.oxygenAssistCooldown = Math.max(0, game.oxygenAssistCooldown - delta / 1000);

  if (game.currentArea === "surface" && game.elapsed >= game.cycleLength) {
    game.elapsed = 0;
    game.day += 1;
    spawnPickup("parts", clamp(player.x + randomRange(-320, 320), 120, SURFACE_WIDTH - 120));
    pushLog(`Day ${game.day} begins. Fresh debris fell near your route.`);
  }

  const oxygenDrain = game.currentArea === "surface" ? 0.048 : 0.03;
  const hungerDrain = game.currentArea === "surface" ? 0.068 : 0.04;
  const energyDrain = game.currentArea === "surface" ? 0.052 : 0.03;

  game.oxygen -= oxygenDrain * factor;
  game.hunger -= hungerDrain * factor;
  game.energy -= energyDrain * factor;

  if (game.inventory.ice > 0 && game.oxygen < 55 && game.oxygenAssistCooldown === 0) {
    game.inventory.ice -= 1;
    game.oxygen = Math.min(100, game.oxygen + 18);
    game.oxygenAssistCooldown = 2.5;
    pushLog("Emergency oxygen refill used 1 ice pack.");
  }

  if (!player.onGround) {
    game.energy -= 0.013 * factor;
  }
  if (Math.abs(player.vx) > 2.4) {
    game.energy -= 0.01 * factor;
  }
  if (game.hunger < 30) {
    game.oxygen -= 0.028 * factor;
  }
  if (game.energy < 25) {
    game.hunger -= 0.02 * factor;
  }

  game.oxygen = clamp(game.oxygen, 0, 100);
  game.hunger = clamp(game.hunger, 0, 100);
  game.energy = clamp(game.energy, 0, 100);

  if (!game.gameOver && (game.oxygen <= 0 || game.hunger <= 0 || game.energy <= 0)) {
    game.gameOver = true;
    pushLog("Vitals collapsed. The moon outlasted the mission.");
  }
}

function drawStars() {
  stars.forEach((star) => {
    const x = (star.x - camera.x * 0.18 + SURFACE_WIDTH) % SURFACE_WIDTH;
    if (x < -10 || x > canvas.width + 10) {
      return;
    }
    ctx.globalAlpha = star.a;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawSurface() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#030816");
  sky.addColorStop(1, "#122234");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars();

  ctx.fillStyle = "rgba(240, 247, 255, 0.08)";
  ctx.beginPath();
  ctx.arc(820, 110, 62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(129, 156, 188, 0.24)";
  for (let i = -1; i <= 6; i += 1) {
    const x = i * 240 - (camera.x * 0.35) % 240;
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - 180);
    ctx.quadraticCurveTo(x + 110, canvas.height - 260, x + 240, canvas.height - 180);
    ctx.lineTo(x + 240, canvas.height);
    ctx.lineTo(x, canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#d8dde2";
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let screenX = 0; screenX <= canvas.width + 20; screenX += 18) {
    const worldX = camera.x + screenX;
    ctx.lineTo(screenX, groundAt(worldX));
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
  ctx.lineWidth = 2;
  for (let screenX = 80; screenX < canvas.width; screenX += 240) {
    const worldX = camera.x + screenX;
    ctx.beginPath();
    ctx.ellipse(screenX, groundAt(worldX) + 14, 28, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  locations.forEach((location) => {
    const x = location.x - camera.x;
    if (x < -120 || x > canvas.width + 120) {
      return;
    }

    const baseY = groundAt(location.x);
    ctx.save();
    ctx.translate(x, baseY);

    if (location.kind === "lander") {
      ctx.fillStyle = "#8bd7ff";
      ctx.fillRect(-18, -location.height, 36, 44);
      ctx.fillStyle = "#cfd8e4";
      ctx.beginPath();
      ctx.moveTo(-22, -36);
      ctx.lineTo(0, -location.height - 18);
      ctx.lineTo(22, -36);
      ctx.closePath();
      ctx.fill();
    } else if (location.kind === "dome") {
      ctx.fillStyle = "#82e9ff";
      ctx.beginPath();
      ctx.arc(0, -10, 34, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-34, -10, 68, 16);
    } else if (location.kind === "lab") {
      ctx.fillStyle = "#7effb7";
      ctx.fillRect(-34, -location.height + 18, 68, 48);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(-22, -location.height + 28, 44, 18);
    } else {
      ctx.fillStyle = "#ffd36e";
      ctx.fillRect(-30, -location.height + 14, 60, 52);
      ctx.fillStyle = "#182738";
      ctx.fillRect(-16, -location.height + 26, 32, 20);
    }

    ctx.fillStyle = "#f5fbff";
    ctx.font = "12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(location.name, 0, -location.height - 22);
    ctx.restore();
  });

  pickups.forEach((pickup) => {
    const x = pickup.x - camera.x;
    const y = pickup.baseY + Math.sin(pickup.bob) * 8;
    if (x < -40 || x > canvas.width + 40) {
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(0, 0, pickup.radius + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pickup.color;
    ctx.beginPath();
    ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
    ctx.fill();

    if (pickup.kind === "coin") {
      ctx.strokeStyle = "rgba(255, 239, 183, 0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, pickup.radius - 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#09111b";
    ctx.font = "bold 12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(pickup.kind === "coin" ? "$" : pickup.kind[0].toUpperCase(), 0, 4);
    ctx.restore();
  });
}

function drawInterior() {
  const location = activeLocation();
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#07111d");
  bg.addColorStop(1, location.interiorAccent);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = -1; i <= Math.ceil(INTERIOR_WIDTH / 220); i += 1) {
    const x = i * 220 - camera.x * 0.55;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + 80, 90, 58, 260);
    ctx.fillRect(x + 150, 90, 22, 260);
  }

  ctx.fillStyle = location.interiorTone;
  ctx.fillRect(0, canvas.height - 150, canvas.width, 26);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 5; i += 1) {
    const x = 180 + i * 380 - camera.x;
    ctx.fillRect(x, 128, 180, 92);
    ctx.fillRect(x + 30, 270, 120, 56);
  }

  ctx.fillStyle = "#eff7ff";
  ctx.font = "700 32px Orbitron";
  ctx.fillText(location.interiorTitle, 96, 84);
  ctx.font = "18px Space Grotesk";
  ctx.fillStyle = "#d8ebff";
  ctx.fillText(location.description, 96, 110);
  ctx.fillText("Press E or Use to return to the surface.", 96, 140);

  interiorLoots.forEach((item) => {
    if (item.collected) {
      return;
    }

    const x = item.x - camera.x;
    if (x < -80 || x > canvas.width + 80) {
      return;
    }

    if (item.kind === "chest") {
      ctx.fillStyle = "#c98d3b";
      ctx.fillRect(x, item.y, item.width, item.height);
      ctx.fillStyle = "#6b4218";
      ctx.fillRect(x, item.y + 8, item.width, 8);
      ctx.fillStyle = "#ffe18a";
      ctx.fillRect(x + 16, item.y + 8, 10, 16);
    } else if (item.kind === "weapon") {
      ctx.fillStyle = "#ff8f7e";
      ctx.fillRect(x + 2, item.y + 12, item.width - 4, 8);
      ctx.fillStyle = "#cfd7e7";
      ctx.fillRect(x + 18, item.y, 6, 24);
      ctx.fillStyle = "#82e9ff";
      ctx.fillRect(x, item.y + 20, item.width, 4);
    } else {
      ctx.fillStyle = item.kind === "food" ? "#7effb7" : "#8bb6ff";
      ctx.beginPath();
      ctx.arc(x + 14, item.y + 14, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#eff7ff";
    ctx.font = "12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(item.kind === "weapon" ? "Blaster" : item.kind === "chest" ? "Chest" : item.kind, x + item.width / 2, item.y - 10);
    ctx.textAlign = "left";
  });
}

function drawPlayer() {
  const px = player.x - camera.x;
  const py = player.y;

  ctx.save();
  ctx.translate(px, py);
  if (player.facing === -1) {
    ctx.translate(player.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(8, 12, 18, 28);
  ctx.fillStyle = "#94dcff";
  ctx.fillRect(10, 14, 14, 12);
  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 18, 8, 10);
  ctx.fillRect(26, 18, 8, 10);
  ctx.fillRect(8, 40, 8, 12);
  ctx.fillRect(18, 40, 8, 12);
  ctx.beginPath();
  ctx.arc(17, 8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1626";
  ctx.fillRect(10, 4, 14, 8);

  if (!player.onGround) {
    ctx.fillStyle = "rgba(130, 233, 255, 0.75)";
    ctx.beginPath();
    ctx.moveTo(10, 52);
    ctx.lineTo(14, 64);
    ctx.lineTo(18, 52);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, 52);
    ctx.lineTo(22, 64);
    ctx.lineTo(26, 52);
    ctx.fill();
  }
  ctx.restore();
}

function drawMeter(x, y, width, height, ratio, color, label) {
  ctx.fillStyle = "#bcd3e7";
  ctx.font = "12px Space Grotesk";
  ctx.fillText(label, x, y - 4);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * clamp(ratio, 0, 1), height);
}

function drawOverlay() {
  const areaName =
    game.currentArea === "surface" ? zoneForX(player.x).name : activeLocation().interiorTitle;
  const progress = Math.min(1, game.elapsed / game.cycleLength);
  const hudX = 28;
  const hudY = 84;

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(28, 26, 220, 14);
  ctx.fillStyle = "#82e9ff";
  ctx.fillRect(28, 26, 220 * progress, 14);
  ctx.fillStyle = "#eff7ff";
  ctx.font = "14px Space Grotesk";
  ctx.fillText("Daylight Window", 28, 20);
  ctx.fillText(areaName, 28, 64);

  ctx.fillStyle = "rgba(6, 12, 21, 0.78)";
  ctx.fillRect(hudX, hudY, 290, 164);
  ctx.strokeStyle = "rgba(130, 233, 255, 0.18)";
  ctx.strokeRect(hudX, hudY, 290, 164);
  ctx.fillStyle = "#82e9ff";
  ctx.font = "700 18px Orbitron";
  ctx.fillText("Moon Drifter", hudX + 14, hudY + 24);
  ctx.fillStyle = "#eff7ff";
  ctx.font = "14px Space Grotesk";
  ctx.fillText(`Day ${game.day}`, hudX + 14, hudY + 48);
  ctx.fillText(`Score ${Math.floor(game.score)}`, hudX + 110, hudY + 48);
  ctx.fillText(`Coins ${game.inventory.coins}`, hudX + 208, hudY + 48);
  ctx.fillText(`Area ${game.currentArea === "surface" ? "Moon" : "Inside"}`, hudX + 14, hudY + 70);
  ctx.fillText(`Weapons ${game.inventory.weapons}`, hudX + 154, hudY + 70);
  ctx.fillText(`Food ${game.inventory.food}`, hudX + 14, hudY + 148);
  ctx.fillText(`Ore ${game.inventory.ore}`, hudX + 84, hudY + 148);
  ctx.fillText(`Ice ${game.inventory.ice}`, hudX + 148, hudY + 148);
  ctx.fillText(`Parts ${game.inventory.parts}`, hudX + 208, hudY + 148);

  drawMeter(hudX + 14, hudY + 90, 250, 10, game.oxygen / 100, "#82e9ff", "Oxygen");
  drawMeter(hudX + 14, hudY + 114, 250, 10, game.hunger / 100, "#ffd36e", "Hunger");
  drawMeter(hudX + 14, hudY + 138, 250, 10, game.energy / 100, "#90b7ff", "Energy");

  const logWidth = 332;
  const logHeight = 102;
  const logX = canvas.width - logWidth - 28;
  const logY = 58;
  ctx.fillStyle = "rgba(6, 12, 21, 0.72)";
  ctx.fillRect(logX, logY, logWidth, logHeight);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(logX, logY, logWidth, logHeight);
  ctx.fillStyle = "#eff7ff";
  ctx.font = "14px Space Grotesk";
  ctx.fillText("Mission Log", logX + 14, logY + 20);
  ctx.fillStyle = "#d8ebff";
  game.log.slice(0, 4).forEach((entry, index) => {
    ctx.fillText(entry, logX + 14, logY + 42 + index * 18, logWidth - 26);
  });

  if (game.currentArea === "surface") {
    const minimapX = 710;
    const minimapY = 28;
    const minimapWidth = 220;
    const playerMapX = minimapX + (player.x / SURFACE_WIDTH) * minimapWidth;
    const viewWidth = (canvas.width / SURFACE_WIDTH) * minimapWidth;
    ctx.fillStyle = "rgba(9, 18, 31, 0.82)";
    ctx.fillRect(minimapX, minimapY, minimapWidth, 18);
    ctx.fillStyle = "rgba(130, 233, 255, 0.28)";
    ctx.fillRect(minimapX + (camera.x / SURFACE_WIDTH) * minimapWidth, minimapY, viewWidth, 18);
    ctx.fillStyle = "#ffd36e";
    ctx.fillRect(playerMapX - 2, minimapY - 2, 4, 22);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(minimapX, minimapY, minimapWidth, 18);
  }

  const nearbyLocation = nearestLocation();
  if (!game.gameOver && nearbyLocation) {
    const prompt =
      nearbyLocation.type === "exit"
        ? "Press E or Use to return outside"
        : `Press E or Use to enter ${nearbyLocation.name}`;
    ctx.fillStyle = "rgba(6, 12, 21, 0.82)";
    ctx.fillRect(canvas.width / 2 - 170, canvas.height - 74, 340, 38);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(canvas.width / 2 - 170, canvas.height - 74, 340, 38);
    ctx.fillStyle = "#eff7ff";
    ctx.font = "15px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(prompt, canvas.width / 2, canvas.height - 49);
    ctx.textAlign = "left";
  }

  if (game.gameOver) {
    ctx.fillStyle = "rgba(4, 8, 16, 0.68)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 44px Orbitron";
    ctx.fillText("Mission Lost", canvas.width / 2, 210);
    ctx.font = "22px Space Grotesk";
    ctx.fillText(
      "Oxygen, hunger, or energy hit zero before the mission stabilized.",
      canvas.width / 2,
      258,
    );
    ctx.textAlign = "left";
  }
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (game.currentArea === "surface") {
    drawSurface();
  } else {
    drawInterior();
  }
  drawPlayer();
  drawOverlay();
}

let lastTime = performance.now();
function frame(now) {
  const delta = Math.min(32, now - lastTime);
  lastTime = now;

  if (!game.gameOver) {
    updatePlayer(delta);
    updatePickups(delta);
    autoCollectNearby();
    autoCollectInteriorLoot();
    updateCamera(delta);
    updateSurvival(delta);
    discoverZone();
  } else {
    updateCamera(delta);
  }

  drawScene();
  updateUI();
  requestAnimationFrame(frame);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["a", "d", "w", "e", "r", " ", "arrowleft", "arrowright", "arrowup"].includes(key)) {
    event.preventDefault();
  }
  keys.add(key);

  if ((key === "w" || key === "arrowup" || key === " ") && player.onGround && !game.gameOver) {
    player.vy = player.jumpPower;
    player.onGround = false;
  }
  if (key === "e") {
    useContextAction();
  }
  if (key === "r") {
    eatFood();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
  if (event.key === "Escape") {
    closeSettings();
  }
});

ui.restartButton.addEventListener("click", restartGame);
ui.settingsButton.addEventListener("click", openSettings);
ui.closeSettingsButton.addEventListener("click", closeSettings);
ui.settingsModal.addEventListener("click", (event) => {
  if (event.target === ui.settingsModal) {
    closeSettings();
  }
});

function setTouchMove(control, active) {
  const mapping = {
    left: ["a", "arrowleft"],
    right: ["d", "arrowright"],
  };
  const keysForControl = mapping[control] ?? [];
  keysForControl.forEach((key) => {
    if (active) {
      keys.add(key);
    } else {
      keys.delete(key);
    }
  });
}

function bindTouchHold(button, control) {
  const start = (event) => {
    event.preventDefault();
    setTouchMove(control, true);
  };
  const end = (event) => {
    event.preventDefault();
    setTouchMove(control, false);
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointerleave", end);
  button.addEventListener("pointercancel", end);
}

function bindTouchAction(button, action) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (action === "jump" && player.onGround && !game.gameOver) {
      player.vy = player.jumpPower;
      player.onGround = false;
    } else if (action === "use") {
      useContextAction();
    } else if (action === "eat") {
      eatFood();
    }
  });
}

document.querySelectorAll("[data-touch-control]").forEach((button) => {
  bindTouchHold(button, button.dataset.touchControl);
});

document.querySelectorAll("[data-touch-action]").forEach((button) => {
  bindTouchAction(button, button.dataset.touchAction);
});

seedWorld();
updateUI();
requestAnimationFrame(frame);
