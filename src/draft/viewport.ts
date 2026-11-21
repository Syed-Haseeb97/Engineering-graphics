import type { Point2D, ViewportTransform } from './types';

/** Convert a world point in mm to screen coordinates in pixels. */
export function worldToScreen(p: Point2D, vp: ViewportTransform): { x: number; y: number } {
  return {
    x: vp.panX + p.x * vp.scale,
    y: vp.panY - p.y * vp.scale, // Math Y up: larger Y maps to smaller screen Y
  };
}

/** Convert screen pixel coordinates to a world point in mm. */
export function screenToWorld(s: { x: number; y: number }, vp: ViewportTransform): Point2D {
  return {
    x: (s.x - vp.panX) / vp.scale,
    y: (vp.panY - s.y) / vp.scale,
  };
}

/**
 * Manage 2D drafting viewport transform with pan and zoom.
 */
export class DraftViewport {
  private _scale = 2.0; // 2 pixels per millimetre default
  private _panX = 300;
  private _panY = 300;

  constructor(initialScale = 2.0, initialPanX = 300, initialPanY = 300) {
    this._scale = initialScale;
    this._panX = initialPanX;
    this._panY = initialPanY;
  }

  public get transform(): ViewportTransform {
    return {
      scale: this._scale,
      panX: this._panX,
      panY: this._panY,
    };
  }

  public get scale(): number {
    return this._scale;
  }

  public get panX(): number {
    return this._panX;
  }

  public get panY(): number {
    return this._panY;
  }

  public panBy(dxPx: number, dyPx: number): void {
    this._panX += dxPx;
    this._panY += dyPx;
  }

  public zoomAt(cursorScreenX: number, cursorScreenY: number, factor: number): void {
    const minScale = 0.1; // 1 mm = 0.1 px (zoomed way out)
    const maxScale = 50.0; // 1 mm = 50 px (extreme zoom in)

    const newScale = Math.min(maxScale, Math.max(minScale, this._scale * factor));
    if (Math.abs(newScale - this._scale) < 1e-6) return;

    // Zoom centered on cursor position:
    // Screen = pan + world * scale
    // World under cursor: (cursor - pan) / scale
    const worldUnderCursorX = (cursorScreenX - this._panX) / this._scale;
    const worldUnderCursorY = (this._panY - cursorScreenY) / this._scale;

    this._scale = newScale;
    this._panX = cursorScreenX - worldUnderCursorX * this._scale;
    this._panY = cursorScreenY + worldUnderCursorY * this._scale;
  }

  public setCenter(worldX: number, worldY: number, screenW: number, screenH: number): void {
    this._panX = screenW / 2 - worldX * this._scale;
    this._panY = screenH / 2 + worldY * this._scale;
  }
}
