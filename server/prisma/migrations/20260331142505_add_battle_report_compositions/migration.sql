/*
  Warnings:

  - Added the required column `attackingUnits` to the `BattleReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `defendingUnits` to the `BattleReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable (add with defaults for existing rows, then make non-null)
ALTER TABLE "BattleReport" ADD COLUMN "attackingUnits" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "defendingUnits" JSONB NOT NULL DEFAULT '{}';
