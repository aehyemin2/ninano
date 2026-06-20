export function drawMapOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.save();
  context.strokeStyle = "rgba(224, 241, 237, 0.16)";
  context.lineWidth = 1;
  context.setLineDash([3, 5]);

  for (let column = 1; column < 6; column += 1) {
    const x = (width / 6) * column;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let row = 1; row < 4; row += 1) {
    const y = (height / 4) * row;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.setLineDash([]);
  context.strokeStyle = "rgba(226, 238, 224, 0.62)";
  context.fillStyle = "rgba(6, 19, 27, 0.5)";
  context.lineWidth = 1.25;

  // Deliberately simplified coast silhouettes; the production GeoJSON can replace it.
  const coastlines: Array<Array<[number, number]>> = [
    [[0.02, 0.03], [0.08, 0.16], [0.06, 0.31], [0.12, 0.46], [0.08, 0.65], [0.15, 0.84], [0.1, 0.98]],
    [[0.86, 0.02], [0.91, 0.12], [0.94, 0.26], [0.91, 0.4], [0.96, 0.54], [0.93, 0.7], [0.98, 0.87]],
    [[0.17, 0.63], [0.2, 0.67], [0.22, 0.73], [0.18, 0.78], [0.15, 0.72]],
  ];
  for (const coastline of coastlines) {
    context.beginPath();
    coastline.forEach(([x, y], index) => {
      const action = index === 0 ? "moveTo" : "lineTo";
      context[action](x * width, y * height);
    });
    context.stroke();
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.42)";
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();
  context.restore();
}
