import type { GridDefinition, SimulationFrame } from "../types/simulation";

interface Particle {
  x: number;
  y: number;
  age: number;
}

function reset(particle: Particle, width: number, height: number): void {
  particle.x = Math.random() * width;
  particle.y = Math.random() * height;
  particle.age = 40 + Math.random() * 100;
}

export function createWindAnimator(
  canvas: HTMLCanvasElement,
  grid: GridDefinition,
  frame: SimulationFrame,
): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => undefined;
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const particles = Array.from({ length: Math.max(45, Math.floor(width / 9)) }, () => ({
    x: 0,
    y: 0,
    age: 0,
  }));
  particles.forEach((particle) => reset(particle, width, height));

  let animationFrame = 0;
  const draw = () => {
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = "rgba(236, 250, 239, 0.52)";
    const columns = grid.lon.length;
    const rows = grid.lat.length;

    for (const particle of particles) {
      const column = Math.min(columns - 1, Math.max(0, Math.floor((particle.x / width) * columns)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor((particle.y / height) * rows)));
      const index = row * columns + column;
      const u = frame.fields.u10m[index] ?? 0;
      const v = frame.fields.v10m[index] ?? 0;
      const nextX = particle.x + u * 0.22;
      const nextY = particle.y - v * 0.22;

      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.lineTo(nextX, nextY);
      context.stroke();

      particle.x = nextX;
      particle.y = nextY;
      particle.age -= 1;
      if (
        particle.age <= 0 ||
        particle.x < 0 ||
        particle.x > width ||
        particle.y < 0 ||
        particle.y > height
      ) {
        reset(particle, width, height);
      }
    }
    animationFrame = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(animationFrame);
}
