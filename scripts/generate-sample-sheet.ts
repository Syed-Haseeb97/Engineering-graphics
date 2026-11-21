/**
 * Sample Generator for A2 Drawing Sheets & Hybrid Assessments
 *
 * Generates sample ISO A2 vector PDF and SVG deliverables on Drive D:
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  layoutSheet,
  createHybridAssessmentSheet,
  exportSheetToSVG,
  exportSheetToPDF,
  type TitleBlockData,
} from '../src/sheet/index';
import type { DraftEntity, LineEntity, CircleEntity, DimensionEntity } from '../src/draft/types';

const distDir = path.resolve('D:/projects/engineering graphics/dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const sampleMetadata: TitleBlockData = {
  name: 'Devanagari Student',
  rollNo: '22BME10078',
  section: 'Section B',
  sheetNo: 'Sheet 03',
  problemId: 'ndbhatt_ch13_prob07_cone',
  date: '2026-10-29',
  scale: '1:1',
  title: 'PROJECTIONS OF SOLIDS - CONE ON GENERATOR',
  institution: 'INDIAN INSTITUTE OF TECHNOLOGY',
};

const sampleStatement =
  'A cone, base 40 mm diameter and axis 60 mm long, has one of its generators on the HP and is inclined at 30° to the VP. Draw the projections of the cone in first-angle projection.';

const sampleParams = {
  baseDiameter: '40 mm',
  axisLength: '60 mm',
  thetaHP: '18.43° (resting on generator)',
  phiVP: '30°',
};

console.log('========================================================================');
console.log('        A2 ENGINEERING DRAWING SHEET & HYBRID ASSESSMENT PLOTTER       ');
console.log('========================================================================');

// 1. Generate Hybrid Assessment Sheet ("Print to Paper" Mode)
console.log('\n[1/2] Generating Hybrid Assessment Sheet ("Print to Paper" Mode)...');
const hybridModel = createHybridAssessmentSheet(sampleMetadata, sampleStatement, sampleParams);
const hybridPdfBytes = exportSheetToPDF(hybridModel);
const hybridSvgString = exportSheetToSVG(hybridModel);

const hybridPdfPath = path.join(distDir, 'sample-hybrid-assessment-A2.pdf');
const hybridSvgPath = path.join(distDir, 'sample-hybrid-assessment-A2.svg');

fs.writeFileSync(hybridPdfPath, hybridPdfBytes);
fs.writeFileSync(hybridSvgPath, hybridSvgString, 'utf-8');

console.log(`  ✓ Hybrid Assessment PDF: ${hybridPdfPath} (${(hybridPdfBytes.length / 1024).toFixed(2)} KB)`);
console.log(`  ✓ Hybrid Assessment SVG: ${hybridSvgPath} (${(hybridSvgString.length / 1024).toFixed(2)} KB)`);
console.log(`  Mode: Blank Drawing Canvas for Student Hand-Drafting (Mini-Drafter / Instruments)`);
console.log(`  Sheet Size: 594 mm x 420 mm (ISO A2 Landscape)`);
console.log(`  Filing Margin: 20 mm left, 10 mm top/right/bottom`);
console.log(`  Title Block: Pre-filled with Student Roll No, Name, Sec, Date, First-Angle Symbol`);
console.log(`  Statement Box: Pre-printed problem statement and unique student parameters`);

// 2. Generate Completed Student CAD Sheet (Populated Entities Mode)
console.log('\n[2/2] Generating Populated Student Drawing Sheet...');
const sampleEntities: DraftEntity[] = [
  // Front view elevation
  { id: 'l1', type: 'line', lineType: 'continuous', p1: { x: 30, y: 15 }, p2: { x: 90, y: 15 } } as LineEntity,
  { id: 'l2', type: 'line', lineType: 'continuous', p1: { x: 30, y: 15 }, p2: { x: 60, y: 75 } } as LineEntity,
  { id: 'l3', type: 'line', lineType: 'continuous', p1: { x: 90, y: 15 }, p2: { x: 60, y: 75 } } as LineEntity,
  // Axis centerline
  { id: 'l_axis', type: 'line', lineType: 'centre', p1: { x: 60, y: 10 }, p2: { x: 60, y: 80 } } as LineEntity,
  // Top view plan (circle)
  { id: 'c1', type: 'circle', lineType: 'continuous', center: { x: 60, y: -45 }, radius: 25 } as CircleEntity,
  // Hidden edge
  { id: 'l_hid', type: 'line', lineType: 'dashed', p1: { x: 45, y: 15 }, p2: { x: 75, y: 15 } } as LineEntity,
  // Thin projector
  { id: 'l_p1', type: 'line', lineType: 'thin', p1: { x: 30, y: 15 }, p2: { x: 30, y: -45 } } as LineEntity,
  { id: 'l_p2', type: 'line', lineType: 'thin', p1: { x: 90, y: 15 }, p2: { x: 90, y: -45 } } as LineEntity,
  // Dimensions
  { id: 'd1', type: 'dimension', dimType: 'linear', lineType: 'thin', p1: { x: 30, y: 15 }, p2: { x: 90, y: 15 }, offset: 12, text: 'Ø 40', value: 40 } as DimensionEntity,
  { id: 'd2', type: 'dimension', dimType: 'linear', lineType: 'thin', p1: { x: 90, y: 15 }, p2: { x: 90, y: 75 }, offset: 15, text: 'h = 60', value: 60 } as DimensionEntity,
];

const drawingModel = layoutSheet(sampleEntities, {
  metadata: sampleMetadata,
  statementText: sampleStatement,
  parameters: sampleParams,
  fitMode: 'auto',
});

const drawingPdfBytes = exportSheetToPDF(drawingModel);
const drawingSvgString = exportSheetToSVG(drawingModel);

const drawingPdfPath = path.join(distDir, 'sample-drawing-sheet-A2.pdf');
const drawingSvgPath = path.join(distDir, 'sample-drawing-sheet-A2.svg');

fs.writeFileSync(drawingPdfPath, drawingPdfBytes);
fs.writeFileSync(drawingSvgPath, drawingSvgString, 'utf-8');

console.log(`  ✓ Drawing Sheet PDF: ${drawingPdfPath} (${(drawingPdfBytes.length / 1024).toFixed(2)} KB)`);
console.log(`  ✓ Drawing Sheet SVG: ${drawingSvgPath} (${(drawingSvgString.length / 1024).toFixed(2)} KB)`);
console.log(`  Placed Scale: ${drawingModel.scale.label} (${drawingModel.placedEntities.length} entities placed)`);
console.log('========================================================================\n');
