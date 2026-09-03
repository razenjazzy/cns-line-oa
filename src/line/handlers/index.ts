/**
 * CommandHandler interface + central registry.
 *
 * Each handler is a self-contained module responsible for a cohesive
 * group of commands. The registry is evaluated in order; the first
 * handler whose match() returns true owns the request.
 *
 * Design adapted from clawframework's skill/tool dispatch pattern
 * (nano_claude.py tool dispatch, claw-code/src/tools.py registry).
 *
 * Adding a new command:
 *   1. Create src/line/handlers/<domain>.ts
 *   2. Export a CommandHandler (or array of them)
 *   3. Import and add to COMMAND_HANDLERS below — done.
 *      No changes to command-router.ts or any other handler file.
 */

import { messagingApi } from '@line/bot-sdk';
import type { CommandReplyContext } from '../command-router';

export type CommandHandler = {
  /** Unique name for logging / debugging */
  name: string;
  /**
   * Returns true if this handler owns the given message.
   * Receives the already-uppercased text for cheap prefix checks.
   */
  match: (upperText: string, ctx: CommandReplyContext) => boolean;
  /** Execute the command and return the reply messages. */
  handle: (ctx: CommandReplyContext) => Promise<messagingApi.Message[]>;
};

// ---------------------------------------------------------------------------
// Registry — order matters; earlier handlers have higher priority.
// ---------------------------------------------------------------------------
import { actionOtpHandlers }  from './action-otp';
import { navigationHandlers } from './navigation';
import { adminHandlers }      from './admin';
import { verificationHandlers } from './verification';
import { languageHandlers }   from './language';
import { helpHandlers }       from './help';
import { commerceHandlers }   from './commerce';
import { quotationHandlers }  from './quotation';
import { salesMessageHandlers } from './sales-message';
import { userDirectoryHandlers } from './user-directory';
import { serviceCatalogHandlers } from './service-catalog-handler';
import { groupBuyHandler }    from './group-buy';
import { privacyHandlers }    from './privacy';
import { feedbackHandlers }   from './feedback';
import { listSkillsHandler, skillsHandler } from './skills';

export const COMMAND_HANDLERS: CommandHandler[] = [
  // Must come first — intercepts a gated quote-mutation command before its
  // real handler runs when the caller's step-up OTP isn't fresh. See
  // src/line/handlers/action-otp.ts.
  ...actionOtpHandlers,
  ...navigationHandlers,
  ...adminHandlers,
  ...verificationHandlers,
  ...languageHandlers,
  ...helpHandlers,
  ...privacyHandlers,
  ...feedbackHandlers,
  ...commerceHandlers,
  ...quotationHandlers,
  ...salesMessageHandlers,
  ...userDirectoryHandlers,
  ...serviceCatalogHandlers,
  groupBuyHandler,
  listSkillsHandler,
  // Markdown skill files (skills/*.md) — always last, so a skill can add a
  // command but can never shadow a built-in one. See src/services/skill-loader.ts.
  skillsHandler,
  // chat-fallback is NOT in this list — command-router calls it explicitly
  // as the last resort after all handlers fail to match.
];
