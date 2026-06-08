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
  }
];

describe("movement system", () => {
  // Movement, blocked cells and one-move rule.
  it("player can move to a reachable empty cell", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 2, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 2, y: 0 });
  });

  it("player cannot move outside the board", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", -1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 });
  });

  it("player cannot move further than movement range", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 5, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 });
  });

  it("player cannot move onto a blocked tile", () => {
    const state = createInitialState(makeTestConfig({ wall: { x: 1, y: 0 } }));
    const nextState = moveCharacter(state, "player", 1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 });
  });

  it("player cannot move onto an occupied cell", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = moveCharacter(state, "player", 1, 0);

    assert.deepEqual(getPlayer(nextState).position, { x: 0, y: 0 });
  });

  it("a valid move updates the player's position", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 0, 3);

    assert.equal(getPlayer(nextState).position.y, 3);
  });

  it("an invalid move does not mutate the original state", () => {
    const state = createInitialState(makeTestConfig());
    const nextState = moveCharacter(state, "player", 9, 9);

    assert.equal(nextState, state);
    assert.deepEqual(getPlayer(state).position, { x: 0, y: 0 });
  });

  it("player can still attack after moving once", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 2, y: 0 }] }));
    const movedState = moveCharacter(state, "player", 1, 0);
    const attackedState = attackCharacter(movedState, "player", "enemy_1");

    assert.ok(getCharacter(attackedState, "enemy_1").hp < getCharacter(movedState, "enemy_1").hp);
  });

  it("player cannot move twice in one round", () => {
    const state = createInitialState(makeTestConfig());
    const movedState = moveCharacter(state, "player", 1, 0);
    const secondMoveState = moveCharacter(movedState, "player", 2, 0);

    assert.equal(secondMoveState, movedState);
    assert.deepEqual(getReachableCells(movedState, "player"), []);
  });

  it("player can still move after attacking once", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const attackedState = attackCharacter(state, "player", "enemy_1");
    const movedState = moveCharacter(attackedState, "player", 0, 1);

    assert.deepEqual(getPlayer(movedState).position, { x: 0, y: 1 });
  });

  it("Qi Step cannot be used after movement has already been spent", () => {
    const state = createInitialState({
      ...makeTestConfig(),
      skills: [{ id: "qi_step", name: "Qi Step", type: "movement", movementBonus: 2 }]
    });
    const movedState = moveCharacter(state, "player", 1, 0);
    const boostedState = useSkill(movedState, "player", "qi_step");

    assert.equal(boostedState, movedState);
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

    assert.equal(getUnlockedSkills(nextState).length, 1);
  });

  it("learning a skill adds a battle log message", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }, { x: 6, y: 6 }],
      playerAttack: 7,
      skills: unlockableSkills
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.match(nextState.log.at(-1), / learned\.$/);
  });

  it("defeating the last enemy wins without learning a final skill", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }],
      playerAttack: 7,
      skills: unlockableSkills
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getWinner(nextState), "player");
    assert.equal(getUnlockedSkills(nextState).length, 0);
    assert.equal(nextState.log.some((message) => message.endsWith(" learned.")), false);
  });

  it("Crescent Cut damages all adjacent enemies", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
      skills: [{ ...unlockableSkills[0], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "crescent_cut");

    assert.ok(getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp);
    assert.ok(getCharacter(nextState, "enemy_2").hp < getCharacter(state, "enemy_2").hp);
  });

  it("Shadow Step can dash past a blocked path to an empty nearby cell", () => {
    const state = createInitialState(makeTestConfig({
      wall: { x: 1, y: 0 },
      skills: [{ ...unlockableSkills[3], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "shadow_step", { x: 2, y: 0 });

    assert.deepEqual(getPlayer(nextState).position, { x: 2, y: 0 });
  });

  it("Flowing Counter counterattacks once when the player is attacked", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 1, y: 0 }],
      skills: [{ ...unlockableSkills[2], initiallyUnlocked: true }]
    }));
    const counterState = useSkill(state, "player", "flowing_counter");
    const enemyTurnState = runEnemyTurn(counterState);

    assert.ok(getCharacter(enemyTurnState, "enemy_1").hp < getCharacter(counterState, "enemy_1").hp);
  });

  it("Dragon Palm can damage one enemy within three cells", () => {
    const state = createInitialState(makeTestConfig({
      enemyStarts: [{ x: 3, y: 0 }],
      skills: [{ ...unlockableSkills[4], initiallyUnlocked: true }]
    }));
    const nextState = useSkill(state, "player", "dragon_palm", { characterId: "enemy_1" });

    assert.ok(getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp);
  });
});

describe("combat system", () => {
  // Damage, defence, defeated flag and win/lose result.
  it("player can attack an adjacent enemy", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.ok(getCharacter(nextState, "enemy_1").hp < getCharacter(state, "enemy_1").hp);
  });

  it("player cannot attack an enemy outside attack range", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 3, y: 0 }] }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(nextState, state);
  });

  it("damage should reduce HP", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getCharacter(nextState, "enemy_1").hp, 4);
  });

  it("defence should reduce incoming damage", () => {
    const state = createInitialState(makeTestConfig({ enemyStarts: [{ x: 1, y: 0 }] }));
    const nextState = attackCharacter(state, "enemy_1", "player");

    assert.equal(getPlayer(nextState).hp, 10);
  });

  it("enemy is marked defeated when HP reaches zero", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }],
      playerAttack: 7
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(getCharacter(nextState, "enemy_1").defeated, true);
  });

  it("game is won when all enemies are defeated", () => {
    const state = createInitialState(makeTestConfig({
      enemyHp: 3,
      enemyStarts: [{ x: 1, y: 0 }],
      playerAttack: 7
    }));
    const nextState = attackCharacter(state, "player", "enemy_1");

    assert.equal(isGameOver(nextState), true);
    assert.equal(getWinner(nextState), "player");
  });

  it("game is lost when the player's HP reaches zero", () => {
    const state = createInitialState(makeTestConfig({
      playerHp: 3,
      playerDefence: 0,
      enemyAttack: 6,
      enemyStarts: [{ x: 1, y: 0 }]
    }));
    const nextState = attackCharacter(state, "enemy_1", "player");

    assert.equal(isGameOver(nextState), true);
    assert.equal(getWinner(nextState), "enemy");
  });
});
