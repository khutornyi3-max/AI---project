import type { DecisionRecord } from '../types/decision';
import { calculateDecisionBalanceSummary, clamp } from './decisionMath';

export interface Scene3DOptionColumn {
  optionId: string;
  name: string;
  compositeScore: number; // 0..100
  prosConsPercent: number; // 0..100
  criteriaPercent: number; // 0..100
  proWeight: number;
  conWeight: number;
  towerHeight: number; // world meters (0.45..2.85)
  proSegmentHeight: number;
  conSegmentHeight: number;
  xPosition: number;
  isLeader: boolean;
  isChosen: boolean;
}

export interface Scene3DBalanceModel {
  columns: Scene3DOptionColumn[];
  /** Tilt angle of the sculptural balance beam in radians (-0.28..0.28). */
  beamTiltRad: number;
  /** Vertical offset of the left pan relative to center (-0.42..0.42). */
  leftPanOffsetY: number;
  /** Vertical offset of the right pan relative to center (-0.42..0.42). */
  rightPanOffsetY: number;
  leftOptionName: string;
  rightOptionName: string;
  leftScore: number;
  rightScore: number;
  leaderName: string | null;
  leadMargin: number;
  isTie: boolean;
}

/**
 * Computes deterministic sculptural 3D balance scale kinematics and option
 * monolith proportions from a DecisionRecord.
 */
export function computeScene3DBalanceModel(
  decision: DecisionRecord,
): Scene3DBalanceModel {
  const summary = calculateDecisionBalanceSummary(decision);
  const options = summary.options;
  const count = options.length;

  // Spread columns symmetrically along the X axis on the architectural plinth
  const spacing = count <= 2 ? 2.5 : count === 3 ? 2.05 : 1.72;
  const startX = count > 0 ? -((count - 1) * spacing) / 2 : 0;

  const columns: Scene3DOptionColumn[] = options.map((opt, idx) => {
    const score = clamp(opt.compositeScore, 0, 100);
    const towerHeight = Number((0.45 + (score / 100) * 2.4).toFixed(3));
    const totalArgs = Math.max(1, opt.proWeight + opt.conWeight);
    const proRatio = clamp(opt.proWeight / totalArgs, 0.15, 0.85);
    const proSegmentHeight = Number((towerHeight * proRatio).toFixed(3));
    const conSegmentHeight = Number(
      Math.max(0.12, towerHeight - proSegmentHeight).toFixed(3),
    );

    return {
      optionId: opt.optionId,
      name: opt.optionName,
      compositeScore: score,
      prosConsPercent: opt.prosConsPercent,
      criteriaPercent: opt.criteriaPercent,
      proWeight: opt.proWeight,
      conWeight: opt.conWeight,
      towerHeight,
      proSegmentHeight,
      conSegmentHeight,
      xPosition: Number((startX + idx * spacing).toFixed(3)),
      isLeader: opt.isLeader,
      isChosen: decision.chosenOptionId === opt.optionId,
    };
  });

  // Top two contenders drive the sculptural balance scale pans
  const ranked = [...columns].sort(
    (a, b) => b.compositeScore - a.compositeScore || b.criteriaPercent - a.criteriaPercent,
  );

  const leftCol = columns[0] ?? null;
  const rightCol =
    columns.length >= 2
      ? columns[1]
      : ranked[1] ?? leftCol;

  const leftScore = leftCol?.compositeScore ?? 50;
  const rightScore = rightCol?.compositeScore ?? 50;

  // Positive delta (left heavier/stronger) tilts left side DOWN (positive Z rotation in Three.js)
  const deltaNormalized = clamp((leftScore - rightScore) / 50, -1, 1);
  const maxTiltRad = 0.24;
  const beamTiltRad = Number((deltaNormalized * maxTiltRad).toFixed(4));

  const beamHalfSpan = 1.65;
  const leftPanOffsetY = Number((-Math.sin(beamTiltRad) * beamHalfSpan).toFixed(4));
  const rightPanOffsetY = Number((Math.sin(beamTiltRad) * beamHalfSpan).toFixed(4));

  return {
    columns,
    beamTiltRad,
    leftPanOffsetY,
    rightPanOffsetY,
    leftOptionName: leftCol?.name ?? 'Варіант A',
    rightOptionName: rightCol?.name ?? 'Варіант B',
    leftScore,
    rightScore,
    leaderName: summary.leaderName,
    leadMargin: summary.leadMargin,
    isTie: summary.isTie,
  };
}
