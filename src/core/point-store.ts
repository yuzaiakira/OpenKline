import type { LinePoint, VolumePoint } from "../types.js";

export type TimeValuePoint = LinePoint | VolumePoint;

export class PointValidationError extends Error {
  public readonly index: number;

  public constructor(index: number, reason: string) {
    super(`Invalid point at index ${index}: ${reason}`);
    this.name = "PointValidationError";
    this.index = index;
  }
}

export function validatePoint(point: TimeValuePoint, index = 0): void {
  if (!Number.isFinite(point.time) || point.time < 0 || !Number.isInteger(point.time)) {
    throw new PointValidationError(index, "time must be a non-negative integer in milliseconds");
  }
  if (!Number.isFinite(point.value)) {
    throw new PointValidationError(index, "value must be finite");
  }
  if ("color" in point && point.color !== undefined && point.color.length === 0) {
    throw new PointValidationError(index, "color must not be empty");
  }
}

export function validatePoints(points: readonly TimeValuePoint[]): void {
  let previousTime: number | undefined;
  points.forEach((point, index) => {
    validatePoint(point, index);
    if (previousTime !== undefined && point.time <= previousTime) {
      throw new PointValidationError(index, "timestamps must be strictly increasing");
    }
    previousTime = point.time;
  });
}

export class PointStore<T extends TimeValuePoint = TimeValuePoint> {
  private points: T[] = [];

  public setData(points: readonly T[]): void {
    validatePoints(points);
    this.points = points.map((point) => ({ ...point }));
  }

  public update(point: T): void {
    validatePoint(point, this.points.length);
    const index = this.findInsertionIndex(point.time);
    const current = this.points[index];
    if (current !== undefined && current.time === point.time) {
      this.points[index] = { ...point };
      return;
    }
    this.points.splice(index, 0, { ...point });
  }

  public get length(): number {
    return this.points.length;
  }

  public getAll(): T[] {
    return this.points.map((point) => ({ ...point }));
  }

  public getRangeByTime(from: number, to: number): T[] {
    return this.points.slice(this.findInsertionIndex(from), this.findInsertionIndex(to)).map((point) => ({ ...point }));
  }

  public getTimes(): number[] {
    return this.points.map((point) => point.time);
  }

  private findInsertionIndex(time: number): number {
    let low = 0;
    let high = this.points.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const point = this.points[middle];
      if (point === undefined || point.time >= time) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    return low;
  }
}

