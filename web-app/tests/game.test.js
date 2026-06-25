import assert from "node:assert/strict";
import {
  attackCharacter,
  createInitialState,
  getCharacter,
  getPlayer,
  getReachableCells,
  getUnlockedSkills,
  getWinner,
  isGameOver,
  moveCharacter,
  runEnemyTurn,
  useSkill
} from "../game.js";

function makeTestConfig(overrides = {}) {
  // Clean test map helper.
  const cells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "grass"));
  const enemyStarts = overrides.enemyStarts || [{ x: 4, y: 4 }];

  if (overrides.wall) {
    cells[overrides.wall.y][overrides.wall.x] = "wall";
  }

  if (overrides.water) {
    cells[overrides.water.y][overrides.water.x] = "stone";
  }

  return {
    randomSpawns: false,
    playerStart: overrides.playerStart || { x: 0, y: 0 },
    enemyStarts,
    map: {
      width: 10,
      height: 10,
      cells
    },
    characters: {
      player: {
        id: "player",
        name: "Player",
        icon: "P",
        maxHp: overrides.playerHp || 12,
        attack: overrides.playerAttack || 5,
        defence: overrides.playerDefence ?? 2,
        movementRange: 4,
        attackRange: 1
      },
      enemies: enemyStarts.map((position, index) => ({
        id: `enemy_${index + 1}`,
        name: `Enemy ${index + 1}`,
        icon: "E",
        maxHp: overrides.enemyHp || 8,
        attack: overrides.enemyAttack || 4,
        defence: overrides.enemyDefence ?? 1,
        movementRange: 3,
        attackRange: 1
      }))
    },
    skills: overrides.skills || []
  };
}

// Locked skills for reward and skill tests.
const unlockableSkills = [
  {
    id: "crescent_cut",
    name: "Crescent Cut",
    type: "adjacent_area",
    damage: 3,
    description: "Damages all adjacent enemies.",
    initiallyUnlocked: false
  },
  {
    id: "piercing_thrust",
    name: "Piercing Thrust",
    type: "piercing",
    range: 1,
    damage: 2,
    defenceIgnore: 2,
    description: "Partially ignores defence.",
    initiallyUnlocked: false
  },
  {
    id: "flowing_counter",
    name: "Flowing Counter",
    type: "counter",
    description: "Counter once.",
    initiallyUnlocked: false
  },
  {
    id: "shadow_step",
    name: "Shadow Step",
    type: "dash",
    range: 3,
    description: "Dash to a nearby empty cell.",
    initiallyUnlocked: false
  },
  {
    id: "dragon_palm",
    name: "Dragon Palm",
    type: "ranged_damage",
    range: 3,
    damage: 4,
    description: "Ranged qi damage.",
    initiallyUnlocked: false
  },
  {
    id: "golden_bell",
    name: "Golden Bell",
    type: "invulnerable",
    description: "Block next damage.",
    initiallyUnlocked: false
  },
  {
    id: "iron_sand_palm",
    name: "Iron Sand Palm",
    type: "knockback",
    range: 1,
    damage: 2,
    knockback: 1,
    description: "Damage and push target.",
    initiallyUnlocked: false
  },
  {
    id: "soul_seizing",
    name: "Soul Seizing",
    type: "confuse",
    range: 3,
    description: "Make target attack a team mate.",
    initiallyUnlocked: false
  }
];

describe("movement system", () => {
  // Movement, blocked cells and one-move rule.
  it("player can move to a reachable empty cell", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 2, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 2, y: 0 }, "player should move to a reachable empty cell");
  });

  it("player cannot move outside the board", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", -1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 }, "player position should stay same outside board");
  });

  it("player cannot move further than movement range", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 5, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 }, "player should not move further than range");
  });

  it("player cannot move onto a blocked tile", () => {
    const state = createInitialState(makeTestConfig({ wall: { x: 1, y: 0 } }));
    const nextState = moveCharacter(state, "player", 1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 }, "player should not move onto wall");
  });

  it("player cannot move onto a water tile", () => {
    const state = createInitialState(makeTestConfig({ water: { x: 1, y: 0 } }));
    const nextState = moveCharacter(state, "player", 1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 }, "player should not move onto water");
  });

  it("player cannot move onto an occupied cell", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = moveCharacter(state, "player", 1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 }, "player should not move onto occupied enemy cell");
  });

  it("a valid move updates the player's position", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 0, 3);

    assert.equal(getPlayer(nextState).position.y, 3, "valid move should update player y position");
  });

  it("an invalid move does not mutate the original state", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 9, 9);

    assert.equal(nextState, state, "invalid move should return the original state object");
    assert.deepEqual(getPlayer(state).position, { x: 0, y: 0 }, "original state should not be mutated");
  });

  it("player can still attack after moving once", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 2, y: 0 }] }));
    const movedState = moveCharacter(state, "player", 1, 0);
    const attackedState = attackCharacter(movedState, "player", "enemy_1");

    assert.ok(
      getCharacter(attackedState, "enemy_1").hp < getCharacter(movedState, "enemy_1").hp,
      "enemy HP should go down after player moves then attacks"
    );
  });

  it("player cannot move twice in one round", () => {
    const state = createInitialState(makeTestConfig());
    const movedState = moveCharacter(state, "player", 1, 0);
    const secondMoveState = moveCharacter(movedState, "player", 2, 0);

    assert.equal(secondMoveState, movedState, "second move should return unchanged state");
    assert.deepEqual(getReachableCells(movedState, "player"), [], "player should have no reachable cells after moving");
  });

  it("player cannot move after attacking once", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const attackedState = attackCharacter(state, "player", "enemy_1");
    const movedState = moveCharacter(attackedState, "player", 0, 1);

    assert.equal(movedState, attackedState, "player should not move after spending action");
    assert.deepEqual(getPlayer(movedState).position, { x: 0, y: 0 }, "player position should stay after attacking first");
  });

  it("Qi Step cannot be used after movement has already been spent", () => {
    const state = createInitialState({
      ...makeTestConfig(),
      skills: [{ id: "qi_step", name: "Qi Step", type: "movement", movementBonus: 2 }]
    });
    const movedState = moveCharacter(state, "player", 1, 0);
    const boostedState = useSkill(movedState, "player", "qi_step");

    assert.equal(boostedState, movedState, "Qi Step should fail after movement is spent");
  });
});

describe("skill system", () => {
  // Skill unlock and special skill effects.
  it("defeating an enemy automatically unlocks one locked skill", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }, { x: 6, y: 6 }],
      playerAttack: 7,
      skills: unlockableSkills
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getUnlockedSkills(nextState).length, 1, "one locked skill should unlock after non-final enemy defeat");
  });

  it("learning a skill adds a battle log message", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }, { x: 6, y: 6 }],
      playerAttack: 7,
      skills: unlockableSkills
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.match(nextState.log.at(-1), / learned\.$/, "battle log should say that a skill was learned");
  });

  it("defeating the last enemy wins without learning a final skill", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }],
      playerAttack: 7,
      skills: unlockableSkills
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getWinner(nextState), "player", "defeating the last enemy should set player as winner");
    assert.equal(getUnlockedSkills(nextState).length, 0, "last enemy should not give final skill reward");
    assert.equal(
      nextState.log.some((message) => message.endsWith(" learned.")),
      false,
      "battle log should not include skill learned message after final enemy"
    );
  });

  it("Crescent Cut damages all adjacent enemies", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
      skills: [{ ...unlockableSkills[0], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "crescent_cut");

    assert.ok(
      getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp,
      "Crescent Cut should damage first adjacent enemy"
    );
    assert.ok(
      getCharacter(nextState, "enemy_2").hp < getCharacter(state, "enemy_2").hp,
      "Crescent Cut should damage second adjacent enemy"
    );
  });

  it("Shadow Step can dash past a blocked path to an empty nearby cell", () => {
    const state = createInitialState(makeTestConfig({
      wall: { x: 1, y: 0 },
      skills: [{ ...unlockableSkills[3], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "shadow_step", { x: 2, y: 0 });

    assert.deepEqual(getPlayer(nextState).position, { x: 2, y: 0 }, "Shadow Step should dash past blocked path");
  });

  it("Flowing Counter counterattacks once when the player is attacked", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }],
      skills: [{ ...unlockableSkills[2], initiallyUnlocked: true }]
    }));
    const counterState = useSkill(state, "player", "flowing_counter");
    const enemyTurnState = runEnemyTurn(counterState);

    assert.ok(
      getCharacter(enemyTurnState, "enemy_1").hp < getCharacter(counterState, "enemy_1").hp,
      "Flowing Counter should damage enemy after player is attacked"
    );
  });

  it("Dragon Palm can damage one enemy within three cells", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 3, y: 0 }],
      skills: [{ ...unlockableSkills[4], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "dragon_palm", { characterId: "enemy_1" });

    assert.ok(
      getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp,
      "Dragon Palm should damage enemy within range"
    );
  });

  it("Golden Bell blocks the next damage taken", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }],
      skills: [{ ...unlockableSkills[5], initiallyUnlocked: true }]
    }));
    const guardedState = useSkill(state, "player", "golden_bell");
    const attackedState = attackCharacter(guardedState, "enemy_1", "player");

    assert.equal(getPlayer(attackedState).hp, getPlayer(guardedState).hp, "Golden Bell should block the next damage");
    assert.equal(getPlayer(attackedState).statuses.invulnerable, false, "Golden Bell should be used up after blocking");
  });

  it("Iron Sand Palm damages and pushes an enemy back one cell", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }],
      skills: [{ ...unlockableSkills[6], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "iron_sand_palm", { characterId: "enemy_1" });

    assert.ok(
      getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp,
      "Iron Sand Palm should damage the target"
    );
    assert.deepEqual(
      getCharacter(nextState, "enemy_1").position,
      { x: 2, y: 0 },
      "Iron Sand Palm should push the enemy one cell away"
    );
  });

  it("Soul Seizing makes an enemy attack a team mate next time", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      skills: [{ ...unlockableSkills[7], initiallyUnlocked: true }]
    }));
    const confusedState = useSkill(state, "player", "soul_seizing", { characterId: "enemy_1" });
    const enemyTurnState = runEnemyTurn(confusedState);

    assert.ok(
      getCharacter(enemyTurnState, "enemy_2").hp < getCharacter(confusedState, "enemy_2").hp,
      "Soul Seizing should make the confused enemy damage a team mate"
    );
  });

  it("Soul Seizing can hit the nearest team mate even if not adjacent", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }, { x: 4, y: 0 }],
      skills: [{ ...unlockableSkills[7], initiallyUnlocked: true }]
    }));
    const confusedState = useSkill(state, "player", "soul_seizing", { characterId: "enemy_1" });
    const enemyTurnState = runEnemyTurn(confusedState);

    assert.ok(
      getCharacter(enemyTurnState, "enemy_2").hp < getCharacter(confusedState, "enemy_2").hp,
      "Soul Seizing should damage the nearest team mate even outside normal attack range"
    );
  });
});

describe("combat system", () => {
  // Damage, defence, defeated flag and win/lose result.
  it("player can attack an adjacent enemy", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.ok(
      getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp,
      "adjacent enemy should lose HP after attack"
    );
  });

  it("player cannot attack an enemy outside attack range", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 3, y: 0 }] }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(nextState, state, "out of range attack should return unchanged state");
  });

  it("damage should reduce HP", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getCharacter(nextState, "enemy_1").hp, 4, "enemy HP should be reduced by calculated damage");
  });

  it("defence should reduce incoming damage", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = attackCharacter(state, "enemy_1", "player");

    assert.equal(getPlayer(nextState).hp, 10, "player defence should reduce enemy damage");
  });

  // Enemy turn behaviour, moving first then attacking when close.
  it("enemy moves toward the player when not adjacent", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 6, y: 0 }] }));
    const nextState = runEnemyTurn(state);

    assert.ok(
      getCharacter(nextState, "enemy_1").position.x < getCharacter(state, "enemy_1").position.x,
      "enemy x position should move closer to player"
    );
  });

  it("enemy attacks the player when adjacent", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = runEnemyTurn(state);

    assert.ok(getPlayer(nextState).hp < getPlayer(state).hp, "adjacent enemy should reduce player HP");
  });

  it("enemy is marked defeated when HP reaches zero", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }],
      playerAttack: 7
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getCharacter(nextState, "enemy_1").defeated, true, "enemy should be defeated at zero HP");
  });

  it("game is won when all enemies are defeated", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }],
      playerAttack: 7
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(isGameOver(nextState), true, "game should end when all enemies are defeated");
    assert.equal(getWinner(nextState), "player", "player should win after all enemies are defeated");
  });

  it("game is lost when the player's HP reaches zero", () => {
    const state = createInitialState(makeTestConfig({
      playerHp: 3,
      playerDefence: 0,
      enemyAttack: 6,
      enemyStarts: [{ x: 1, y: 0 }]
    }));
    const nextState = attackCharacter(state, "enemy_1", "player");

    assert.equal(isGameOver(nextState), true, "game should end when player reaches zero HP");
    assert.equal(getWinner(nextState), "enemy", "enemy should win when player reaches zero HP");
  });
});
