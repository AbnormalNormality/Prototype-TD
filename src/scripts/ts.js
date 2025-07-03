class Shape {
    constructor(shape, diameter) {
        this.shape = shape;
        this.diameter = diameter;
    }
    get effectiveRadius() {
        if (this.shape === "circle")
            return this.diameter / 2;
        else if (this.shape === "square")
            return (this.diameter / 2) * Math.SQRT2;
        return 0;
    }
    draw(center, defaultCtx = ctx) {
        defaultCtx.beginPath();
        if (this.shape === "circle") {
            defaultCtx.arc(center.x, center.y, this.diameter / 2, 0, Math.PI * 2);
            defaultCtx.fill();
        }
        else if (this.shape === "square") {
            defaultCtx.fillRect(...this.getBoundingBox(center));
        }
    }
    getBoundingBox(center) {
        const half = this.diameter / 2;
        return [center.x - half, center.y - half, this.diameter, this.diameter];
    }
}
class Entity {
    constructor(x, y, shape) {
        this.speed = 0;
        this.angle = Math.PI / 2;
        this.targetPoint = null;
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
    update(deltaTime) {
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
                }
                else {
                    this.x += dirX * moveDist;
                    this.y += dirY * moveDist;
                }
            }
            else {
                this.x += Math.cos(this.angle) * moveDist;
                this.y += Math.sin(this.angle) * moveDist;
            }
        }
    }
    isOffScreen(buffer = 0) {
        return (this.x < -this.shape.diameter - buffer / 2 ||
            this.y < -this.shape.diameter - buffer / 2 ||
            this.x > canvas.width + this.shape.diameter + buffer / 2 ||
            this.y > canvas.height + this.shape.diameter + buffer / 2);
    }
}
class Tower extends Entity {
    constructor(x, y) {
        super(x, y, new Shape("circle", 37.5));
        this.radius = 1000 / 6;
        this.cooldown = 2000;
        this.lastShot = Date.now();
        this.projSpeed = 250;
        this.projPierce = 1;
        this.projDamage = 1;
        this.colour = "#0d0";
        this.cost = 0;
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
    update(deltaTime) {
        const now = Date.now();
        const elapsedTime = now - this.lastShot;
        if (elapsedTime < this.cooldown)
            return;
        let closestEnemy = null;
        let highestPathProgress = -1;
        let closestDistToNext = Infinity;
        for (const e of enemies) {
            const r = e.effectiveRadius;
            if (e.x + r >= 0 &&
                e.x - r <= canvas.width &&
                e.y + r >= 0 &&
                e.y - r <= canvas.height) {
                const dist = distance(e.x, e.y, this.x, this.y);
                if (dist <= this.radius + r) {
                    const pathProgress = e.pathProgress;
                    const distToNext = distance(e.x, e.y, e.currentPath.x, e.currentPath.y);
                    if (pathProgress > highestPathProgress ||
                        (pathProgress === highestPathProgress &&
                            distToNext < closestDistToNext)) {
                        highestPathProgress = pathProgress;
                        closestDistToNext = distToNext;
                        closestEnemy = e;
                    }
                }
            }
        }
        if (closestEnemy) {
            const proj = new Projectile(this.x, this.y, new Shape("circle", 12.5), this, closestEnemy.position);
            projectiles.push(proj);
            this.lastShot = now;
        }
    }
    static parse(data) {
        const tower = new Tower(-1, -1);
        tower.shape = new Shape(data.shape, data.diameter);
        tower.colour = data.colour;
        tower.radius = data.radius;
        tower.cooldown = data.cooldown;
        tower.projSpeed = data.projectile.speed;
        tower.projPierce = data.projectile.pierce;
        tower.projDamage = data.projectile.damage;
        tower.cost = data.cost;
        return tower;
    }
}
class Enemy extends Entity {
    constructor(x, y) {
        super(x, y, new Shape("circle", 37.5));
        this.colour = "#faa";
        this.speed = 100;
        this.hp = 1;
        this.pathIndex = 0;
        this.pathProgress = 0;
    }
    update(deltaTime) {
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
    static parse(data) {
        const enemy = new Enemy(-1, -1);
        enemy.hp = data.hp;
        enemy.shape = new Shape(data.shape, data.diameter);
        enemy.colour = data.colour;
        return enemy;
    }
}
class Projectile extends Entity {
    constructor(x, y, shape, parent, targetPoint) {
        super(x, y, shape);
        this.hit = new Set();
        this.speed = 250;
        this.hp = 1;
        this.damage = 1;
        this.parent = parent;
        this.colour = parent.colour;
        this.speed = parent.projSpeed;
        this.hp = parent.projPierce;
        this.damage = parent.projDamage;
        const dx = targetPoint.x - this.x;
        const dy = targetPoint.y - this.y;
        this.angle = Math.atan2(dy, dx);
    }
    update(deltaTime) {
        const prevX = this.x;
        const prevY = this.y;
        super.update(deltaTime);
        const hitEnemies = [];
        for (const e of enemies) {
            if (this.hit.has(e))
                continue;
            const r = e.effectiveRadius;
            const dist = distance(e.x, e.y, this.x, this.y);
            if (dist <= this.shape.diameter / 2 + r) {
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
            if (enemy.hp <= 0)
                removeFromArray(enemies, enemy);
            this.hit.add(enemy);
            if (this.hit.size >= this.hp) {
                removeFromArray(projectiles, this);
                break;
            }
        }
        if (this.isOffScreen())
            removeFromArray(projectiles, this);
    }
}
//
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, diameter) {
    const radius = diameter / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return false;
    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}
function lineIntersectsAABB(x1, y1, x2, y2, cx, cy, diameter) {
    function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0)
            return false;
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    }
    const radius = diameter / 2;
    const minX = cx - radius;
    const maxX = cx + radius;
    const minY = cy - radius;
    const maxY = cy + radius;
    const edges = [
        [minX, minY, maxX, minY],
        [minX, maxY, maxX, maxY],
        [minX, minY, minX, maxY],
        [maxX, minY, maxX, maxY],
    ];
    for (const [x3, y3, x4, y4] of edges)
        if (lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4))
            return true;
    if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY)
        return true;
    if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY)
        return true;
    return false;
}
function distanceToSegment(px, py, x1, y1, x2, y2) {
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
//
function canvasPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const mouseY = (event.clientY - rect.top) * scaleY;
    return { x: mouseX, y: mouseY };
}
function placeTower(event) {
    updateMouse(event);
    const tower = Tower.parse(towerData[towerIndex]);
    if (tower.cost > money)
        return;
    tower.x = mouse.x;
    tower.y = mouse.y;
    for (const path of paths) {
        for (let i = 0; i < path.points.length - 1; i++) {
            const a = path.points[i];
            const b = path.points[i + 1];
            const dist = distanceToSegment(tower.x, tower.y, a.x, a.y, b.x, b.y);
            const combinedRadius = tower.shape.effectiveRadius + path.diameter / 2;
            if (dist < combinedRadius)
                return;
        }
    }
    for (const t of towers) {
        const minDist = tower.shape.effectiveRadius + t.shape.effectiveRadius;
        if (distance(tower.x, tower.y, t.x, t.y) < minDist)
            return;
    }
    if (tower.x - tower.shape.diameter / 2 < 0 &&
        tower.x + tower.shape.diameter / 2 > canvas.width &&
        tower.y - tower.shape.diameter / 2 < 0 &&
        tower.y + tower.shape.diameter / 2 > canvas.height)
        return;
    money -= tower.cost;
    towers.push(tower);
    updateMouse(event);
}
function deleteTower(event) {
    event.preventDefault();
    updateMouse(event);
    if (hoveredTower) {
        removeFromArray(towers, hoveredTower);
        money += hoveredTower.cost;
    }
    updateMouse(event);
}
function updateMouse(event) {
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
function update() {
    if (document.visibilityState === "hidden")
        return;
    const now = Date.now();
    const deltaTime = (now - lastUpdate) / updateDelay;
    lastUpdate = now;
    enemyTimer += updateDelay * deltaTime;
    if (enemyTimer >= spawnDelay) {
        enemyTimer = 0;
        spawnEnemy();
    }
    for (const t of towers)
        t.update(deltaTime);
    for (const p of projectiles)
        p.update(deltaTime);
    for (const e of enemies)
        e.update(deltaTime);
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
    }
    else
        clearInterval(updateLoopId);
}
function removeFromArray(array, item) {
    const index = array.indexOf(item);
    if (index > -1) {
        array.splice(index, 1);
    }
}
async function JSONLoad(path) {
    try {
        const res = await fetch(path);
        const data = await res.json();
        return data;
    }
    catch (err) {
        console.error("Failed to load JSON:", err);
        return null;
    }
}
//
function draw() {
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
    for (const p of projectiles)
        p.draw();
    for (const t of towers)
        t.draw(hoveredTower === t);
    for (const e of enemies)
        e.draw();
    if (shiftDown) {
        const tower = Tower.parse(towerData[towerIndex]);
        tower.x = mouse.x;
        tower.y = mouse.y;
        ctx.save();
        ctx.globalAlpha = 1 / 3;
        tower.draw(true);
        ctx.restore();
    }
    moneyDiv.textContent = `\$${money}`;
}
//
function loop() {
    draw();
    requestAnimationFrame(loop);
}
//
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const updateDelay = 25;
const towers = [];
const enemies = [];
const projectiles = [];
const paths = await JSONLoad("src/data/paths.json");
const towerData = await JSONLoad("src/data/towers.json");
const enemyData = await JSONLoad("src/data/enemies.json");
const controlsDiv = document.getElementById("controls");
const moneyDiv = document.getElementById("money");
let lastUpdate = Date.now();
let updateLoopId = setInterval(update, updateDelay);
let mouse = { x: 0, y: 0 };
let hoveredTower = null;
let enemyTimer = 0;
let spawnDelay = 1000;
let pathIndex = 0;
let towerIndex = 0;
let enemyIndex = 0;
let selectedButton = null;
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
        if (selectedButton)
            selectedButton.classList.remove("selected");
        selectedButton = button;
        button.classList.add("selected");
        towerIndex = i;
    };
    const miniCanvas = document.createElement("canvas");
    miniCanvas.width = 40;
    miniCanvas.height = 40;
    const miniCtx = miniCanvas.getContext("2d");
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
    if (event.code === "ShiftLeft")
        shiftDown = true;
});
document.addEventListener("keyup", (event) => {
    if (event.code === "ShiftLeft")
        shiftDown = false;
});
canvas.addEventListener("mouseenter", updateMouse);
loop();
export {};
