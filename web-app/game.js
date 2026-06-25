/**
 * Pure game module for a small grid-based martial arts tactics prototype.
 * The web app imports this file, and it can also be used directly from tests
 * or from the browser console through window.Game.
 *
 * @module game
 */

const PLAYER_ID = "player";
const PLAYER_TURN = "player";
const ENEMY_TURN = "enemy";
const BLOCKED_TILE_TYPES = ["wall", "stone"];

function copyState(gameState) {
  // Copy state before rule changes.
  return {
    ...gameState,
    board: {
      ...gameState.board,
      cells: gameState.board.cells.map((row) => row.map((cell) => ({ ...cell })))
    },
    characters: Object.fromEntries(
      Object.entries(gameState.characters).map(([id, character]) => [id, copyCharacter(character)])
    ),
    skills: Object.fromEntries(
      Object.entries(gameState.skills).map(([id, skill]) => [id, { ...skill }])
    ),
    unlockedSkillIds: [...gameState.unlockedSkillIds],
    rewardedEnemyIds: [...gameState.rewardedEnemyIds],
    log: [...gameState.log]
  };
}

function copyCharacter(character) {
  return {
    ...character,
    position: { ...character.position },
    statuses: { ...character.statuses }
  };
}

function addLog(gameState, message) {
  // Battle messages saved in state.
  return {
    ...gameState,
    log: [...gameState.log, message]
  };
}

/**
 * Create the first game state from data loaded by the web app.
 *
 * @param {object} config Character, skill, and map data.
 * @returns {object} A new game state.
 */
function createInitialState(config) {
  const cells = config.map.cells.map((row) => row.map((type) => ({ type })));
  // Random spawn in app, fixed spawn in tests.
  const spawnCells = chooseSpawnCells(cells, config.characters.enemies.length + 1, config.randomSpawns !== false);
  const playerStart = config.playerStart || spawnCells[0];
  const enemyStarts = config.enemyStarts || spawnCells.slice(1);
  const player = makeCharacter(config.characters.player, playerStart, "player");
  const enemies = config.characters.enemies.map((enemyData, index) => {
    return makeCharacter(enemyData, enemyStarts[index], "enemy");
  });
  const characters = Object.fromEntries([player, ...enemies].map((character) => [character.id, character]));

  return {
    board: {
      width: config.map.width,
      height: config.map.height,
      cells
    },
    turn: PLAYER_TURN,
    characters,
    skills: Object.fromEntries(config.skills.map((skill) => [skill.id, { ...skill }])),
    unlockedSkillIds: config.skills
      .filter((skill) => skill.initiallyUnlocked !== false)
      .map((skill) => skill.id),
    rewardedEnemyIds: [],
    selectedCharacterId: PLAYER_ID,
    winner: null,
    log: ["Player turn begins."]
  };
}

function makeCharacter(data, position, team) {
  // JSON character data to match character.
  return {
    id: data.id,
    name: data.name,
    team,
    icon: data.icon,
    image: data.image,
    maxHp: data.maxHp,
    hp: data.maxHp,
    attack: data.attack,
    defence: data.defence,
    movementRange: data.movementRange,
    attackRange: data.attackRange,
    position: { x: position.x, y: position.y },
    defeated: false,
    hasActed: false,
    hasMoved: false,
    statuses: {
      movementBonus: 0,
      guarded: false,
      invulnerable: false,
      counterReady: false,
      counterUsed: false,
      confused: false
    }
  };
}

function chooseSpawnCells(cells, amount, randomSpawns) {
  const openCells = [];

  // Grass start positions only.
  cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!isTerrainBlocked(cell)) {
        openCells.push({ x, y });
      }
    });
  });

  if (randomSpawns) {
    return shuffle(openCells).slice(0, amount);
  }

  return openCells.slice(0, amount);
}

function shuffle(items) {
  const result = [...items];

  // Shuffle for spawns and skill rewards.
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

/**
 * @param {object} gameState Current state.
 * @returns {string} The current turn.
 */
function getCurrentTurn(gameState) {
  return gameState.turn;
}

/**
 * @param {object} gameState Current state.
 * @returns {{width: number, height: number}} Board dimensions.
 */
function getBoardSize(gameState) {
  return {
    width: gameState.board.width,
    height: gameState.board.height
  };
}

/**
 * @param {object} gameState Current state.
 * @param {string} characterId Character id.
 * @returns {object|undefined} A character.
 */
function getCharacter(gameState, characterId) {
  const character = gameState.characters[characterId];
  return character ? copyCharacter(character) : undefined;
}

/**
 * @param {object} gameState Current state.
 * @returns {object} Player character.
 */
function getPlayer(gameState) {
  return getCharacter(gameState, PLAYER_ID);
}

/**
 * @param {object} gameState Current state.
 * @returns {object[]} Enemy characters.
 */
function getEnemies(gameState) {
  return Object.values(gameState.characters)
    .filter((character) => character.team === "enemy")
    .map(copyCharacter);
}

/**
 * @param {object} gameState Current state.
 * @param {number} x Cell x position.
 * @param {number} y Cell y position.
 * @returns {object|undefined} Cell data.
 */
function getCell(gameState, x, y) {
  if (!isInsideBoard(gameState, x, y)) {
    return undefined;
  }

  return { ...gameState.board.cells[y][x] };
}

/**
 * @param {object} gameState Current state.
 * @param {number} x Cell x position.
 * @param {number} y Cell y position.
 * @returns {boolean} True if the cell is inside the board.
 */
function isInsideBoard(gameState, x, y) {
  return x >= 0 && y >= 0 && x < gameState.board.width && y < gameState.board.height;
}

/**
 * @param {object} gameState Current state.
 * @param {number} x Cell x position.
 * @param {number} y Cell y position.
 * @returns {boolean} True if the cell is blocked.
 */
function isCellBlocked(gameState, x, y) {
  if (!isInsideBoard(gameState, x, y)) {
    return true;
  }

  const cell = gameState.board.cells[y][x];
  return isTerrainBlocked(cell);
}

function isTerrainBlocked(cell) {
  // Water and mountain tiles block movement.
  return cell.blocked === true || BLOCKED_TILE_TYPES.includes(cell.type);
}

/**
 * @param {object} gameState Current state.
 * @param {number} x Cell x position.
 * @param {number} y Cell y position.
 * @returns {boolean} True if a living character is on the cell.
 */
function isCellOccupied(gameState, x, y) {
  return getCharacterAt(gameState, x, y) !== undefined;
}

/**
 * @param {{x: number, y: number}|{position: {x: number, y: number}}} a First position.
 * @param {{x: number, y: number}|{position: {x: number, y: number}}} b Second position.
 * @returns {number} Manhattan distance.
 */
function getDistance(a, b) {
  const first = a.position || a;
  const second = b.position || b;
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

/**
 * @param {object} gameState Current state.
 * @param {string} characterId Character id.
 * @returns {object[]} Reachable empty cells.
 */
function getReachableCells(gameState, characterId) {
  const character = gameState.characters[characterId];

  if (!character || character.defeated || character.hasMoved || character.hasActed) {
    return [];
  }

  const maximumDistance = getEffectiveMovementRange(character);
  const queue = [{ ...character.position, distance: 0 }];
  const visited = new Set([makePositionKey(character.position)]);
  const reachable = [];

  // BFS movement search.
  while (queue.length > 0) {
    const current = queue.shift();

    getNeighbours(gameState, current).forEach((nextCell) => {
      const key = makePositionKey(nextCell);

      if (visited.has(key) || isCellBlocked(gameState, nextCell.x, nextCell.y)) {
        return;
      }

      const nextDistance = current.distance + 1;

      if (nextDistance > maximumDistance || isCellOccupied(gameState, nextCell.x, nextCell.y)) {
        return;
      }

      visited.add(key);
      reachable.push({ x: nextCell.x, y: nextCell.y });
      queue.push({ ...nextCell, distance: nextDistance });
    });
  }

  return reachable;
}

function getEffectiveMovementRange(character) {
  return character.movementRange + (character.statuses.movementBonus || 0);
}

/**
 * Move a character if the target cell is reachable.
 *
 * @param {object} gameState Current state.
 * @param {string} characterId Character id.
 * @param {number} targetX Target x.
 * @param {number} targetY Target y.
 * @returns {object} New state.
 */
function moveCharacter(gameState, characterId, targetX, targetY) {
  const character = gameState.characters[characterId];

  // No movement after defeated, moved or acted.
  if (!character || character.defeated || character.hasMoved || character.hasActed) {
    return gameState;
  }

  const canMove = getReachableCells(gameState, characterId).some((cell) => cell.x === targetX && cell.y === targetY);

  if (!canMove) {
    return gameState;
  }

  const nextState = copyState(gameState);
  const nextCharacter = nextState.characters[characterId];
  nextCharacter.position = { x: targetX, y: targetY };
  nextCharacter.hasMoved = true;
  nextCharacter.statuses.movementBonus = 0;
  return addLog(nextState, `${nextCharacter.name} moved.`);
}

/**
 * Attack another character if in range.
 *
 * @param {object} gameState Current state.
 * @param {string} attackerId Attacker id.
 * @param {string} targetId Target id.
 * @returns {object} New state.
 */
function attackCharacter(gameState, attackerId, targetId) {
  const attacker = gameState.characters[attackerId];
  const target = gameState.characters[targetId];

  // One action per round.
  if (!attacker || !target || attacker.defeated || target.defeated || attacker.hasActed) {
    return gameState;
  }

  if (getDistance(attacker, target) > attacker.attackRange) {
    return gameState;
  }

  const nextState = copyState(gameState);
  const nextAttacker = nextState.characters[attackerId];
  const nextTarget = nextState.characters[targetId];
  const damage = calculateDamage(nextAttacker, nextTarget, 0);
  applyDamage(nextState, targetId, damage);
  nextAttacker.hasActed = true;

  return finishAction(nextState, `${nextAttacker.name} hit ${nextTarget.name} for ${damage} damage.`);
}

function calculateDamage(attacker, target, defenceIgnore) {
  // Attack minus defence, minimum 1.
  const guardBonus = target.statuses.guarded ? 2 : 0;
  const effectiveDefence = Math.max(0, target.defence - defenceIgnore);
  return Math.max(1, attacker.attack - effectiveDefence - guardBonus);
}

function applyDamage(gameState, targetId, damage) {
  const target = gameState.characters[targetId];

  // Mutate copied state only.
  if (!target || target.defeated) {
    return false;
  }

  if (target.statuses.invulnerable) {
    target.statuses.invulnerable = false;
    return false;
  }

  const wasAlive = target.hp > 0;
  target.hp = Math.max(0, target.hp - damage);

  if (wasAlive && target.hp === 0) {
    target.defeated = true;
    return true;
  }

  return false;
}

function pushTargetAway(gameState, attacker, target, distance) {
  if (target.defeated) {
    return;
  }

  const direction = {
    x: Math.sign(target.position.x - attacker.position.x),
    y: Math.sign(target.position.y - attacker.position.y)
  };

  let nextPosition = { ...target.position };

  for (let step = 0; step < distance; step += 1) {
    const candidate = {
      x: nextPosition.x + direction.x,
      y: nextPosition.y + direction.y
    };

    if (
      !isInsideBoard(gameState, candidate.x, candidate.y) ||
      isCellBlocked(gameState, candidate.x, candidate.y) ||
      isCellOccupied(gameState, candidate.x, candidate.y)
    ) {
      return;
    }

    nextPosition = candidate;
  }

  target.position = nextPosition;
}

function finishAction(gameState, message) {
  // Victory and reward check after action.
  return updateWinner(updateSkillReward(addLog(gameState, message)));
}

/**
 * Use one of the player's martial arts skills.
 *
 * @param {object} gameState Current state.
 * @param {string} characterId Character id.
 * @param {string} skillId Skill id.
 * @param {object} target Target data, usually { characterId }.
 * @returns {object} New state.
 */
function useSkill(gameState, characterId, skillId, target = {}) {
  const character = gameState.characters[characterId];
  const skill = gameState.skills[skillId];

  // Locked skill guard.
  if (!character || !skill || character.defeated || !gameState.unlockedSkillIds.includes(skillId)) {
    return gameState;
  }

  if (skill.type === "damage") {
    return useDamageSkill(gameState, characterId, skill, target.characterId);
  }

  if (skill.type === "ranged_damage") {
    return useDamageSkill(gameState, characterId, skill, target.characterId);
  }

  if (skill.type === "piercing") {
    return useDamageSkill(gameState, characterId, skill, target.characterId);
  }

  if (skill.type === "knockback") {
    return useKnockbackSkill(gameState, characterId, skill, target.characterId);
  }

  if (skill.type === "confuse") {
    return useConfuseSkill(gameState, characterId, skill, target.characterId);
  }

  if (skill.type === "adjacent_area") {
    return useAdjacentAreaSkill(gameState, characterId, skill);
  }

  if (skill.type === "movement") {
    // Qi Step before movement only.
    if (character.hasActed) {
      return gameState;
    }

    if (character.hasMoved) {
      return gameState;
    }

    const nextState = copyState(gameState);
    nextState.characters[characterId].statuses.movementBonus = skill.movementBonus;
    return addLog(nextState, `${character.name} used ${skill.name}.`);
  }

  if (skill.type === "dash") {
    return useDashSkill(gameState, characterId, skill, target);
  }

  if (skill.type === "guard") {
    // Inner Guard for next enemy turn.
    if (character.hasActed) {
      return gameState;
    }

    const nextState = copyState(gameState);
    nextState.characters[characterId].statuses.guarded = true;
    nextState.characters[characterId].hasActed = true;
    return addLog(nextState, `${character.name} used ${skill.name}.`);
  }

  if (skill.type === "counter") {
    // Flowing Counter waits for enemy attack.
    if (character.hasActed) {
      return gameState;
    }

    const nextState = copyState(gameState);
    nextState.characters[characterId].statuses.counterReady = true;
    nextState.characters[characterId].statuses.counterUsed = false;
    nextState.characters[characterId].hasActed = true;
    return addLog(nextState, `${character.name} entered Flowing Counter stance.`);
  }

  if (skill.type === "invulnerable") {
    if (character.hasActed) {
      return gameState;
    }

    const nextState = copyState(gameState);
    nextState.characters[characterId].statuses.invulnerable = true;
    nextState.characters[characterId].hasActed = true;
    return addLog(nextState, `${character.name} used ${skill.name}.`);
  }

  return gameState;
}

function useDamageSkill(gameState, characterId, skill, targetId) {
  const character = gameState.characters[characterId];
  const target = gameState.characters[targetId];

  // Shared logic for damage skills.
  if (!target || target.defeated || character.hasActed || getDistance(character, target) > skill.range) {
    return gameState;
  }

  const nextState = copyState(gameState);
  const nextCharacter = nextState.characters[characterId];
  const nextTarget = nextState.characters[targetId];
  const damage = Math.max(1, skill.damage + nextCharacter.attack - Math.max(0, nextTarget.defence - (skill.defenceIgnore || 0)));
  applyDamage(nextState, targetId, damage);
  nextCharacter.hasActed = true;

  return finishAction(nextState, `${nextCharacter.name} used ${skill.name}.`);
}

function useAdjacentAreaSkill(gameState, characterId, skill) {
  const character = gameState.characters[characterId];

  if (character.hasActed) {
    return gameState;
  }

  const targets = Object.values(gameState.characters).filter((target) => {
    // Adjacent targets for Crescent Cut.
    return target.team === ENEMY_TURN && !target.defeated && getDistance(character, target) === 1;
  });

  if (targets.length === 0) {
    return gameState;
  }

  const nextState = copyState(gameState);
  const nextCharacter = nextState.characters[characterId];
  targets.forEach((target) => {
    const nextTarget = nextState.characters[target.id];
    const damage = Math.max(1, skill.damage + nextCharacter.attack - nextTarget.defence);
    applyDamage(nextState, target.id, damage);
  });
  nextCharacter.hasActed = true;
  return finishAction(nextState, `${nextCharacter.name} used ${skill.name}.`);
}

function useKnockbackSkill(gameState, characterId, skill, targetId) {
  const character = gameState.characters[characterId];
  const target = gameState.characters[targetId];

  if (!target || target.defeated || character.hasActed || getDistance(character, target) > skill.range) {
    return gameState;
  }

  const nextState = copyState(gameState);
  const nextCharacter = nextState.characters[characterId];
  const nextTarget = nextState.characters[targetId];
  const damage = Math.max(1, skill.damage + nextCharacter.attack - nextTarget.defence);
  applyDamage(nextState, targetId, damage);
  pushTargetAway(nextState, nextCharacter, nextTarget, skill.knockback || 1);
  nextCharacter.hasActed = true;
  return finishAction(nextState, `${nextCharacter.name} used ${skill.name}.`);
}

function useConfuseSkill(gameState, characterId, skill, targetId) {
  const character = gameState.characters[characterId];
  const target = gameState.characters[targetId];

  if (!target || target.defeated || character.hasActed || getDistance(character, target) > skill.range) {
    return gameState;
  }

  const nextState = copyState(gameState);
  nextState.characters[targetId].statuses.confused = true;
  nextState.characters[characterId].hasActed = true;
  return addLog(nextState, `${character.name} used ${skill.name}.`);
}

function useDashSkill(gameState, characterId, skill, target) {
  const character = gameState.characters[characterId];

  // Shadow Step final square check.
  if (character.hasMoved || character.hasActed || !target || !isInsideBoard(gameState, target.x, target.y)) {
    return gameState;
  }

  if (isCellBlocked(gameState, target.x, target.y) || isCellOccupied(gameState, target.x, target.y)) {
    return gameState;
  }

  if (getDistance(character, target) > skill.range) {
    return gameState;
  }

  const nextState = copyState(gameState);
  nextState.characters[characterId].position = { x: target.x, y: target.y };
  nextState.characters[characterId].hasMoved = true;
  nextState.characters[characterId].statuses.movementBonus = 0;
  return addLog(nextState, `${character.name} used ${skill.name}.`);
}

/**
 * Resolve all enemy actions and return to the player turn if the game continues.
 *
 * @param {object} gameState Current state.
 * @returns {object} New state.
 */
function runEnemyTurn(gameState) {
  if (isGameOver(gameState)) {
    return gameState;
  }

  let nextState = copyState(gameState);
  nextState.turn = ENEMY_TURN;

  // Enemy actions one by one.
  getEnemies(nextState)
    .filter((enemy) => !enemy.defeated)
    .forEach((enemy) => {
      if (isGameOver(nextState)) {
        return;
      }

      nextState.characters[enemy.id].hasActed = false;
      nextState.characters[enemy.id].hasMoved = false;

      if (getDistance(nextState.characters[enemy.id], nextState.characters[PLAYER_ID]) <= enemy.attackRange) {
        nextState = enemyAttackPlayer(nextState, enemy.id);
      } else {
        nextState = moveEnemyTowardPlayer(nextState, enemy.id);
      }
    });

  if (!isGameOver(nextState)) {
    // Reset player action flags for new turn.
    nextState.turn = PLAYER_TURN;
    nextState.characters[PLAYER_ID].hasActed = false;
    nextState.characters[PLAYER_ID].hasMoved = false;
    nextState.characters[PLAYER_ID].statuses.guarded = false;
    nextState.characters[PLAYER_ID].statuses.counterReady = false;
    nextState.characters[PLAYER_ID].statuses.counterUsed = false;
    nextState = addLog(nextState, "Player turn begins.");
  }

  return updateWinner(nextState);
}

function enemyAttackPlayer(gameState, enemyId) {
  if (gameState.characters[enemyId].statuses.confused) {
    return confusedEnemyAttack(gameState, enemyId);
  }

  let nextState = attackCharacter(gameState, enemyId, PLAYER_ID);
  const player = nextState.characters[PLAYER_ID];
  const enemy = nextState.characters[enemyId];

  if (!isGameOver(nextState) && player.statuses.counterReady && !player.statuses.counterUsed && !enemy.defeated) {
    // One counter after enemy hit.
    const damage = Math.max(1, player.attack - enemy.defence);
    applyDamage(nextState, enemyId, damage);
    player.statuses.counterUsed = true;
    nextState = finishAction(nextState, `${player.name} counterattacked ${enemy.name} for ${damage} damage.`);
  }

  return nextState;
}

function confusedEnemyAttack(gameState, enemyId) {
  const enemy = gameState.characters[enemyId];
  const target = Object.values(gameState.characters)
    .filter((character) => {
      return character.team === enemy.team && character.id !== enemyId && !character.defeated;
    })
    .sort((first, second) => getDistance(enemy, first) - getDistance(enemy, second))[0];

  const nextState = copyState(gameState);
  nextState.characters[enemyId].statuses.confused = false;

  if (!target) {
    nextState.characters[enemyId].hasActed = true;
    return addLog(nextState, `${enemy.name} was confused but found no ally to attack.`);
  }

  const nextEnemy = nextState.characters[enemyId];
  const nextTarget = nextState.characters[target.id];
  const damage = calculateDamage(nextEnemy, nextTarget, 0);
  applyDamage(nextState, target.id, damage);
  nextEnemy.hasActed = true;
  return finishAction(nextState, `${enemy.name} attacked ${target.name} in confusion.`);
}

function moveEnemyTowardPlayer(gameState, enemyId) {
  const enemy = gameState.characters[enemyId];
  const player = gameState.characters[PLAYER_ID];
  // Pathfind beside the player.
  const path = findPathToAdjacentCell(gameState, enemy, player);

  if (path.length < 2) {
    return gameState;
  }

  const stepIndex = Math.min(enemy.movementRange, path.length - 1);
  const target = path[stepIndex];
  const nextState = copyState(gameState);
  nextState.characters[enemyId].position = { x: target.x, y: target.y };
  nextState.characters[enemyId].hasActed = true;
  nextState.characters[enemyId].hasMoved = true;
  return addLog(nextState, `${enemy.name} moved toward the player.`);
}

function findPathToAdjacentCell(gameState, start, target) {
  // Pick shortest path to a neighbour cell.
  const targetCells = getNeighbours(gameState, target.position)
    .filter((cell) => !isCellBlocked(gameState, cell.x, cell.y))
    .filter((cell) => !isCellOccupied(gameState, cell.x, cell.y));
  const paths = targetCells
    .map((cell) => findPath(gameState, start.position, cell))
    .filter((path) => path.length > 0)
    .sort((a, b) => a.length - b.length);

  return paths[0] || [];
}

function findPath(gameState, start, target) {
  // Breadth-first search with previous cells.
  const queue = [{ ...start }];
  const visited = new Set([makePositionKey(start)]);
  const previous = new Map();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.x === target.x && current.y === target.y) {
      return buildPath(previous, current);
    }

    getNeighbours(gameState, current).forEach((nextCell) => {
      const key = makePositionKey(nextCell);
      const isTarget = nextCell.x === target.x && nextCell.y === target.y;

      if (visited.has(key) || isCellBlocked(gameState, nextCell.x, nextCell.y)) {
        return;
      }

      if (isCellOccupied(gameState, nextCell.x, nextCell.y) && !isTarget) {
        return;
      }

      visited.add(key);
      previous.set(key, current);
      queue.push(nextCell);
    });
  }

  return [];
}

function buildPath(previous, endCell) {
  // Rebuild path backwards.
  const path = [endCell];
  let current = endCell;

  while (previous.has(makePositionKey(current))) {
    current = previous.get(makePositionKey(current));
    path.unshift(current);
  }

  return path;
}

/**
 * End the current turn.
 *
 * @param {object} gameState Current state.
 * @returns {object} New state.
 */
function endTurn(gameState) {
  if (isGameOver(gameState)) {
    return gameState;
  }

  const nextState = copyState(gameState);

  if (nextState.turn === PLAYER_TURN) {
    nextState.turn = ENEMY_TURN;
    return addLog(nextState, "Enemy turn begins.");
  }

  nextState.turn = PLAYER_TURN;
  nextState.characters[PLAYER_ID].hasActed = false;
  nextState.characters[PLAYER_ID].hasMoved = false;
  return addLog(nextState, "Player turn begins.");
}

/**
 * @param {object} gameState Current state.
 * @returns {boolean} True if the player or enemies have won.
 */
function isGameOver(gameState) {
  return getWinner(gameState) !== null;
}

/**
 * @param {object} gameState Current state.
 * @returns {string|null} "player", "enemy", or null.
 */
function getWinner(gameState) {
  if (gameState.characters[PLAYER_ID].hp <= 0 || gameState.characters[PLAYER_ID].defeated) {
    return ENEMY_TURN;
  }

  const livingEnemies = Object.values(gameState.characters).filter((character) => {
    return character.team === ENEMY_TURN && !character.defeated && character.hp > 0;
  });

  return livingEnemies.length === 0 ? PLAYER_TURN : null;
}

function updateWinner(gameState) {
  const winner = getWinner(gameState);
  return {
    ...gameState,
    winner
  };
}

function updateSkillReward(gameState) {
  // No skill reward after final enemy.
  if (getWinner(gameState) === PLAYER_TURN) {
    return gameState;
  }

  const newlyDefeatedEnemy = Object.values(gameState.characters).find((character) => {
    return character.team === ENEMY_TURN && character.defeated && !gameState.rewardedEnemyIds.includes(character.id);
  });

  if (!newlyDefeatedEnemy) {
    return gameState;
  }

  const lockedSkillIds = Object.values(gameState.skills)
    // Optional locked skills only.
    .filter((skill) => skill.initiallyUnlocked === false)
    .map((skill) => skill.id)
    .filter((skillId) => !gameState.unlockedSkillIds.includes(skillId));

  const nextState = {
    ...gameState,
    rewardedEnemyIds: [...gameState.rewardedEnemyIds, newlyDefeatedEnemy.id]
  };

  if (lockedSkillIds.length === 0) {
    return nextState;
  }

  const learnedSkillId = shuffle(lockedSkillIds)[0];
  const learnedSkill = nextState.skills[learnedSkillId];
  return addLog({
    ...nextState,
    unlockedSkillIds: [...nextState.unlockedSkillIds, learnedSkillId]
  }, `${learnedSkill.name} learned.`);
}

/**
 * @param {object} gameState Current state.
 * @returns {object[]} Skills currently unlocked by the player.
 */
function getUnlockedSkills(gameState) {
  return gameState.unlockedSkillIds.map((skillId) => ({ ...gameState.skills[skillId] }));
}

function getCharacterAt(gameState, x, y) {
  return Object.values(gameState.characters).find((character) => {
    return !character.defeated && character.position.x === x && character.position.y === y;
  });
}

function getNeighbours(gameState, position) {
  return [
    { x: position.x, y: position.y - 1 },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x - 1, y: position.y }
  ].filter((cell) => isInsideBoard(gameState, cell.x, cell.y));
}

function makePositionKey(position) {
  return `${position.x},${position.y}`;
}

export {
  createInitialState,
  getCurrentTurn,
  getBoardSize,
  getCharacter,
  getPlayer,
  getEnemies,
  getCell,
  isInsideBoard,
  isCellBlocked,
  isCellOccupied,
  getDistance,
  getReachableCells,
  moveCharacter,
  attackCharacter,
  useSkill,
  getUnlockedSkills,
  runEnemyTurn,
  endTurn,
  isGameOver,
  getWinner
};
