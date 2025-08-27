/* eslint-disable prefer-const */
import { BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import { Pool, Token } from "../generated/schema";
import { ZERO_BD } from "./constants";

export class DeviationThresholds {
  static EXTREME: BigDecimal = BigDecimal.fromString("30");
  static SUSPICIOUS: BigDecimal = BigDecimal.fromString("15");
  static NORMAL: BigDecimal = BigDecimal.fromString("5");
}

export class LiquidityImpactThresholds {
  static HIGH: BigDecimal = BigDecimal.fromString("0.1");
  static MEDIUM: BigDecimal = BigDecimal.fromString("0.05");
  static LOW: BigDecimal = BigDecimal.fromString("0.01");
}

export class AttackSeverity {
  static NONE: string = "NONE";
  static LOW: string = "LOW";
  static MEDIUM: string = "MEDIUM";
  static HIGH: string = "HIGH";
  static CRITICAL: string = "CRITICAL";
}

export class SandwichAttackResult {
  isDetected: boolean;
  severity: string;
  deviation: BigDecimal;
  liquidityImpact: BigDecimal;
}

export function detectSandwichAttack(
  pool: Pool,
  token: Token,
  previousPrice: BigDecimal,
  currentPrice: BigDecimal,
  swapAmount: BigDecimal,
  blockNumber: BigInt
): SandwichAttackResult {
  let result: SandwichAttackResult = {
    isDetected: false,
    severity: AttackSeverity.NONE,
    deviation: ZERO_BD,
    liquidityImpact: ZERO_BD
  };

  result.deviation = calculateDeviation(currentPrice, previousPrice);
  result.liquidityImpact = calculateLiquidityImpact(pool, token, swapAmount);
  result.severity = determineSeverity(result.deviation, result.liquidityImpact);
  
  if (result.severity != AttackSeverity.NONE) {
    result.isDetected = true;
    logAttackDetection(token, result, blockNumber);
  }
  
  return result;
}

function calculateDeviation(currentPrice: BigDecimal, previousPrice: BigDecimal): BigDecimal {
  if (previousPrice.equals(ZERO_BD) || currentPrice.equals(ZERO_BD)) {
    return ZERO_BD;
  }
  
  return currentPrice
    .minus(previousPrice)
    .div(previousPrice)
    .times(BigDecimal.fromString("100"))
    .abs();
}

function calculateLiquidityImpact(pool: Pool, token: Token, swapAmount: BigDecimal): BigDecimal {
  let poolLiquidity = ZERO_BD;
  
  if (pool.token0 == token.id && pool.totalValueLockedToken0.gt(ZERO_BD)) {
    poolLiquidity = pool.totalValueLockedToken0;
  } else if (pool.token1 == token.id && pool.totalValueLockedToken1.gt(ZERO_BD)) {
    poolLiquidity = pool.totalValueLockedToken1;
  }
  
  if (poolLiquidity.equals(ZERO_BD)) {
    return ZERO_BD;
  }
  
  return swapAmount.abs().div(poolLiquidity);
}

function determineSeverity(deviation: BigDecimal, liquidityImpact: BigDecimal): string {
  if (deviation.gt(DeviationThresholds.EXTREME) && 
      liquidityImpact.gt(LiquidityImpactThresholds.HIGH)) {
    return AttackSeverity.CRITICAL;
  }
  if (deviation.gt(DeviationThresholds.EXTREME) || 
      liquidityImpact.gt(BigDecimal.fromString("0.2"))) {
    return AttackSeverity.HIGH;
  }
  if (deviation.gt(DeviationThresholds.SUSPICIOUS) && 
      liquidityImpact.gt(LiquidityImpactThresholds.MEDIUM)) {
    return AttackSeverity.MEDIUM;
  }
  if (deviation.gt(DeviationThresholds.SUSPICIOUS) || 
      liquidityImpact.gt(LiquidityImpactThresholds.MEDIUM)) {
    return AttackSeverity.LOW;
  }
  
  return AttackSeverity.NONE;
}

function logAttackDetection(
  token: Token,
  result: SandwichAttackResult,
  blockNumber: BigInt
): void {
  log.warning(
    "Sandwich attack detected - Token: {}, Block: {}, Severity: {}, Deviation: {}%, Impact: {}%",
    [
      token.id,
      blockNumber.toString(),
      result.severity,
      result.deviation.toString(),
      result.liquidityImpact.times(BigDecimal.fromString("100")).toString()
    ]
  );
}

export function applyPriceAdjustment(
  previousPrice: BigDecimal,
  currentPrice: BigDecimal,
  detectionResult: SandwichAttackResult
): BigDecimal {
  if (detectionResult.severity == AttackSeverity.CRITICAL || 
      detectionResult.severity == AttackSeverity.HIGH) {
    return previousPrice;
  } else if (detectionResult.severity == AttackSeverity.MEDIUM) {
    return calculateWeightedAverage(previousPrice, currentPrice, BigDecimal.fromString("0.7"));
  } else if (detectionResult.severity == AttackSeverity.LOW) {
    return calculateWeightedAverage(previousPrice, currentPrice, BigDecimal.fromString("0.3"));
  }
  
  return currentPrice;
}

function calculateWeightedAverage(
  price1: BigDecimal,
  price2: BigDecimal,
  weight1: BigDecimal
): BigDecimal {
  let weight2 = BigDecimal.fromString("1").minus(weight1);
  return price1.times(weight1).plus(price2.times(weight2));
}

export function hasSpecialCaseFix(
  token: Token,
  blockNumber: BigInt
): boolean {
  // WBTC at block 18450862
  if (blockNumber.equals(BigInt.fromI32(18450862)) &&
      token.id == "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599") {
    return true;
  }
  return false;
}

export function applySpecialCaseFix(
  token: Token,
  blockNumber: BigInt,
  previousPrice: BigDecimal,
  currentPrice: BigDecimal
): BigDecimal {
  if (blockNumber.equals(BigInt.fromI32(18450862)) &&
      token.id == "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599") {
    log.warning("Applying WBTC special case fix at block 18450862", []);
    return previousPrice;
  }
  
  return currentPrice;
}