# Wulin: Computing 2 Coursework Submission

Wulin is a simple 2D grid-based martial arts tactical roguelike prototype. It uses plain HTML, CSS, and JavaScript. The pure game rules are in `web-app/game.js`, while `web-app/main.js` only loads data, renders the page, and handles user input.

## How to Run

Open `web-app/index.html` in a browser. If the browser blocks `fetch()` for local JSON files, run a small local server from the repository root and open the page through that server.

```bash
python3 -m http.server
```

Then open `http://localhost:8000/web-app/`.

## Game Concept

The player controls a martial arts disciple on a 10x10 board. Each player round allows one movement and one main action. The player can move first and then attack, but cannot attack first and then move. Water and mountain cells block movement. Enemies move toward the player on their turn and attack when adjacent. The player wins by defeating all enemies and loses when HP reaches zero.

Player skills:

- `Sword Slash`: melee damage skill.
- `Qi Step`: temporarily increases movement range.
- `Inner Guard`: reduces incoming damage for one enemy turn.
- `Crescent Cut`: damages all adjacent enemies.
- `Piercing Thrust`: melee damage that partially ignores defence.
- `Flowing Counter`: counterattacks once if the player is attacked next enemy turn.
- `Shadow Step`: dashes to a nearby empty cell while ignoring obstacles on the path.
- `Dragon Palm`: ranged qi damage against one enemy within 3 cells.
- `Golden Bell`: completely blocks the next damage taken.
- `Iron Sand Palm`: melee damage that pushes the target back one cell.
- `Soul Seizing`: makes the target's next attack hit its nearest living team mate.

When an enemy is defeated, one random locked skill is learned automatically and a message such as `Dragon Palm learned.` is added to the battle log.

## Data Files

The app loads data with `fetch()` from:

- `web-app/assets/data/characters.json`
- `web-app/assets/data/skills.json`
- `web-app/assets/data/map1.json`

These JSON files are treated as exported spreadsheet data. They keep balancing values and map layout separate from the JavaScript logic, so placeholder graphics can later be replaced with image assets in `web-app/assets/characters`, `web-app/assets/tiles`, and `web-app/assets/ui`.

## Game Module API

The pure game API is exported from `web-app/game.js` and is also exposed in the browser console as `window.Game`. The current browser game state is exposed as `window.gameState`.

| Function | Returns | Purpose |
| --- | --- | --- |
| `createInitialState(config)` | `object` | Creates a new game state from character, skill, and map data. |
| `getCurrentTurn(gameState)` | `string` | Returns whether it is the player turn or enemy turn. |
| `getBoardSize(gameState)` | `object` | Returns the board width and height. |
| `getCharacter(gameState, characterId)` | `object` or `undefined` | Returns one character by id. |
| `getPlayer(gameState)` | `object` | Returns the player character. |
| `getEnemies(gameState)` | `object[]` | Returns all enemy characters. |
| `getCell(gameState, x, y)` | `object` or `undefined` | Returns tile data for one board cell. |
| `isInsideBoard(gameState, x, y)` | `boolean` | Checks whether a position is inside the board. |
| `isCellBlocked(gameState, x, y)` | `boolean` | Checks whether a cell blocks movement. |
| `isCellOccupied(gameState, x, y)` | `boolean` | Checks whether a living character is on a cell. |
| `getDistance(a, b)` | `number` | Returns Manhattan distance between two positions or characters. |
| `getReachableCells(gameState, characterId)` | `object[]` | Returns empty cells that a character can move to this turn. |
| `moveCharacter(gameState, characterId, targetX, targetY)` | `object` | Moves a character if the target cell is reachable. |
| `attackCharacter(gameState, attackerId, targetId)` | `object` | Attacks a target if it is in range and the attacker can act. |
| `useSkill(gameState, characterId, skillId, target)` | `object` | Applies a skill effect such as damage, guard, counter, or dash. |
| `getUnlockedSkills(gameState)` | `object[]` | Returns skills currently available to the player. |
| `runEnemyTurn(gameState)` | `object` | Resolves enemy movement and attacks, then returns to player turn if the game continues. |
| `endTurn(gameState)` | `object` | Changes the current turn. |
| `isGameOver(gameState)` | `boolean` | Checks whether either side has won. |
| `getWinner(gameState)` | `string` or `null` | Returns `player`, `enemy`, or `null` if the game is still running. |

Most state-changing functions return a new game state. Invalid actions return the original state unchanged, which makes the module easier to test.

## Unit Test Specification

Movement tests:

- Player can move to a reachable empty cell.
- Player cannot move outside the board.
- Player cannot move further than movement range.
- Player cannot move onto a blocked tile.
- Player cannot move onto a water tile.
- Player cannot move onto an occupied cell.
- A valid move updates the player's position.
- An invalid move does not mutate the original state.
- Player can still attack after moving once.
- Player cannot move twice in one round.
- Player cannot move after attacking once.
- Qi Step cannot be used after movement has already been spent.

Combat tests:

- Player can attack an adjacent enemy.
- Player cannot attack an enemy outside attack range.
- Damage should reduce HP.
- Defence should reduce incoming damage.
- Enemy is marked defeated when HP reaches zero.
- Game is won when all enemies are defeated.
- Game is lost when the player's HP reaches zero.

Skill tests:

- Defeating an enemy automatically unlocks one locked skill.
- Learning a skill adds a battle log message.
- Defeating the last enemy wins without learning a final skill.
- Crescent Cut damages all adjacent enemies.
- Shadow Step can dash past a blocked path to an empty nearby cell.
- Flowing Counter counterattacks once when the player is attacked.
- Dragon Palm can damage one enemy within three cells.
- Golden Bell blocks the next damage taken.
- Iron Sand Palm damages and pushes an enemy back one cell.
- Soul Seizing makes an enemy attack its nearest living team mate next time.

## Running Tests

```bash
npm install
npm test
```

Tests are implemented with Mocha in `web-app/tests/game.test.js`.

Acknowledgement: ChatGPT is used to generate images for character and map.
