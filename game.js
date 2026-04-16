const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  day: document.getElementById("dayCount"),
  score: document.getElementById("scoreCount"),
  structures: document.getElementById("structureCount"),
  food: document.getElementById("foodCount"),
  ore: document.getElementById("oreCount"),
  ice: document.getElementById("iceCount"),
  parts: document.getElementById("partsCount"),
  oxygenBar: document.getElementById("oxygenBar"),
  hungerBar: document.getElementById("hungerBar"),
  energyBar: document.getElementById("energyBar"),
  log: document.getElementById("messageLog"),
};

const world = {
  width: 5200,
  height: canvas.height,
};

const keys = new Set();
const structures = [];
const pickups = [];
const discoveredZones = new Set();

const stars = Array.from({ length: 180 }, () => ({
  x: Math.random() * world.width,
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
  { start: 4520, end: world.width, name: "Signal Wall" },
];

const landmarks = [
  { x: 360, name: "Lander", height: 78, kind: "lander" },
  { x: 1260, name: "Crater Arch", height: 62, kind: "arch" },
  { x: 2140, name: "Solar Wreck", height: 54, kind: "wreck" },
  { x: 3180, name: "Ice Spires", height: 88, kind: "ice" },
  { x: 4300, name: "Beacon Ridge", height: 112, kind: "beacon" },
];

const camera = {
  x: 0,
};

const player = {
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

const game = {
  oxygen: 100,
  hunger: 100,
  energy: 100,
  day: 1,
  score: 0,
  elapsed: 0,
  cycleLength: 36,
  oxygenAssistCooldown: 0,
  gameOver: false,
  win: false,
  inventory: {
    food: 2,
    ore: 0,
    ice: 0,
    parts: 0,
  },
  log: [],
};

const recipes = {
  dome: {
    label: "Dome",
    cost: { ore: 4, ice: 3, parts: 2 },
    color: "#82e9ff",
    bonus() {
      game.oxygen = Math.min(100, game.oxygen + 28);
      game.score += 90;
    },
  },
  farm: {
    label: "Hydro Farm",
    cost: { ore: 2, ice: 4, parts: 1 },
    color: "#7effb7",
    bonus() {
      game.inventory.food += 3;
      game.score += 80;
    },
  },
  recycler: {
    label: "Recycler",
    cost: { ore: 3, ice: 1, parts: 4 },
    color: "#ffd36e",
    bonus() {
      game.energy = Math.min(100, game.energy + 30);
      game.score += 100;
    },
  },
};

function pushLog(text) {
  game.log.unshift(text);
  game.log = game.log.slice(0, 5);
  ui.log.innerHTML = game.log.map((entry) => `<p>${entry}</p>`).join("");
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function groundAt(x) {
  const rolling = 14 * Math.sin(x * 0.0032);
  const medium = 28 * Math.sin(x * 0.0011 + 1.3);
  const basin = 16 * Math.sin(x * 0.0067 + 0.7);
  return world.height - 104 + rolling + medium + basin;
}

function zoneForX(x) {
  return zones.find((zone) => x >= zone.start && x < zone.end) ?? zones[zones.length - 1];
}

function spawnPickup(kind, xHint) {
  const definitions = {
    food: { color: "#ffb36a", radius: 13 },
    ore: { color: "#8bb6ff", radius: 11 },
    ice: { color: "#c7f6ff", radius: 12 },
    parts: { color: "#ffe18a", radius: 10 },
  };

  const weighted = ["food", "ore", "ore", "ice", "parts"];
  const type = kind ?? weighted[Math.floor(Math.random() * weighted.length)];
  const def = definitions[type];
  const x = clamp(xHint ?? randomRange(120, world.width - 120), 80, world.width - 80);
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
  fillRegion(160, 1000, 8);
  fillRegion(1000, 2200, 8);
  fillRegion(2200, 3400, 8);
  fillRegion(3400, 5040, 10);

  player.y = groundAt(player.x) - player.height;
  pushLog("Mission started. Explore the surface and build a survivable moon base.");
  discoverZone();
}

function updateUI() {
  ui.day.textContent = game.day;
  ui.score.textContent = Math.floor(game.score);
  ui.structures.textContent = structures.length;
  ui.food.textContent = game.inventory.food;
  ui.ore.textContent = game.inventory.ore;
  ui.ice.textContent = game.inventory.ice;
  ui.parts.textContent = game.inventory.parts;
  ui.oxygenBar.style.width = `${game.oxygen}%`;
  ui.hungerBar.style.width = `${game.hunger}%`;
  ui.energyBar.style.width = `${game.energy}%`;
}

function canAfford(cost) {
  return Object.entries(cost).every(([key, value]) => game.inventory[key] >= value);
}

function spend(cost) {
  Object.entries(cost).forEach(([key, value]) => {
    game.inventory[key] -= value;
  });
}

function nearbyStructureCount(type) {
  return structures.filter((item) => item.type === type).length;
}

function build(type) {
  if (game.gameOver) {
    return;
  }

  const recipe = recipes[type];
  if (!canAfford(recipe.cost)) {
    pushLog(`Not enough resources for ${recipe.label}.`);
    return;
  }

  spend(recipe.cost);
  structures.push({
    type,
    label: recipe.label,
    x: clamp(player.x + player.facing * 56, 50, world.width - 50),
    y: groundAt(player.x) - 12,
    color: recipe.color,
  });
  recipe.bonus();
  game.score += 30;
  pushLog(`${recipe.label} deployed in ${zoneForX(player.x).name}.`);

  if (structures.length >= 6) {
    game.win = true;
    game.gameOver = true;
    pushLog("Moon base stabilized. Rescue signal sent.");
  }
}

function collectNearby() {
  if (game.gameOver) {
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
      game.inventory[pickup.kind] += 1;
      game.score += 15;
      if (pickup.kind === "ice") {
        game.oxygen = Math.min(100, game.oxygen + 14);
        oxygenRecovered += 14;
      }
      pickups.splice(i, 1);
      collected += 1;
    }
  }

  if (collected > 0) {
    if (oxygenRecovered > 0) {
      pushLog(
        `Collected ${collected} supply ${
          collected === 1 ? "crate" : "crates"
        }. Ice converted into ${oxygenRecovered}% oxygen.`,
      );
    } else {
      pushLog(`Collected ${collected} supply ${collected === 1 ? "crate" : "crates"}.`);
    }
    while (pickups.length < 34) {
      spawnPickup();
    }
  } else {
    pushLog("No supplies close enough. Move closer to the floating crates.");
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
  const zone = zoneForX(player.x);
  if (!discoveredZones.has(zone.name)) {
    discoveredZones.add(zone.name);
    game.score += 40;
    pushLog(`New area discovered: ${zone.name}.`);
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
  player.x = clamp(player.x, 16, world.width - player.width - 16);

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
  const dt = delta / 16.67;
  pickups.forEach((pickup) => {
    pickup.bob += 0.04 * dt;
    pickup.x += pickup.drift * dt;

    if (pickup.x < 80 || pickup.x > world.width - 80) {
      pickup.drift *= -1;
    }

    const zoneGround = groundAt(pickup.x);
    pickup.baseY = clamp(pickup.baseY, zoneGround - 190, zoneGround - 84);
  });
}

function updateCamera(delta) {
  const dt = delta / 16.67;
  const targetX = clamp(
    player.x + player.width / 2 - canvas.width * 0.42,
    0,
    world.width - canvas.width,
  );
  camera.x += (targetX - camera.x) * Math.min(1, 0.08 * dt + 0.04);
}

function updateSurvival(delta) {
  const factor = delta / 16.67;
  game.elapsed += delta / 1000;
  game.oxygenAssistCooldown = Math.max(0, game.oxygenAssistCooldown - delta / 1000);
  if (game.elapsed >= game.cycleLength) {
    game.elapsed = 0;
    game.day += 1;
    spawnPickup("parts", clamp(player.x + randomRange(-320, 320), 120, world.width - 120));
    pushLog(`Day ${game.day} begins. Fresh debris fell near your route.`);
  }

  const domeCount = nearbyStructureCount("dome");
  const farmCount = nearbyStructureCount("farm");
  const recyclerCount = nearbyStructureCount("recycler");

  game.oxygen -= (0.048 - domeCount * 0.01) * factor;
  game.hunger -= (0.068 - farmCount * 0.01) * factor;
  game.energy -= (0.052 - recyclerCount * 0.008) * factor;

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
    game.win = false;
    pushLog("Vitals collapsed. The moon outlasted the mission.");
  }
}

function drawStars() {
  stars.forEach((star) => {
    const x = (star.x - camera.x * 0.18 + world.width) % world.width;
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

function drawSky() {
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
}

function drawTerrain() {
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
}

function drawLandmarks() {
  landmarks.forEach((landmark) => {
    const x = landmark.x - camera.x;
    if (x < -120 || x > canvas.width + 120) {
      return;
    }

    const baseY = groundAt(landmark.x);
    ctx.save();
    ctx.translate(x, baseY);

    if (landmark.kind === "lander") {
      ctx.fillStyle = "#8bd7ff";
      ctx.fillRect(-18, -landmark.height, 36, 44);
      ctx.fillStyle = "#cfd8e4";
      ctx.beginPath();
      ctx.moveTo(-22, -36);
      ctx.lineTo(0, -landmark.height - 18);
      ctx.lineTo(22, -36);
      ctx.closePath();
      ctx.fill();
    } else if (landmark.kind === "arch") {
      ctx.strokeStyle = "#bec8d5";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(0, -8, 34, Math.PI, 0);
      ctx.stroke();
    } else if (landmark.kind === "wreck") {
      ctx.fillStyle = "#ffd36e";
      ctx.fillRect(-26, -30, 52, 12);
      ctx.fillStyle = "#687a93";
      ctx.fillRect(-12, -landmark.height, 24, 62);
    } else if (landmark.kind === "ice") {
      ctx.fillStyle = "#c9fbff";
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 16, 0);
        ctx.lineTo(i * 16 + 12, -landmark.height + Math.abs(i) * 24);
        ctx.lineTo(i * 16 + 24, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#ffe18a";
      ctx.fillRect(-6, -landmark.height, 12, landmark.height);
      ctx.beginPath();
      ctx.arc(0, -landmark.height, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#eff7ff";
    ctx.font = "12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(landmark.name, 0, -landmark.height - 28);
    ctx.restore();
  });
}

function drawPickups() {
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

    ctx.fillStyle = "#09111b";
    ctx.font = "bold 12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(pickup.kind[0].toUpperCase(), 0, 4);
    ctx.restore();
  });
}

function drawStructures() {
  structures.forEach((structure) => {
    const x = structure.x - camera.x;
    if (x < -80 || x > canvas.width + 80) {
      return;
    }

    ctx.save();
    ctx.translate(x, structure.y);
    ctx.fillStyle = structure.color;

    if (structure.type === "dome") {
      ctx.beginPath();
      ctx.arc(0, 0, 28, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-28, 0, 56, 14);
    } else if (structure.type === "farm") {
      ctx.fillRect(-28, -22, 56, 34);
      ctx.fillStyle = "rgba(126, 255, 183, 0.35)";
      ctx.fillRect(-20, -14, 40, 18);
    } else {
      ctx.fillRect(-24, -24, 48, 40);
      ctx.fillStyle = "#182738";
      ctx.fillRect(-14, -14, 28, 20);
    }

    ctx.fillStyle = "#f5fbff";
    ctx.font = "12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(structure.label, 0, -38);
    ctx.restore();
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

function drawOverlay() {
  const progress = Math.min(1, game.elapsed / game.cycleLength);
  const zone = zoneForX(player.x);
  const minimapX = 710;
  const minimapY = 28;
  const minimapWidth = 220;
  const playerMapX = minimapX + (player.x / world.width) * minimapWidth;
  const viewWidth = (canvas.width / world.width) * minimapWidth;

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(28, 26, 220, 14);
  ctx.fillStyle = "#82e9ff";
  ctx.fillRect(28, 26, 220 * progress, 14);
  ctx.fillStyle = "#eff7ff";
  ctx.font = "14px Space Grotesk";
  ctx.fillText("Daylight Window", 28, 20);
  ctx.fillText(zone.name, 28, 64);

  ctx.fillStyle = "rgba(9, 18, 31, 0.82)";
  ctx.fillRect(minimapX, minimapY, minimapWidth, 18);
  ctx.fillStyle = "rgba(130, 233, 255, 0.28)";
  ctx.fillRect(
    minimapX + (camera.x / world.width) * minimapWidth,
    minimapY,
    viewWidth,
    18,
  );
  ctx.fillStyle = "#ffd36e";
  ctx.fillRect(playerMapX - 2, minimapY - 2, 4, 22);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(minimapX, minimapY, minimapWidth, 18);

  if (game.gameOver) {
    ctx.fillStyle = "rgba(4, 8, 16, 0.68)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 44px Orbitron";
    ctx.fillText(game.win ? "Base Secured" : "Mission Lost", canvas.width / 2, 210);
    ctx.font = "22px Space Grotesk";
    ctx.fillText(
      game.win
        ? "You built enough infrastructure to survive the moon."
        : "Oxygen, hunger, or energy hit zero before the base was ready.",
      canvas.width / 2,
      258,
    );
    ctx.font = "18px Space Grotesk";
    ctx.fillText("Refresh the page to launch a new run.", canvas.width / 2, 300);
    ctx.textAlign = "left";
  }
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky();
  drawTerrain();
  drawLandmarks();
  drawStructures();
  drawPickups();
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
    collectNearby();
  }
  if (key === "r") {
    eatFood();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

document.getElementById("buildDome").addEventListener("click", () => build("dome"));
document.getElementById("buildFarm").addEventListener("click", () => build("farm"));
document.getElementById("buildRecycler").addEventListener("click", () => build("recycler"));

seedWorld();
updateUI();
requestAnimationFrame(frame);
