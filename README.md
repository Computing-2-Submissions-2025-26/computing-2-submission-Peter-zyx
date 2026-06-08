# Grid Tactics: Computing 2 Coursework Submission

Grid Tactics is a simple 2D grid-based martial arts tactical roguelike prototype. It uses plain HTML, CSS, and JavaScript. The pure game rules are in `web-app/game.js`, while `web-app/main.js` only loads data, renders the page, and handles user input.

## How to Run

Open `web-app/index.html` in a browser. If the browser blocks `fetch()` for local JSON files, run a small local server from the repository root and open the page through that server.

```bash
python3 -m http.server
```

Then open `http://localhost:8000/web-app/`.

## Game Concept

The player controls a martial arts disciple on a 10x10 board. Each player round allows one movement and one main action, so the player can move and still attack, or attack and then move. Enemies move toward the player on their turn and attack when adjacent. The player wins by defeating all enemies and loses when HP reaches zero.

Player skills:

- `Sword Slash`: melee damage skill.
- `Qi Step`: temporarily increases movement range.
- `Inner Guard`: reduces incoming damage for one enemy turn.
- `Crescent Cut`: damages all adjacent enemies.
- `Piercing Thrust`: melee damage that partially ignores defence.
- `Flowing Counter`: counterattacks once if the player is attacked next enemy turn.
- `Shadow Step`: dashes to a nearby empty cell while ignoring obstacles on the path.
- `Dragon Palm`: ranged qi damage against one enemy within 3 cells.

When an enemy is defeated, one random locked skill is learned automatically and a message such as `Dragon Palm learned.` is added to the battle log.

## Data Files

The app loads data with `fetch()` from:

- `web-app/assets/data/characters.json`
- `web-app/assets/data/skills.json`
- `web-app/assets/data/map1.json`

These JSON files are treated as exported spreadsheet data. They keep balancing values and map layout separate from the JavaScript logic, so placeholder graphics can later be replaced with image assets in `web-app/assets/characters`, `web-app/assets/tiles`, and `web-app/assets/ui`.

## Game Module API

The pure game API is exported from `web-app/game.js` and is also exposed in the browser console as `window.Game`. The current browser game state is exposed as `window.gameState`.

```js
createInitialState(config)
getCurrentTurn(gameState)
getBoardSize(gameState)
getCharacter(gameState, characterId)
getPlayer(gameState)
getEnemies(gameState)
getCell(gameState, x, y)
isInsideBoard(gameState, x, y)
isCellBlocked(gameState, x, y)
isCellOccupied(gameState, x, y)
getDistance(a, b)
getReachableCells(gameState, characterId)
moveCharacter(gameState, characterId, targetX, targetY)
attackCharacter(gameState, attackerId, targetId)
useSkill(gameState, characterId, skillId, target)
getUnlockedSkills(gameState)
runEnemyTurn(gameState)
endTurn(gameState)
isGameOver(gameState)
getWinner(gameState)
```

Most state-changing functions return a new game state. Invalid actions return the original state unchanged, which makes the module easier to test.

## Unit Test Specification

Movement tests:

- Player can move to a reachable empty cell.
- Player cannot move outside the board.
- Player cannot move further than movement range.
- Player cannot move onto a blocked tile.
- Player cannot move onto an occupied cell.
- A valid move updates the player's position.
- An invalid move does not mutate the original state.
- Player can still attack after moving once.
- Player cannot move twice in one round.
- Player can still move after attacking once.
- Qi Step cannot be used after movement has already been spent.

Combat tests:

- Player can attack an adjacent enemy.
- Player cannot attack an enemy outside attack range.
- Damage should reduce HP.
- Defence should reduce incoming damage.
- Enemy is marked defeated when HP reaches zero.
- Game is won when all enemies are defeated.
- Game is lost when the player's HP reaches zero.

## Running Tests

```bash
npm install
npm test
```

Tests are implemented with Mocha in `web-app/tests/game.test.js`.
