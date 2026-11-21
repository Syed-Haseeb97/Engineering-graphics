/**
 * A2 Engineering Drawing Sheet Types & Standards
 *
 * Conforms to ISO 5457 (Drawing Sheet Sizes & Layout), ISO 7200 (Title Blocks),
 * ISO 5456-2 (First-Angle Projection Symbol), and ISO 128 / BIS SP 46 (Technical Line Types).
 * All measurements are strictly in millimetres (mm).
 */

import type { DraftEntity } from '../draft/types';

/** Standard ISO A2 trimmed sheet dimensions in mm. */
export const SHEET_WIDTH_MM = 594;
export const SHEET_HEIGHT_MM = 420;

/** Margins per ISO 5457 / BIS SP 46. Left margin is 20 mm for binding/filing. */
export const MARGIN_LEFT_MM = 20;
export const MARGIN_RIGHT_MM = 10;
export const MARGIN_TOP_MM = 10;
export const MARGIN_BOTTOM_MM = 10;

/** Inner border bounding rectangle in sheet millimetres. */
export const BORDER_X_MIN = MARGIN_LEFT_MM; // 20
export const BORDER_Y_MIN = MARGIN_TOP_MM; // 10
export const BORDER_X_MAX = SHEET_WIDTH_MM - MARGIN_RIGHT_MM; // 584
export const BORDER_Y_MAX = SHEET_HEIGHT_MM - MARGIN_BOTTOM_MM; // 410

/** Title block dimensions per ISO 7200 / BIS SP 46. */
export const TITLE_BLOCK_WIDTH = 180;
export const TITLE_BLOCK_HEIGHT = 65;

/** Problem statement block default height when placed above title block. */
export const STATEMENT_BLOCK_HEIGHT = 60;

/** Standard engineering drawing line weights in mm (ISO 128 / BIS SP 46). */
export const LINE_WEIGHTS = {
  sheetBorder: 0.7,
  titleOuter: 0.5,
  titleInner: 0.25,
  visible: 0.5,
  hidden: 0.35,
  centre: 0.2,
  thin: 0.2,
  dimension: 0.2,
} as const;

/** Standard drawing scales per ISO 5455 / BIS SP 46. */
export interface ScaleRatio {
  readonly ratio: number;
  readonly label: string;
}

export const STANDARD_SCALES: readonly ScaleRatio[] = [
  { ratio: 2.0, label: '2:1' },
  { ratio: 1.0, label: '1:1' },
  { ratio: 0.5, label: '1:2' },
  { ratio: 0.4, label: '1:2.5' },
  { ratio: 0.2, label: '1:5' },
  { ratio: 0.1, label: '1:10' },
  { ratio: 0.05, label: '1:20' },
];

/** Title block metadata fields. */
export interface TitleBlockData {
  readonly name: string;
  readonly rollNo: string;
  readonly section: string;
  readonly sheetNo: string;
  readonly problemId: string;
  readonly date: string;
  readonly scale?: string;
  readonly title?: string;
  readonly institution?: string;
}

/** Configuration options for sheet layout and plotting. */
export interface SheetLayoutOptions {
  readonly metadata?: Partial<TitleBlockData>;
  readonly statementText?: string;
  readonly parameters?: Record<string, string | number>;
  readonly includeStatement?: boolean;
  readonly fitMode?: 'auto' | '1:1' | 'manual';
  readonly targetScale?: number;
  readonly blank?: boolean;
}

/** Statement block layout geometry. */
export interface StatementBlockLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly formattedParams?: string;
}

/** Placed sheet model ready for SVG or PDF rendering. */
export interface PlacedSheetModel {
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly border: {
    readonly xMin: number;
    readonly yMin: number;
    readonly xMax: number;
    readonly yMax: number;
  };
  readonly titleBlock: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly statementBlock?: StatementBlockLayout;
  readonly scale: ScaleRatio;
  readonly offset: {
    readonly x: number;
    readonly y: number;
  };
  readonly placedEntities: readonly DraftEntity[];
  readonly metadata: Required<TitleBlockData>;
  readonly firstAngleSymbol: boolean;
  readonly blank: boolean;
}
