-- CreateEnum
CREATE TYPE "InviteType" AS ENUM ('INVITE', 'JOIN_REQUEST');

-- AlterTable
ALTER TABLE "AllianceInvite" ADD COLUMN     "type" "InviteType" NOT NULL DEFAULT 'INVITE';
