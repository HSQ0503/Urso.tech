export type SignatureDrawing = {
  strokes: number[][][];
  width: number;
  height: number;
};

export function validSignature(value: unknown): value is SignatureDrawing {
  if (!value || typeof value !== "object") return false;
  const drawing = value as SignatureDrawing;
  if (
    drawing.width !== 600 ||
    drawing.height !== 180 ||
    !Array.isArray(drawing.strokes) ||
    drawing.strokes.length > 100
  )
    return false;
  let points = 0;
  for (const stroke of drawing.strokes) {
    if (!Array.isArray(stroke)) return false;
    for (const point of stroke) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(Number.isFinite) ||
        point[0] < 0 ||
        point[0] > 600 ||
        point[1] < 0 ||
        point[1] > 180
      )
        return false;
      if (++points > 5000) return false;
    }
  }
  return points >= 5;
}
