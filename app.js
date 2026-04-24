"use strict";

const CONFIG = {
  gridSize: 4,
  teams: {
    player: ["gray", "red", "red", "blue"],
    ai: ["gray", "red", "blue", "gray"],
  },
  colorStats: {
    gray: { hp: 2 },
    red: { hp: 1 },
    blue: { hp: 1 },
  },
  activationOrder: [1, 2, 3, 4],
  maxLogEntries: 200,
};

const ORIENTATION = { player: -1, ai: 1 };

const ui = {
  aiGrid: document.getElementById("ai-grid"),
  playerGrid: document.getElementById("player-grid"),
  aiReserve: document.getElementById("ai-reserve-list"),
  playerReserve: document.getElementById("player-reserve-list"),
  phaseLabel: document.getElementById("phase-label"),
  roundLabel: document.getElementById("round-label"),
  activationLabel: document.getElementById("activation-label"),
  specialTokenLabel: document.getElementById("special-token-label"),
  specialTokenLabelRight: document.getElementById("special-token-label-right"),
  winnerLabel: document.getElementById("winner-label"),
  controlHint: document.getElementById("control-hint"),
  controls: document.getElementById("controls"),
  moveSkipBtn: document.getElementById("move-skip-btn"),
  normalActionBtn: document.getElementById("normal-action-btn"),
  specialActionBtn: document.getElementById("special-action-btn"),
  passActionBtn: document.getElementById("pass-action-btn"),
  combatLog: document.getElementById("combat-log"),
  newGameBtn: document.getElementById("new-game-btn"),
};

let state;

function createInitialState() {
  const units = [];
  for (const side of ["player", "ai"]) {
    CONFIG.teams[side].forEach((color, idx) => {
      units.push({
        id: `${side}-${idx + 1}`,
        side,
        initiative: idx + 1,
        color,
        maxHp: CONFIG.colorStats[color].hp,
        hp: CONFIG.colorStats[color].hp,
        armor: 0,
        row: null,
        col: null,
        alive: true,
      });
    });
  }

  return {
    phase: "placement",
    round: 0,
    specialTokens: 0,
    delayedSpecialTokens: 0,
    placementStep: 0,
    placedCount: 0,
    turnQueue: [],
    turnIndex: 0,
    selectedMove: null,
    gameOver: false,
    winner: null,
    log: ["Nouvelle partie."],
    units,
  };
}

function getUnit(side, initiative) {
  return state.units.find((u) => u.side === side && u.initiative === initiative);
}

function getUnitById(id) {
  return state.units.find((u) => u.id === id);
}

function getAliveUnits(side = null) {
  return state.units.filter((u) => u.alive && (side ? u.side === side : true));
}

function isInside(row, col) {
  return row >= 0 && row < CONFIG.gridSize && col >= 0 && col < CONFIG.gridSize;
}

function getUnitsInColumn(col) {
  return getAliveUnits().filter((u) => u.col === col);
}

function getOccupant(side, row, col) {
  return getAliveUnits(side).find((u) => u.row === row && u.col === col) || null;
}

function placeUnit(unit, row, col) {
  unit.row = row;
  unit.col = col;
  addLog(`${labelUnit(unit)} placé en (${row + 1}, ${col + 1}).`);
}

function addLog(message) {
  state.log.unshift(message);
  if (state.log.length > CONFIG.maxLogEntries) {
    state.log.length = CONFIG.maxLogEntries;
  }
}

function labelUnit(unit) {
  const owner = unit.side === "player" ? "J" : "IA";
  return `${owner}${unit.initiative} ${unit.color}`;
}

function getCurrentPlacementActor() {
  const order = [];
  for (const i of CONFIG.activationOrder) {
    order.push({ side: "player", initiative: i });
    order.push({ side: "ai", initiative: i });
  }
  return order[state.placementStep] || null;
}

function getCurrentUnit() {
  if (state.phase !== "battle") return null;
  return state.turnQueue[state.turnIndex] || null;
}

function getForwardEnemyTarget(attacker) {
  const enemySide = attacker.side === "player" ? "ai" : "player";
  const enemies = getAliveUnits(enemySide).filter((e) => e.col === attacker.col);
  if (!enemies.length) return null;
  enemies.sort((a, b) => {
    if (attacker.side === "player") return a.row - b.row;
    return b.row - a.row;
  });
  return enemies[0];
}

function getAlliedBehindCount(unit) {
  return getAliveUnits(unit.side).filter((ally) => {
    if (ally.id === unit.id || ally.col !== unit.col) return false;
    if (unit.side === "player") return ally.row > unit.row;
    return ally.row < unit.row;
  }).length;
}

function applyDamage(target, amount, sourceLabel) {
  if (!target || amount <= 0 || !target.alive) return 0;
  let remaining = amount;
  const absorbed = Math.min(target.armor, remaining);
  target.armor -= absorbed;
  remaining -= absorbed;
  if (remaining > 0) target.hp -= remaining;

  const dealt = amount - Math.max(0, remaining - Math.max(0, target.hp * -1));
  addLog(`${sourceLabel} inflige ${amount} à ${labelUnit(target)} (armure -${absorbed}, PV ${Math.max(0, target.hp)}).`);

  if (target.hp <= 0) {
    target.alive = false;
    target.row = null;
    target.col = null;
    addLog(`${labelUnit(target)} est détruit.`);
  }
  return dealt;
}

function evaluateNormalDamage(actor, position = { row: actor.row, col: actor.col }) {
  if (!actor.alive) return { damage: 0, kills: 0, possible: false };
  const fake = { ...actor, row: position.row, col: position.col };

  if (actor.color === "gray") return { damage: 0, kills: 0, possible: true };

  if (actor.color === "red") {
    const target = getForwardEnemyTarget(fake);
    if (!target) return { damage: 0, kills: 0, possible: false };
    const hpAfterArmor = target.hp + target.armor;
    return { damage: Math.min(2, hpAfterArmor), kills: hpAfterArmor <= 2 ? 1 : 0, possible: true };
  }

  if (actor.color === "blue") {
    const targets = getUnitsInColumn(fake.col).filter((u) => u.id !== actor.id);
    if (!targets.length) return { damage: 0, kills: 0, possible: false };
    let total = 0;
    let kills = 0;
    for (const t of targets) {
      const hpAfterArmor = t.hp + t.armor;
      total += Math.min(1, hpAfterArmor);
      if (hpAfterArmor <= 1) kills += 1;
    }
    return { damage: total, kills, possible: true };
  }

  return { damage: 0, kills: 0, possible: false };
}

function evaluateSpecialDamage(actor, position = { row: actor.row, col: actor.col }) {
  if (state.specialTokens <= 0 || !actor.alive) return { damage: 0, kills: 0, possible: false };
  const fake = { ...actor, row: position.row, col: position.col };

  if (actor.color === "blue") {
    return { damage: 0, kills: 0, possible: true, utility: 2 };
  }

  if (actor.color === "red") {
    const enemies = getAliveUnits(actor.side === "player" ? "ai" : "player");
    if (!enemies.length) return { damage: 0, kills: 0, possible: false };
    // Estimation simple: jusqu'à 2 dégâts potentiels.
    const fragile = enemies.filter((e) => e.hp + e.armor <= 1).length;
    return { damage: Math.min(2, enemies.length ? 2 : 0), kills: Math.min(2, fragile), possible: true };
  }

  if (actor.color === "gray") {
    const target = getForwardEnemyTarget(fake);
    if (!target) return { damage: 0, kills: 0, possible: false };
    const amount = getAlliedBehindCount(fake);
    if (amount <= 0) return { damage: 0, kills: 0, possible: true };
    const hpAfterArmor = target.hp + target.armor;
    return { damage: Math.min(amount, hpAfterArmor), kills: hpAfterArmor <= amount ? 1 : 0, possible: true };
  }

  return { damage: 0, kills: 0, possible: false };
}

function performNormalAction(actor) {
  if (!actor.alive) return;
  if (actor.color === "gray") {
    addLog(`${labelUnit(actor)} passe (gris sans attaque offensive).`);
    return;
  }

  if (actor.color === "red") {
    const target = getForwardEnemyTarget(actor);
    if (!target) {
      addLog(`${labelUnit(actor)} attaque rouge échoue (aucune cible).`);
      return;
    }
    applyDamage(target, 2, `${labelUnit(actor)} attaque rouge`);
    return;
  }

  if (actor.color === "blue") {
    const targets = getUnitsInColumn(actor.col).filter((u) => u.id !== actor.id);
    if (!targets.length) {
      addLog(`${labelUnit(actor)} attaque bleue sans effet (colonne vide).`);
      return;
    }
    for (const target of targets) {
      if (target.alive) applyDamage(target, 1, `${labelUnit(actor)} attaque bleue`);
    }
  }
}

function performSpecialAction(actor) {
  if (state.specialTokens <= 0) {
    addLog(`${labelUnit(actor)} tente un spécial sans jeton.`);
    return false;
  }
  state.specialTokens -= 1;

  if (actor.color === "blue") {
    state.delayedSpecialTokens += 2;
    addLog(`${labelUnit(actor)} lance spécial bleu: +2 jetons au round suivant.`);
    return true;
  }

  if (actor.color === "red") {
    const enemySide = actor.side === "player" ? "ai" : "player";
    for (let i = 0; i < 2; i += 1) {
      const enemies = getAliveUnits(enemySide);
      if (!enemies.length) break;
      const target = enemies[Math.floor(Math.random() * enemies.length)];
      applyDamage(target, 1, `${labelUnit(actor)} spécial rouge`);
    }
    return true;
  }

  if (actor.color === "gray") {
    const target = getForwardEnemyTarget(actor);
    const amount = getAlliedBehindCount(actor);
    if (!target) {
      addLog(`${labelUnit(actor)} spécial gris échoue (aucune cible).`);
      return true;
    }
    if (amount <= 0) {
      addLog(`${labelUnit(actor)} spécial gris sans allié derrière (0 dégât).`);
      return true;
    }
    applyDamage(target, amount, `${labelUnit(actor)} spécial gris`);
    return true;
  }

  return true;
}

function moveUnit(unit, row, col) {
  if (!unit.alive) return false;
  if (unit.row === row && unit.col === col) return true;
  const dist = Math.abs(unit.row - row) + Math.abs(unit.col - col);
  if (dist !== 1) return false;
  if (!isInside(row, col) || getOccupant(unit.side, row, col)) return false;
  unit.row = row;
  unit.col = col;
  addLog(`${labelUnit(unit)} se déplace en (${row + 1}, ${col + 1}).`);
  return true;
}

function getPossibleMoves(unit) {
  if (!unit || !unit.alive) return [];
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return deltas
    .map(([dr, dc]) => ({ row: unit.row + dr, col: unit.col + dc }))
    .filter((p) => isInside(p.row, p.col) && !getOccupant(unit.side, p.row, p.col));
}

function startBattle() {
  state.phase = "battle";
  state.round = 0;
  state.turnIndex = 0;
  state.turnQueue = [];
  startNextRound();
}

function startNextRound() {
  if (state.gameOver) return;
  state.round += 1;
  state.specialTokens += 1;
  if (state.delayedSpecialTokens > 0) {
    addLog(`Bonus différé: +${state.delayedSpecialTokens} jetons spéciaux.`);
    state.specialTokens += state.delayedSpecialTokens;
    state.delayedSpecialTokens = 0;
  }

  for (const unit of getAliveUnits()) {
    unit.armor = 0;
  }

  for (const unit of getAliveUnits().filter((u) => u.color === "gray")) {
    unit.armor += 1;
  }

  state.turnQueue = [];
  for (const initiative of CONFIG.activationOrder) {
    state.turnQueue.push(getUnit("player", initiative));
    state.turnQueue.push(getUnit("ai", initiative));
  }
  state.turnIndex = 0;
  addLog(`--- Début round ${state.round} ---`);
  resolveTurns();
}

function advanceTurn() {
  state.turnIndex += 1;
  state.selectedMove = null;
}

function checkWinner() {
  const playerAlive = getAliveUnits("player").length;
  const aiAlive = getAliveUnits("ai").length;
  if (playerAlive === 0 || aiAlive === 0) {
    state.gameOver = true;
    state.phase = "finished";
    state.winner = playerAlive > 0 ? "player" : "ai";
    addLog(state.winner === "player" ? "Victoire du joueur." : "Défaite: l'IA gagne.");
    return true;
  }
  return false;
}

function resolveTurns() {
  if (state.phase !== "battle" || state.gameOver) {
    render();
    return;
  }

  const current = getCurrentUnit();
  if (!current) {
    startNextRound();
    render();
    return;
  }

  if (!current.alive) {
    advanceTurn();
    resolveTurns();
    return;
  }

  if (current.side === "ai") {
    runAiTurn(current);
    if (!checkWinner()) {
      advanceTurn();
      resolveTurns();
    }
    render();
    return;
  }

  render();
}

function chooseAiPlacementCell(unit) {
  const freeCells = [];
  for (let r = 0; r < CONFIG.gridSize; r += 1) {
    for (let c = 0; c < CONFIG.gridSize; c += 1) {
      if (!getOccupant("ai", r, c)) freeCells.push({ row: r, col: c });
    }
  }

  const byCenter = [...freeCells].sort((a, b) => {
    const da = Math.abs(a.col - 1.5);
    const db = Math.abs(b.col - 1.5);
    return da - db;
  });

  if (unit.color === "gray") {
    return byCenter[0] || freeCells[0];
  }

  const sparseColumns = freeCells
    .map((cell) => {
      const occupancy = getAliveUnits("ai").filter((u) => u.col === cell.col).length;
      return { ...cell, occupancy };
    })
    .sort((a, b) => a.occupancy - b.occupancy || Math.abs(a.col - 1.5) - Math.abs(b.col - 1.5));

  return sparseColumns[0] || freeCells[0];
}

function handlePlacementClick(side, row, col) {
  if (state.phase !== "placement" || state.gameOver) return;
  const actor = getCurrentPlacementActor();
  if (!actor || actor.side !== side) return;

  const unit = getUnit(actor.side, actor.initiative);
  if (getOccupant(side, row, col)) return;

  placeUnit(unit, row, col);
  state.placementStep += 1;
  state.placedCount += 1;

  if (state.placedCount >= 8) {
    addLog("Placement terminé. Début du combat.");
    startBattle();
    render();
    return;
  }

  const nextActor = getCurrentPlacementActor();
  if (nextActor?.side === "ai") {
    const aiUnit = getUnit(nextActor.side, nextActor.initiative);
    const aiCell = chooseAiPlacementCell(aiUnit);
    placeUnit(aiUnit, aiCell.row, aiCell.col);
    state.placementStep += 1;
    state.placedCount += 1;
    if (state.placedCount >= 8) {
      addLog("Placement terminé. Début du combat.");
      startBattle();
    }
  }
  render();
}

function collectAiCandidates(actor) {
  const positions = [{ row: actor.row, col: actor.col, moved: false }, ...getPossibleMoves(actor).map((m) => ({ ...m, moved: true }))];
  const candidates = [];

  for (const pos of positions) {
    const normal = evaluateNormalDamage(actor, pos);
    candidates.push({ mode: "normal", pos, score: normal.kills * 100 + normal.damage * 10 + (normal.possible ? 1 : 0), details: normal });

    const special = evaluateSpecialDamage(actor, pos);
    if (special.possible && state.specialTokens > 0) {
      const utility = special.utility || 0;
      candidates.push({ mode: "special", pos, score: special.kills * 100 + special.damage * 10 + utility + 2, details: special });
    }

    candidates.push({ mode: "pass", pos, score: (pos.moved ? 1 : 0) + (2 - Math.abs(pos.col - 1.5)), details: { damage: 0, kills: 0 } });
  }

  return candidates;
}

function runAiTurn(actor) {
  const candidates = collectAiCandidates(actor).sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best) {
    addLog(`${labelUnit(actor)} IA passe (aucune action).`);
    return;
  }

  if (best.pos.row !== actor.row || best.pos.col !== actor.col) {
    moveUnit(actor, best.pos.row, best.pos.col);
  }

  if (best.mode === "special") {
    performSpecialAction(actor);
  } else if (best.mode === "normal") {
    performNormalAction(actor);
  } else {
    addLog(`${labelUnit(actor)} passe.`);
  }
}

function handlePlayerCellClick(side, row, col) {
  const actor = getCurrentUnit();
  if (state.phase !== "battle" || state.gameOver || !actor || actor.side !== "player") return;
  if (side !== "player") return;

  const options = getPossibleMoves(actor);
  const selected = options.find((o) => o.row === row && o.col === col);
  if (!selected) return;
  state.selectedMove = selected;
  render();
}

function completePlayerAction(mode) {
  const actor = getCurrentUnit();
  if (state.phase !== "battle" || state.gameOver || !actor || actor.side !== "player") return;

  if (state.selectedMove) {
    moveUnit(actor, state.selectedMove.row, state.selectedMove.col);
  }

  if (mode === "special") {
    if (state.specialTokens <= 0) {
      addLog("Aucun jeton spécial disponible.");
      render();
      return;
    }
    performSpecialAction(actor);
  } else if (mode === "normal") {
    performNormalAction(actor);
  } else {
    addLog(`${labelUnit(actor)} passe.`);
  }

  if (!checkWinner()) {
    advanceTurn();
    resolveTurns();
  }
  render();
}

function makeCell(side, row, col) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "cell";
  cell.addEventListener("click", () => {
    if (state.phase === "placement") {
      handlePlacementClick(side, row, col);
    } else {
      handlePlayerCellClick(side, row, col);
    }
  });

  const occupant = getOccupant(side, row, col);
  if (occupant) {
    const piece = renderPiece(occupant);
    cell.appendChild(piece);
  }

  const current = getCurrentUnit();
  if (
    state.phase === "battle" &&
    current &&
    current.side === "player" &&
    current.alive &&
    side === "player"
  ) {
    const canMove = getPossibleMoves(current).some((m) => m.row === row && m.col === col);
    if (canMove) cell.classList.add("can-move");
  }

  if (state.phase === "placement") {
    const actor = getCurrentPlacementActor();
    if (actor?.side === side && !occupant) {
      cell.classList.add("selectable");
    }
  }

  return cell;
}

function renderPiece(unit, inReserve = false) {
  const piece = document.createElement("div");
  piece.className = `piece ${unit.color}`;
  if (inReserve) piece.classList.add("reserve-token");

  const active = getCurrentUnit();
  if (active?.id === unit.id && state.phase === "battle") piece.classList.add("active");

  piece.textContent = String(unit.initiative);
  const stats = document.createElement("span");
  const armorText = unit.armor > 0 ? ` A:${unit.armor}` : "";
  stats.className = "stats";
  stats.textContent = `PV:${Math.max(0, unit.hp)}${armorText}`;
  piece.appendChild(stats);
  return piece;
}

function renderGrid(side) {
  const container = side === "ai" ? ui.aiGrid : ui.playerGrid;
  container.innerHTML = "";
  for (let r = 0; r < CONFIG.gridSize; r += 1) {
    for (let c = 0; c < CONFIG.gridSize; c += 1) {
      container.appendChild(makeCell(side, r, c));
    }
  }
}

function renderReserve(side) {
  const container = side === "ai" ? ui.aiReserve : ui.playerReserve;
  container.innerHTML = "";
  const units = CONFIG.teams[side].map((_, idx) => getUnit(side, idx + 1));
  for (const unit of units) {
    const piece = renderPiece(unit, true);
    if (unit.row !== null) piece.classList.remove("reserve-token");
    else piece.classList.add("available");
    container.appendChild(piece);
  }
}

function renderStatus() {
  const phaseMap = {
    placement: "Placement",
    battle: "Combat",
    finished: "Terminé",
  };
  ui.phaseLabel.textContent = phaseMap[state.phase] || state.phase;
  ui.roundLabel.textContent = String(state.round);
  ui.specialTokenLabel.textContent = String(state.specialTokens);
  if (ui.specialTokenLabelRight) {
    ui.specialTokenLabelRight.textContent = String(state.specialTokens);
  }

  if (state.phase === "placement") {
    const actor = getCurrentPlacementActor();
    if (actor) {
      const unit = getUnit(actor.side, actor.initiative);
      ui.activationLabel.textContent = `${actor.side === "player" ? "Joueur" : "IA"} place ${labelUnit(unit)}`;
    } else {
      ui.activationLabel.textContent = "-";
    }
  } else {
    const current = getCurrentUnit();
    ui.activationLabel.textContent = current ? labelUnit(current) : "-";
  }

  ui.winnerLabel.textContent =
    state.phase === "finished"
      ? state.winner === "player"
        ? "Victoire du joueur"
        : "Défaite: l'IA gagne"
      : "";
}

function renderControls() {
  const current = getCurrentUnit();
  const playerTurn = state.phase === "battle" && current?.side === "player" && !state.gameOver;
  ui.controls.style.display = playerTurn ? "block" : "none";

  if (!playerTurn) return;

  const moves = getPossibleMoves(current);
  ui.controlHint.textContent =
    `Choisis une case en surbrillance pour te déplacer (optionnel), puis sélectionne une action.` +
    ` Déplacements possibles: ${moves.length}.`;
  ui.specialActionBtn.disabled = state.specialTokens <= 0;
}

function renderLog() {
  ui.combatLog.innerHTML = "";
  for (const line of state.log) {
    const li = document.createElement("li");
    li.textContent = line;
    ui.combatLog.appendChild(li);
  }
}

function render() {
  renderGrid("ai");
  renderGrid("player");
  renderReserve("ai");
  renderReserve("player");
  renderStatus();
  renderControls();
  renderLog();
}

function bindEvents() {
  ui.newGameBtn.addEventListener("click", () => {
    state = createInitialState();
    render();
  });

  ui.moveSkipBtn.addEventListener("click", () => {
    state.selectedMove = null;
    addLog("Le joueur choisit de rester sur place.");
    render();
  });

  ui.normalActionBtn.addEventListener("click", () => completePlayerAction("normal"));
  ui.specialActionBtn.addEventListener("click", () => completePlayerAction("special"));
  ui.passActionBtn.addEventListener("click", () => completePlayerAction("pass"));
}

function bootstrap() {
  state = createInitialState();
  bindEvents();
  render();
}

bootstrap();
