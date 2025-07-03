type Point = { x: number; y: number };
type SHAPE = "circle" | "square";
type TARGET = "first" | "last" | "strong" | "weak" | "close" | "far";
type TowerData = {
  shape: SHAPE;
  colour: string;
  diameter: number;
  radius: number;
  cooldown: number;
  projectile: {
    speed: number;
    pierce: number;
    damage: number;
  };
  cost: number;
  target: TARGET;
};
type EnemyData = {
  speed: number;
  hp: number;
  shape: SHAPE;
  colour: string;
  diameter: number;
};

class Shape {
  shape: SHAPE;
  diameter: number;

  constructor(shape: SHAPE, diameter: number) {
    this.shape = shape;
    this.diameter = diameter;
  }

  get effectiveRadius(): number {
    if (this.shape === "circle") return this.diameter / 2;
    else if (this.shape === "square") return (this.diameter / 2) * Math.SQRT2;
    return 0;
  }

  draw(center: Point, defaultCtx: CanvasRenderingContext2D = ctx) {
    defaultCtx.beginPath();

    if (this.shape === "circle") {
      defaultCtx.arc(center.x, center.y, this.diameter / 2, 0, Math.PI * 2);
      defaultCtx.fill();
    } else if (this.shape === "square") {
      defaultCtx.fillRect(...this.getBoundingBox(center));
    }
  }

  getBoundingBox(center: Point): [number, number, number, number] {
    const half = this.diameter / 2;
    return [center.x - half, center.y - half, this.diameter, this.diameter];
  }
}

class Entity {
  x: number;
  y: number;
  speed: number = 0;
  angle: number = Math.PI / 2;
  hp: number = 1;

  targetPoint: Point | null = null;

  shape: Shape;
  colour: string = "#000";

  constructor(x: number, y: number, shape: Shape) {
    this.x = x;
    this.y = y;
    this.shape = shape;
  }

  draw() {
    ctx.fillStyle = this.colour;
    this.shape.draw(this.position);
  }

  get effectiveRadius() {
    return this.shape.effectiveRadius;
  }

  get position() {
    return { x: this.x, y: this.y };
  }

  update(deltaTime: number) {
    const moveDist = this.speed * (deltaTime / updateDelay);

    if (moveDist > 0) {
      if (this.targetPoint) {
        const dx = this.targetPoint.x - this.x;
        const dy = this.targetPoint.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist === 0) {
          this.targetPoint = null;
          return;
        }

        const dirX = dx / dist;
        const dirY = dy / dist;

        if (moveDist >= dist) {
          this.x = this.targetPoint.x;
          this.y = this.targetPoint.y;
          this.targetPoint = null;
        } else {
          this.x += dirX * moveDist;
          this.y += dirY * moveDist;
        }
      } else {
        this.x += Math.cos(this.angle) * moveDist;
        this.y += Math.sin(this.angle) * moveDist;
      }
    }
  }

  isOffScreen(buffer: number = 0) {
    return (
      this.x < -this.shape.diameter - buffer / 2 ||
      this.y < -this.shape.diameter - buffer / 2 ||
      this.x > canvas.width + this.shape.diameter + buffer / 2 ||
      this.y > canvas.height + this.shape.diameter + buffer / 2
    );
  }
}

class Tower extends Entity {
  radius: number = 1000 / 6;
  cooldown: number = 2000;
  lastShot: number = Date.now();

  projSpeed: number = 250;
  projPierce: number = 1;
  projDamage: number = 1;

  colour: string = "#0d0";

  cost: number = 0;
  target: TARGET = "first";

  constructor(x: number, y: number) {
    super(x, y, new Shape("circle", 37.5));
  }

  draw(showRadius = false) {
    super.draw();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2.5;

    if (showRadius) {
      ctx.save();

      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  update(deltaTime: number) {
    const now = Date.now();
    const elapsedTime = now - this.lastShot;
    if (elapsedTime < this.cooldown) return;

    // Build list of enemies in range with needed data
    const inRangeEnemies = enemies
      .filter((e) => {
        const r = e.effectiveRadius;
        return (
          e.x + r >= 0 &&
          e.x - r <= canvas.width &&
          e.y + r >= 0 &&
          e.y - r <= canvas.height &&
          distance(e.x, e.y, this.x, this.y) <= this.radius + r
        );
      })
      .map((e) => ({
        enemy: e,
        pathProgress: e.pathProgress,
        distToTower: distance(e.x, e.y, this.x, this.y),
        hp: e.hp,
        distToNext: distance(e.x, e.y, e.currentPath.x, e.currentPath.y),
      }));

    if (inRangeEnemies.length === 0) return;

    inRangeEnemies.sort((a, b) => {
      // Always sort by furthest along track first (descending pathProgress)
      if (a.pathProgress !== b.pathProgress) {
        return b.pathProgress - a.pathProgress;
      }

      // Tie-breaker depends on this.target
      switch (this.target) {
        case "first":
          // No further tie-break needed, already sorted by pathProgress
          return 0;

        case "last":
          // Want enemy least along the path, so ascending pathProgress
          return a.pathProgress - b.pathProgress;

        case "strong":
          // Higher HP first
          if (b.hp !== a.hp) return b.hp - a.hp;
          return 0;

        case "weak":
          // Lower HP first
          if (a.hp !== b.hp) return a.hp - b.hp;
          return 0;

        case "close":
          // Closer to tower first
          if (a.distToTower !== b.distToTower)
            return a.distToTower - b.distToTower;
          return 0;

        case "far":
          // Farther from tower first
          if (b.distToTower !== a.distToTower)
            return b.distToTower - a.distToTower;
          return 0;

        default:
          return 0;
      }
    });

    const targetEnemy = inRangeEnemies[0].enemy;

    if (targetEnemy) {
      const proj = new Projectile(
        this.x,
        this.y,
        new Shape("circle", 12.5),
        this,
        targetEnemy.position
      );
      projectiles.push(proj);
      this.lastShot = now;
    }
  }

  static parse(data: TowerData): Tower {
    const tower = new Tower(-1, -1);
    tower.shape = new Shape(data.shape, data.diameter);
    tower.colour = data.colour;
    tower.radius = data.radius;
    tower.cooldown = data.cooldown;
    tower.projSpeed = data.projectile.speed;
    tower.projPierce = data.projectile.pierce;
    tower.projDamage = data.projectile.damage;
    tower.cost = data.cost;
    tower.target = data.target;
    return tower;
  }
}

class Enemy extends Entity {
  colour = "#faa";
  speed = 100;
  hp = 1;

  pathIndex: number = 0;
  pathProgress: number = 0;

  constructor(x: number, y: number) {
    super(x, y, new Shape("circle", 37.5));
  }

  update(deltaTime: number) {
    this.targetPoint = this.path[this.pathProgress];
    super.update(deltaTime);

    if (this.targetPoint === null) {
      if (this.pathProgress >= this.path.length - 1) {
        removeFromArray(enemies, this);
        return;
      }
      this.pathProgress++;
      this.targetPoint = {
        x: this.path[this.pathProgress].x,
        y: this.path[this.pathProgress].y,
      };
    }
  }

  get path() {
    return paths[this.pathIndex].points;
  }

  get currentPath() {
    return paths[this.pathIndex].points[this.pathProgress];
  }

  static parse(data: EnemyData): Enemy {
    const enemy = new Enemy(-1, -1);
    enemy.hp = data.hp;
    enemy.shape = new Shape(data.shape, data.diameter);
    enemy.colour = data.colour;
    enemy.speed = data.speed;
    return enemy;
  }
}

class Projectile extends Entity {
  parent: Tower;
  hit: Set<Enemy> = new Set();

  speed = 250;
  hp = 1;
  damage: number = 1;
  lifeSpan: number = 10000;
  spawnTime: number;

  constructor(
    x: number,
    y: number,
    shape: Shape,
    parent: Tower,
    targetPoint: Point
  ) {
    super(x, y, shape);
    this.parent = parent;
    this.colour = parent.colour;
    this.speed = parent.projSpeed;
    this.hp = parent.projPierce;
    this.damage = parent.projDamage;

    const dx = targetPoint.x - this.x;
    const dy = targetPoint.y - this.y;
    this.angle = Math.atan2(dy, dx);

    this.spawnTime = Date.now();
  }

  update(deltaTime: number) {
    const now = Date.now();

    const prevX = this.x;
    const prevY = this.y;

    super.update(deltaTime);

    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(this.x, this.y);
    ctx.strokeStyle = "#f00";
    ctx.stroke();

    const hitEnemies: { enemy: Enemy; distSq: number }[] = [];

    for (const e of enemies) {
      if (this.hit.has(e)) continue;

      const totalRadius = this.shape.effectiveRadius + e.effectiveRadius;
      if (
        segmentIntersectsCircle(
          prevX,
          prevY,
          this.x,
          this.y,
          e.x,
          e.y,
          totalRadius
        )
      ) {
        const dx = e.x - prevX;
        const dy = e.y - prevY;
        const distSq = dx * dx + dy * dy;

        hitEnemies.push({ enemy: e, distSq });
      }
    }

    hitEnemies.sort((a, b) => a.distSq - b.distSq);

    for (const { enemy } of hitEnemies) {
      money += Math.min(enemy.hp, this.damage);
      enemy.hp -= this.damage;
      if (enemy.hp <= 0) removeFromArray(enemies, enemy);

      this.hit.add(enemy);
      if (this.hit.size >= this.hp) {
        removeFromArray(projectiles, this);
        return;
      }
    }

    if (this.isOffScreen()) removeFromArray(projectiles, this);
    if (now - this.spawnTime > this.lifeSpan) {
      removeFromArray(projectiles, this);
      return;
    }
  }
}

//

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}

function segmentIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
  const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

//

function canvasPosition(event: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mouseX = (event.clientX - rect.left) * scaleX;
  const mouseY = (event.clientY - rect.top) * scaleY;
  return { x: mouseX, y: mouseY };
}

function placeTower(event: MouseEvent) {
  updateMouse(event);

  const tower = Tower.parse(towerData[towerIndex]);
  if (tower.cost > money) return;

  tower.x = mouse.x;
  tower.y = mouse.y;

  for (const path of paths) {
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const dist = distanceToSegment(tower.x, tower.y, a.x, a.y, b.x, b.y);
      const combinedRadius = tower.shape.effectiveRadius + path.diameter / 2;
      if (dist < combinedRadius) return;
    }
  }

  for (const t of towers) {
    const minDist = tower.shape.effectiveRadius + t.shape.effectiveRadius;
    if (distance(tower.x, tower.y, t.x, t.y) < minDist) return;
  }

  if (
    tower.x - tower.shape.diameter / 2 < 0 &&
    tower.x + tower.shape.diameter / 2 > canvas.width &&
    tower.y - tower.shape.diameter / 2 < 0 &&
    tower.y + tower.shape.diameter / 2 > canvas.height
  )
    return;

  money -= tower.cost;
  towers.push(tower);

  updateMouse(event);
}

function deleteTower(event: MouseEvent) {
  event.preventDefault();
  updateMouse(event);
  if (hoveredTower) {
    removeFromArray(towers, hoveredTower);
    money += hoveredTower.cost;
  }
  updateMouse(event);
}

function updateMouse(event: MouseEvent) {
  mouse = canvasPosition(event);

  hoveredTower = null;
  let closestDist = Infinity;

  for (const t of towers) {
    const dist = distance(t.x, t.y, mouse.x, mouse.y);
    if (dist <= t.effectiveRadius && dist < closestDist) {
      closestDist = dist;
      hoveredTower = t;
    }
  }
}

function update(): void {
  if (document.visibilityState === "hidden") return;

  const now = Date.now();
  const deltaTime = (now - lastUpdate) / updateDelay;
  lastUpdate = now;

  enemyTimer += updateDelay * deltaTime;
  if (enemyTimer >= spawnDelay) {
    enemyTimer = 0;
    spawnEnemy();
  }

  for (const t of towers) t.update(deltaTime);
  for (const p of projectiles) p.update(deltaTime);
  for (const e of enemies) e.update(deltaTime);
}

function spawnEnemy() {
  const enemy = Enemy.parse(enemyData[enemyIndex]);

  // const angle = Math.random() * Math.PI * 2;

  // const radius = Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / 2;
  // const centreX = canvas.width / 2;
  // const centreY = canvas.height / 2;

  // const buffer = enemy.shape.diameter;
  // const x = centreX + Math.cos(angle) * (radius + buffer);
  // const y = centreY + Math.sin(angle) * (radius + buffer);

  // enemy.x = x;
  // enemy.y = y;

  enemy.pathIndex = pathIndex;
  enemy.x = enemy.currentPath.x;
  enemy.y = enemy.currentPath.y;
  enemies.push(enemy);

  pathIndex = (pathIndex + 1) % paths.length;
  enemyIndex = (enemyIndex + 1) % enemyData.length;
}

function startEndLoop() {
  if (document.visibilityState === "visible") {
    lastUpdate = Date.now();
    updateLoopId = setInterval(update, updateDelay);
  } else clearInterval(updateLoopId);
}

function removeFromArray(array: any[], item: any) {
  const index = array.indexOf(item);
  if (index > -1) {
    array.splice(index, 1);
  }
}

async function JSONLoad(path: string): Promise<any> {
  try {
    const res = await fetch(path);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Failed to load JSON:", err);
    return null;
  }
}

//

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const path of paths) {
    if (path.points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = path.colour;
      ctx.lineWidth = path.diameter;
      ctx.moveTo(path.points[0].x, path.points[0].y);

      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }

      ctx.stroke();
    }
  }

  for (const p of projectiles) p.draw();
  for (const t of towers) t.draw(hoveredTower === t);
  for (const e of enemies) e.draw();

  if (shiftDown) {
    const tower = Tower.parse(towerData[towerIndex]);
    tower.x = mouse.x;
    tower.y = mouse.y;

    ctx.save();
    ctx.globalAlpha = 1 / 3;
    tower.draw(true);
    ctx.restore();
  }

  moneyDiv.textContent = `\$${Math.floor(money)}`;
}

//

function loop(): void {
  draw();
  requestAnimationFrame(loop);
}

//

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const updateDelay = 25;
const towers: Tower[] = [];
const enemies: Enemy[] = [];
const projectiles: Projectile[] = [];
const paths: {
  diameter: number;
  colour: string;
  points: Point[];
}[] = await JSONLoad("src/data/paths.json");
const towerData = await JSONLoad("src/data/towers.json");
const enemyData = await JSONLoad("src/data/enemies.json");
const controlsDiv = document.getElementById("controls") as HTMLDivElement;
const moneyDiv = document.getElementById("money") as HTMLDivElement;

let lastUpdate = Date.now();
let updateLoopId = setInterval(update, updateDelay);
let mouse: Point = { x: 0, y: 0 };
let hoveredTower: Tower | null = null;
let enemyTimer = 0;
let spawnDelay = 1000;
let pathIndex = 0;
let towerIndex = 0;
let enemyIndex = 0;
let selectedButton: HTMLButtonElement | null = null;
let shiftDown = false;
let money = 20;

for (let i = 0; i < towerData.length; i++) {
  const t = towerData[i];

  const button = document.createElement("button");

  if (!selectedButton) {
    selectedButton = button;
    button.classList.add("selected");
  }

  button.onclick = () => {
    if (selectedButton) selectedButton.classList.remove("selected");
    selectedButton = button;
    button.classList.add("selected");
    towerIndex = i;
  };

  const miniCanvas = document.createElement("canvas");
  miniCanvas.width = 40;
  miniCanvas.height = 40;

  const miniCtx = miniCanvas.getContext("2d")!;
  miniCtx.fillStyle = t.colour;

  const shape = new Shape(t.shape, t.diameter);
  shape.draw({ x: 20, y: 20 }, miniCtx);

  const img = new Image();
  img.src = miniCanvas.toDataURL();

  const label = document.createElement("span");
  label.textContent = `$${t.cost}`;
  label.className = "button-label";

  button.appendChild(img);
  button.appendChild(label);
  controlsDiv.append(button);
}

canvas.addEventListener("click", placeTower);
canvas.addEventListener("contextmenu", deleteTower);
canvas.addEventListener("mousemove", updateMouse);
document.addEventListener("visibilitychange", startEndLoop);
document.addEventListener("keydown", (event) => {
  if (event.code === "ShiftLeft") shiftDown = true;
});
document.addEventListener("keyup", (event) => {
  if (event.code === "ShiftLeft") shiftDown = false;
});
canvas.addEventListener("mouseenter", updateMouse);

loop();

export {};
