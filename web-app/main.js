import * as Game from "./game.js";

// Data files loaded before the match starts.
const DATA_FILES = {
  characters: "./assets/data/characters.json",
  skills: "./assets/data/skills.json",
  map: "./assets/data/map1.json"
};

// Page state only, rules stay in game.js.
let gameConfig = null;
let gameState = null;
let enemyTurnTimer = null;
let pendingDashSkillId = null;
let skillBannerTimer = null;
let activeMovementAnimations = new Map();

const page = getPageElements();

// Expose the module for browser console checking.
window.Game = Game;

startApp();

function getPageElements() {
  // All page elements collected here.
  return {
    grid: document.querySelector("#gameGrid"),
    resultBanner: document.querySelector("#resultBanner"),
    resultTitle: document.querySelector("#resultTitle"),
    skillLearnedBanner: document.querySelector("#skillLearnedBanner"),
    skillLearnedTitle: document.querySelector("#skillLearnedTitle"),
    turnText: document.querySelector("#turnText"),
    hintText: document.querySelector("#hintText"),
    endTurnButton: document.querySelector("#endTurnButton"),
    resetButton: document.querySelector("#resetButton"),
    replayButton: document.querySelector("#replayButton"),
    attackButton: document.querySelector("#attackButton"),
    qiStepButton: document.querySelector("#qiStepButton"),
    guardButton: document.querySelector("#guardButton"),
    playerHealthBar: document.querySelector("#playerHealthBar"),
    playerHealthText: document.querySelector("#playerHealthText"),
    enemyHealthBar: document.querySelector("#enemyHealthBar"),
    enemyHealthText: document.querySelector("#enemyHealthText"),
    battleLog: document.querySelector("#battleLog"),
    learnedSkillButtons: document.querySelector("#learnedSkillButtons"),
    errorMessage: document.querySelector("#errorMessage")
  };
}

async function startApp() {
  try {
    // Button clicks linked to game actions.
    page.resetButton.addEventListener("click", resetGame);
    page.replayButton.addEventListener("click", resetGame);
    page.endTurnButton.addEventListener("click", endPlayerTurn);
    page.attackButton.addEventListener("click", useSwordSlash);
    page.qiStepButton.addEventListener("click", useQiStep);
    page.guardButton.addEventListener("click", useInnerGuard);

    gameConfig = await loadGameData();
    gameState = Game.createInitialState(gameConfig);
    // Debug copy in browser console.
    window.gameState = gameState;
    render();
  } catch (error) {
    showError(`Could not load game data: ${error.message}`);
  }
}

async function loadGameData() {
  // Load all JSON files together.
  const [characters, skills, map] = await Promise.all([
    fetchJson(DATA_FILES.characters),
    fetchJson(DATA_FILES.skills),
    fetchJson(DATA_FILES.map)
  ]);

  return {
    characters,
    skills,
    map,
    randomSpawns: true
  };
}

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response.json();
}

function showError(message) {
  // Stop play when data loading fails.
  page.errorMessage.textContent = message;
  page.errorMessage.classList.remove("hidden");
  page.endTurnButton.disabled = true;
  page.resetButton.disabled = true;
  page.attackButton.disabled = true;
  page.qiStepButton.disabled = true;
  page.guardButton.disabled = true;
  page.learnedSkillButtons.innerHTML = "";
}

function render() {
  // Render board and side interface.
  renderGrid();
  renderInterface();
  window.gameState = gameState;
}

function renderGrid() {
  // Build the 10x10 grid from current state.
  page.grid.innerHTML = "";
  const boardSize = Game.getBoardSize(gameState);
  const player = Game.getPlayer(gameState);
  const reachableCells = pendingDashSkillId === null
    ? Game.getReachableCells(gameState, player.id)
    : getDashCells(Game.getUnlockedSkills(gameState).find((skill) => skill.id === pendingDashSkillId));

  for (let y = 0; y < boardSize.height; y += 1) {
    for (let x = 0; x < boardSize.width; x += 1) {
      const cell = document.createElement("button");
      const tile = Game.getCell(gameState, x, y);
      const unit = getUnitAt(x, y);
      const reachable = isReachableCell(reachableCells, x, y);

      // Grid button for double-click movement.
      cell.type = "button";
      cell.className = `cell ${tile.type}${reachable ? " reachable" : ""}`;
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute("aria-label", `grid cell ${x + 1}, ${y + 1}`);
      cell.addEventListener("dblclick", () => movePlayer(x, y));

      if (unit !== null) {
        cell.appendChild(makeUnitToken(unit));
      }

      page.grid.appendChild(cell);
    }
  }
}

function getUnitAt(x, y) {
  // Living unit on this square.
  const characters = [Game.getPlayer(gameState), ...Game.getEnemies(gameState)];
  return characters.find((character) => {
    return !character.defeated && character.position.x === x && character.position.y === y;
  }) || null;
}

function isReachableCell(reachableCells, x, y) {
  // Valid movement highlight.
  return !Game.isGameOver(gameState) && Game.getCurrentTurn(gameState) === "player"
    && !Game.getPlayer(gameState).hasMoved
    && reachableCells.some((cell) => cell.x === x && cell.y === y);
}

function makeUnitToken(unit) {
  // Board token for one character.
  const token = document.createElement("span");
  token.className = `unit ${unit.team}`;
  token.dataset.characterId = unit.id;
  token.title = unit.name;

  if (unit.image) {
    // Image first, icon fallback.
    const image = document.createElement("img");
    image.className = "unit-sprite";
    image.src = unit.image;
    image.alt = unit.name;
    token.classList.add("unit-image-token");
    token.appendChild(image);
  } else {
    token.textContent = unit.icon;
  }

  const movement = activeMovementAnimations.get(unit.id);
  if (movement) {
    // Slide from old cell to new cell.
    token.classList.add("unit-moving");
    token.style.setProperty("--move-x", `${movement.offsetX * 133.333}%`);
    token.style.setProperty("--move-y", `${movement.offsetY * 133.333}%`);
  }

  token.appendChild(makeUnitHealthBar(unit));

  return token;
}

function makeUnitHealthBar(unit) {
  // HP bar shared by player and enemies.
  const hpBar = document.createElement("span");
  const hpFill = document.createElement("span");
  const hpPercent = Math.max(0, (unit.hp / unit.maxHp) * 100);

  hpBar.className = `unit-hp-bar ${unit.team}-hp-bar`;
  hpFill.className = `unit-hp-fill ${unit.team}-hp-fill`;
  hpFill.style.width = `${hpPercent}%`;
  hpBar.appendChild(hpFill);

  return hpBar;
}

function renderInterface() {
  // Refresh buttons, health bars, banners, skills and log.
  const winner = Game.getWinner(gameState);
  const player = Game.getPlayer(gameState);
  const enemies = Game.getEnemies(gameState);
  const livingEnemies = enemies.filter((enemy) => !enemy.defeated);
  const playerCanAct = Game.getCurrentTurn(gameState) === "player" && !player.hasActed && !winner;
  const playerCanBoostMove = playerCanAct && !player.hasMoved;

  page.turnText.textContent = Game.getCurrentTurn(gameState) === "player" ? "Player turn" : "Enemy turn";
  page.endTurnButton.disabled = Boolean(winner) || Game.getCurrentTurn(gameState) !== "player";
  page.attackButton.disabled = !playerCanAct || getAdjacentEnemy() === null;
  page.qiStepButton.disabled = !playerCanBoostMove || player.statuses.movementBonus > 0;
  page.guardButton.disabled = !playerCanAct;
  page.hintText.textContent = pendingDashSkillId === null
    ? "Double-click a highlighted square to move up to 4 cells. End your turn to let the enemy act."
    : "Shadow Step: double-click a highlighted square to dash there.";

  updateHealth(page.playerHealthBar, page.playerHealthText, player);
  updateEnemyHealth(enemies, livingEnemies);
  updateResultBanner(winner);
  renderLearnedSkillButtons(playerCanAct);

  page.battleLog.innerHTML = gameState.log
    .slice(-8)
    .map((message) => `<li>${message}</li>`)
    .join("");
}

function updateHealth(bar, text, character) {
  const percentage = Math.max(0, (character.hp / character.maxHp) * 100);
  bar.style.width = `${percentage}%`;
  text.textContent = `HP ${character.hp} / ${character.maxHp}`;
}

function updateEnemyHealth(enemies, livingEnemies) {
  const enemyHealth = livingEnemies.reduce((total, enemy) => total + enemy.hp, 0);
  const enemyMaxHealth = enemies.reduce((total, enemy) => total + enemy.maxHp, 0);
  const percentage = enemyMaxHealth === 0 ? 0 : Math.max(0, (enemyHealth / enemyMaxHealth) * 100);

  page.enemyHealthBar.style.width = `${percentage}%`;
  page.enemyHealthText.textContent = `HP ${enemyHealth} / ${enemyMaxHealth} (${livingEnemies.length} left)`;
}

function updateResultBanner(winner) {
  page.resultBanner.classList.toggle("hidden", winner === null);
  page.resultBanner.classList.toggle("defeated", winner === "enemy");
  page.resultTitle.textContent = winner === "enemy" ? "Defeated" : "Victory";
}

function renderLearnedSkillButtons(playerCanAct) {
  // Extra unlocked skills only.
  const baseSkillIds = ["sword_slash", "qi_step", "inner_guard"];
  const learnedSkills = Game.getUnlockedSkills(gameState).filter((skill) => !baseSkillIds.includes(skill.id));
  page.learnedSkillButtons.innerHTML = "";

  learnedSkills.forEach((skill) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = getSkillButtonLabel(skill);
    button.title = skill.description;
    button.disabled = !canUseLearnedSkill(skill, playerCanAct);
    button.addEventListener("click", () => useLearnedSkill(skill));
    page.learnedSkillButtons.appendChild(button);
  });
}

function getSkillButtonLabel(skill) {
  const labels = {
    crescent_cut: "🌙 Crescent Cut",
    piercing_thrust: "🗡️ Piercing Thrust",
    flowing_counter: "↩️ Flowing Counter",
    shadow_step: "🌑 Shadow Step",
    dragon_palm: "🐉 Dragon Palm"
  };

  return labels[skill.id] || skill.name;
}

function canUseLearnedSkill(skill, playerCanAct) {
  const player = Game.getPlayer(gameState);

  // Shadow Step uses movement.
  if (skill.type === "dash") {
    return Game.getCurrentTurn(gameState) === "player" && !player.hasMoved;
  }

  if (!playerCanAct) {
    return false;
  }

  if (skill.type === "adjacent_area") {
    return getEnemiesInRange(1).length > 0;
  }

  if (skill.type === "piercing") {
    return getEnemiesInRange(skill.range).length > 0;
  }

  if (skill.type === "ranged_damage") {
    return getEnemiesInRange(skill.range).length > 0;
  }

  return true;
}

function movePlayer(x, y) {
  if (Game.getCurrentTurn(gameState) !== "player") {
    return;
  }

  if (pendingDashSkillId !== null) {
    // Next double click is Shadow Step target.
    const nextState = Game.useSkill(gameState, "player", pendingDashSkillId, { x, y });
    pendingDashSkillId = null;
    updateState(nextState);
    return;
  }

  const nextState = Game.moveCharacter(gameState, "player", x, y);
  updateState(nextState);
}

function useSwordSlash() {
  const target = getAdjacentEnemy();

  if (target === null) {
    return;
  }

  updateState(Game.useSkill(gameState, "player", "sword_slash", { characterId: target.id }));
}

function useQiStep() {
  updateState(Game.useSkill(gameState, "player", "qi_step"));
}

function useInnerGuard() {
  updateState(Game.useSkill(gameState, "player", "inner_guard"));
}

function useLearnedSkill(skill) {
  if (skill.type === "dash") {
    // Wait for dash target.
    pendingDashSkillId = skill.id;
    render();
    return;
  }

  if (skill.type === "adjacent_area" || skill.type === "counter") {
    updateState(Game.useSkill(gameState, "player", skill.id));
    return;
  }

  const target = getEnemiesInRange(skill.range)[0];

  if (target !== undefined) {
    updateState(Game.useSkill(gameState, "player", skill.id, { characterId: target.id }));
  }
}

function endPlayerTurn() {
  if (Game.isGameOver(gameState)) {
    return;
  }

  pendingDashSkillId = null;
  updateState(Game.endTurn(gameState));
  // Small delay before enemy actions.
  enemyTurnTimer = window.setTimeout(() => {
    enemyTurnTimer = null;
    updateState(Game.runEnemyTurn(gameState));
  }, 450);
}

function resetGame() {
  // Clear delayed enemy action.
  if (enemyTurnTimer !== null) {
    window.clearTimeout(enemyTurnTimer);
    enemyTurnTimer = null;
  }

  pendingDashSkillId = null;
  hideSkillLearnedBanner();
  updateState(Game.createInitialState(gameConfig));
}

function updateState(nextState) {
  // Old state vs new state for effects.
  const damagePopups = collectDamagePopups(gameState, nextState);
  const movementAnimations = collectMovementAnimations(gameState, nextState);
  const learnedSkillName = getLearnedSkillName(gameState, nextState);
  activeMovementAnimations = new Map(movementAnimations.map((movement) => [movement.id, movement]));
  gameState = nextState;
  render();
  showMovementTrails(movementAnimations);
  showDamagePopups(damagePopups);
  showSkillLearnedBanner(learnedSkillName);

  window.setTimeout(() => {
    activeMovementAnimations = new Map();
  }, 460);
}

function getAdjacentEnemy() {
  // Enemy in normal attack range.
  const player = Game.getPlayer(gameState);
  return Game.getEnemies(gameState).find((enemy) => {
    return !enemy.defeated && Game.getDistance(player, enemy) <= player.attackRange;
  }) || null;
}

function getEnemiesInRange(range) {
  const player = Game.getPlayer(gameState);
  return Game.getEnemies(gameState)
    .filter((enemy) => !enemy.defeated && Game.getDistance(player, enemy) <= range)
    .sort((first, second) => Game.getDistance(player, first) - Game.getDistance(player, second));
}

function getDashCells(skill) {
  // Shadow Step target cells.
  if (!skill) {
    return [];
  }

  const player = Game.getPlayer(gameState);
  const boardSize = Game.getBoardSize(gameState);
  const cells = [];

  for (let y = 0; y < boardSize.height; y += 1) {
    for (let x = 0; x < boardSize.width; x += 1) {
      if (
        Game.getDistance(player, { x, y }) <= skill.range &&
        !Game.isCellBlocked(gameState, x, y) &&
        !Game.isCellOccupied(gameState, x, y)
      ) {
        cells.push({ x, y });
      }
    }
  }

  return cells;
}

function collectDamagePopups(previousState, nextState) {
  // Damage popup from HP change.
  if (previousState === null || nextState === null) {
    return [];
  }

  return Object.values(previousState.characters)
    .map((previousCharacter) => {
      const nextCharacter = nextState.characters[previousCharacter.id];

      if (!nextCharacter || nextCharacter.hp >= previousCharacter.hp) {
        return null;
      }

      return {
        damage: previousCharacter.hp - nextCharacter.hp,
        x: previousCharacter.position.x,
        y: previousCharacter.position.y,
        team: previousCharacter.team
      };
    })
    .filter((popup) => popup !== null);
}

function showDamagePopups(popups) {
  popups.forEach((popup) => {
    const cell = page.grid.querySelector(`.cell[data-x="${popup.x}"][data-y="${popup.y}"]`);

    if (!cell) {
      return;
    }

    const damageText = document.createElement("span");
    damageText.className = `damage-popup ${popup.team === "player" ? "player-damage" : "enemy-damage"}`;
    damageText.textContent = `-${popup.damage}`;
    cell.appendChild(damageText);

    window.setTimeout(() => {
      damageText.remove();
    }, 850);
  });
}

function collectMovementAnimations(previousState, nextState) {
  // Movement effect from position change.
  if (previousState === null || nextState === null) {
    return [];
  }

  return Object.values(previousState.characters)
    .map((previousCharacter) => {
      const nextCharacter = nextState.characters[previousCharacter.id];

      if (
        !nextCharacter ||
        nextCharacter.defeated ||
        (
          previousCharacter.position.x === nextCharacter.position.x &&
          previousCharacter.position.y === nextCharacter.position.y
        )
      ) {
        return null;
      }

      return {
        id: previousCharacter.id,
        offsetX: previousCharacter.position.x - nextCharacter.position.x,
        offsetY: previousCharacter.position.y - nextCharacter.position.y,
        path: getSimplePath(previousCharacter.position, nextCharacter.position)
      };
    })
    .filter((movement) => movement !== null);
}

function getSimplePath(start, end) {
  // Visual trail only, not real pathfinding.
  const path = [];
  let currentX = start.x;
  let currentY = start.y;

  while (currentX !== end.x) {
    currentX += currentX < end.x ? 1 : -1;
    path.push({ x: currentX, y: currentY });
  }

  while (currentY !== end.y) {
    currentY += currentY < end.y ? 1 : -1;
    path.push({ x: currentX, y: currentY });
  }

  return path;
}

function showMovementTrails(movements) {
  movements.forEach((movement) => {
    movement.path.forEach((position, index) => {
      const cell = page.grid.querySelector(`.cell[data-x="${position.x}"][data-y="${position.y}"]`);

      if (!cell) {
        return;
      }

      const trail = document.createElement("span");
      trail.className = "movement-trail";
      trail.style.animationDelay = `${index * 45}ms`;
      cell.appendChild(trail);

      window.setTimeout(() => {
        trail.remove();
      }, 650 + index * 45);
    });
  });
}

function getLearnedSkillName(previousState, nextState) {
  if (previousState === null || nextState === null || nextState.log.length <= previousState.log.length) {
    return null;
  }

  const newMessages = nextState.log.slice(previousState.log.length);
  const learnedMessage = newMessages.find((message) => message.endsWith(" learned."));

  return learnedMessage ? learnedMessage.replace(" learned.", "") : null;
}

function showSkillLearnedBanner(skillName) {
  if (skillName === null) {
    return;
  }

  hideSkillLearnedBanner();
  // Show newly learned skill name.
  page.skillLearnedTitle.textContent = skillName;
  page.skillLearnedBanner.classList.remove("hidden");

  skillBannerTimer = window.setTimeout(() => {
    page.skillLearnedBanner.classList.add("hidden");
    skillBannerTimer = null;
  }, 2200);
}

function hideSkillLearnedBanner() {
  if (skillBannerTimer !== null) {
    window.clearTimeout(skillBannerTimer);
    skillBannerTimer = null;
  }

  page.skillLearnedBanner.classList.add("hidden");
}
